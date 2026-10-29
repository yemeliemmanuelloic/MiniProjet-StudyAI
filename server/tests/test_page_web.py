"""
Import d'un cours depuis une page web (decision 051).

Aucun test ne sort sur le reseau : la resolution DNS et la requete HTTP sont
remplacees. Ce qui compte ici, ce sont les garde-fous : une adresse interne
ne doit JAMAIS etre lue, meme au bout d'une redirection.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.errors import ErreurApplicative
from app.services import page_web

PARAGRAPHE = "Le protocole TCP garantit la livraison ordonnee des segments grace aux accuses de reception. " * 4

PAGE = f"""<!doctype html><html><head><title>  Cours de reseaux  </title>
<style>body {{ color: red }}</style><script>alert('x')</script></head>
<body><nav><a href="/">Accueil</a> Menu du site</nav><header>Bandeau du site</header>
<main><h1>Le protocole TCP</h1><p>{PARAGRAPHE}</p><ul><li>Fiable</li><li>Oriente connexion</li></ul></main>
<footer>Mentions legales du site</footer></body></html>"""


@pytest.fixture
def reseau(monkeypatch):
    """Un faux Internet : nom -> IP, URL -> (statut, entetes, corps)."""
    dns: dict[str, list[str]] = {"cours.exemple.org": ["93.184.216.34"]}
    pages: dict[str, tuple[int, dict, bytes]] = {}
    demandes: list[str] = []

    def resoudre(hote, port):
        if hote not in dns:
            raise ErreurApplicative("VALIDATION_ERROR", "Ce site est introuvable : verifiez l'adresse.")
        return dns[hote]

    def requete(url):
        demandes.append(url)
        return pages.get(url, (404, {}, b""))

    monkeypatch.setattr(page_web, "_resoudre", resoudre)
    monkeypatch.setattr(page_web, "_requete", requete)
    return dns, pages, demandes


def _importer(client: TestClient, entetes: dict, url: str, **extra):
    return client.post("/api/courses/import-url", headers=entetes, json={"url": url, **extra})


def test_une_page_devient_un_cours(client: TestClient, etudiant: dict, reseau, faux_modele) -> None:
    _, pages, _ = reseau
    pages["https://cours.exemple.org/tcp"] = (200, {"content-type": "text/html; charset=utf-8"}, PAGE.encode())
    r = _importer(client, etudiant, "https://cours.exemple.org/tcp")
    assert r.status_code == 201, r.text
    cours = r.json()["course"]
    assert cours["title"] == "Cours de reseaux"
    contenu = client.get(f"/api/courses/{cours['id']}", headers=etudiant).json()["course"]["content"]
    assert contenu.startswith("Le protocole TCP")
    assert "- Fiable" in contenu
    for parasite in ("Menu du site", "Bandeau", "Mentions legales", "alert", "color: red"):
        assert parasite not in contenu
    assert faux_modele.appels == []


def test_le_titre_saisi_l_emporte(client: TestClient, etudiant: dict, reseau) -> None:
    _, pages, _ = reseau
    pages["https://cours.exemple.org/tcp"] = (200, {"content-type": "text/html"}, PAGE.encode())
    r = _importer(client, etudiant, "https://cours.exemple.org/tcp", title="Mon titre", subject="Reseaux")
    assert r.json()["course"]["title"] == "Mon titre"


@pytest.mark.parametrize(
    "url",
    [
        "ftp://cours.exemple.org/x",
        "file:///etc/passwd",
        "cours.exemple.org/sans-schema",
        "https://user:secret@cours.exemple.org/",
        "https://cours.exemple.org:8080/",
        "http://127.0.0.1/",
        "http://[::1]/",
        "http://10.0.0.5/",
        "http://192.168.1.10/",
        "http://169.254.169.254/latest/meta-data/",
        "http://0.0.0.0/",
    ],
)
def test_adresses_refusees(client: TestClient, etudiant: dict, reseau, url: str) -> None:
    dns, _, demandes = reseau
    for ip in ("127.0.0.1", "::1", "10.0.0.5", "192.168.1.10", "169.254.169.254", "0.0.0.0"):
        dns[ip] = [ip]
    r = _importer(client, etudiant, url)
    assert r.status_code in (400, 422), r.text
    assert demandes == []  # rien n'est parti


def test_un_nom_qui_pointe_vers_le_reseau_interne(client: TestClient, etudiant: dict, reseau) -> None:
    dns, _, demandes = reseau
    dns["interne.exemple.org"] = ["93.184.216.34", "10.1.2.3"]
    assert _importer(client, etudiant, "https://interne.exemple.org/").status_code == 400
    assert demandes == []


def test_une_redirection_vers_le_reseau_interne(client: TestClient, etudiant: dict, reseau) -> None:
    dns, pages, demandes = reseau
    dns["169.254.169.254"] = ["169.254.169.254"]
    pages["https://cours.exemple.org/piege"] = (302, {"location": "http://169.254.169.254/latest/"}, b"")
    r = _importer(client, etudiant, "https://cours.exemple.org/piege")
    assert r.status_code == 400
    assert demandes == ["https://cours.exemple.org/piege"]


def test_trop_de_redirections(client: TestClient, etudiant: dict, reseau) -> None:
    _, pages, _ = reseau
    for i in range(6):
        pages[f"https://cours.exemple.org/{i}"] = (301, {"location": f"/{i + 1}"}, b"")
    assert _importer(client, etudiant, "https://cours.exemple.org/0").status_code == 400


def test_erreur_du_site(client: TestClient, etudiant: dict, reseau) -> None:
    r = _importer(client, etudiant, "https://cours.exemple.org/absente")
    assert r.status_code == 400
    assert "404" in r.json()["error"]["message"]


def test_format_non_pris_en_charge(client: TestClient, etudiant: dict, reseau) -> None:
    _, pages, _ = reseau
    pages["https://cours.exemple.org/image"] = (200, {"content-type": "image/png"}, b"\x89PNG")
    assert _importer(client, etudiant, "https://cours.exemple.org/image").status_code == 400


def test_trop_peu_de_texte(client: TestClient, etudiant: dict, reseau) -> None:
    _, pages, _ = reseau
    pages["https://cours.exemple.org/app"] = (200, {"content-type": "text/html"}, b"<div id='root'></div><script>app()</script>")
    r = _importer(client, etudiant, "https://cours.exemple.org/app")
    assert r.status_code == 400
    assert "copiez-collez" in r.json()["error"]["message"]


def test_texte_brut(client: TestClient, etudiant: dict, reseau) -> None:
    _, pages, _ = reseau
    pages["https://cours.exemple.org/notes.txt"] = (200, {"content-type": "text/plain; charset=utf-8"}, PARAGRAPHE.encode())
    r = _importer(client, etudiant, "https://cours.exemple.org/notes.txt")
    assert r.status_code == 201
    assert r.json()["course"]["title"] == "cours.exemple.org"


def test_le_debit_est_limite(client: TestClient, etudiant: dict, reseau, monkeypatch) -> None:
    from app.routers import courses

    _, pages, _ = reseau
    pages["https://cours.exemple.org/tcp"] = (200, {"content-type": "text/html"}, PAGE.encode())
    monkeypatch.setattr(courses, "PAGES_PAR_MINUTE", 2)
    assert _importer(client, etudiant, "https://cours.exemple.org/tcp").status_code == 201
    assert _importer(client, etudiant, "https://cours.exemple.org/tcp").status_code == 201
    assert _importer(client, etudiant, "https://cours.exemple.org/tcp").status_code == 429


def test_sans_compte(client: TestClient, reseau) -> None:
    assert client.post("/api/courses/import-url", json={"url": "https://cours.exemple.org/tcp"}).status_code == 401


class TestExtraction:
    def test_contenu_principal_prefere(self) -> None:
        texte, titre = page_web.texte_html(PAGE)
        assert titre == "Cours de reseaux"
        assert texte.startswith("Le protocole TCP")

    def test_sans_main_on_garde_le_corps_hors_menus(self) -> None:
        html = f"<body><nav>Menu</nav><div><p>{PARAGRAPHE}</p></div><footer>Pied</footer></body>"
        texte, _ = page_web.texte_html(html)
        assert texte.startswith("Le protocole") and "Menu" not in texte and "Pied" not in texte

    def test_entites_et_espaces(self) -> None:
        texte, _ = page_web.texte_html("<p>Caf&eacute;   &amp;\n  th&eacute;</p>")
        assert texte == "Café & thé"
