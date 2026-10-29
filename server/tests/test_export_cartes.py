"""
Export du jeu de cartes, Anki et PDF (decision 051). Aucun appel au modele.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.services.export_cartes import nom_de_fichier

from .test_api import COURS_COURT


def _cours_avec_cartes(client: TestClient, entetes: dict, titre: str = "Réseaux & Systèmes") -> str:
    cours = client.post("/api/courses", headers=entetes, json={"title": titre, "content": COURS_COURT}).json()["course"]["id"]
    client.post(f"/api/courses/{cours}/quiz", headers=entetes, json={"questionCount": 3})
    client.post(f"/api/courses/{cours}/flashcards", headers=entetes)
    return cours


def test_export_anki(client: TestClient, etudiant: dict, faux_modele) -> None:
    cours = _cours_avec_cartes(client, etudiant)
    appels = len(faux_modele.appels)
    r = client.get(f"/api/courses/{cours}/flashcards/export?format=anki", headers=etudiant)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/plain")
    assert 'filename="cartes-reseaux-systemes.txt"' in r.headers["content-disposition"]
    lignes = r.text.strip().split("\n")
    assert lignes[:3] == ["#separator:tab", "#html:true", "#tags column:3"]
    cartes = [l.split("\t") for l in lignes[3:]]
    assert len(cartes) == 3 and all(len(c) == 3 for c in cartes)
    assert cartes[0][2] == "StudyAI::reseaux-systemes"
    assert "<i>« " in cartes[0][1]  # la citation du cours accompagne le verso
    assert len(faux_modele.appels) == appels


def test_export_pdf(client: TestClient, etudiant: dict, faux_modele) -> None:
    cours = _cours_avec_cartes(client, etudiant)
    r = client.get(f"/api/courses/{cours}/flashcards/export?format=pdf", headers=etudiant)
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content[:5] == b"%PDF-"


def test_sans_cartes_l_export_est_refuse(client: TestClient, etudiant: dict) -> None:
    cours = client.post("/api/courses", headers=etudiant, json={"title": "Vide", "content": COURS_COURT}).json()["course"]["id"]
    assert client.get(f"/api/courses/{cours}/flashcards/export", headers=etudiant).status_code == 400


def test_format_inconnu(client: TestClient, etudiant: dict, faux_modele) -> None:
    cours = _cours_avec_cartes(client, etudiant)
    assert client.get(f"/api/courses/{cours}/flashcards/export?format=docx", headers=etudiant).status_code in (400, 422)


def test_un_autre_etudiant_n_exporte_rien(client: TestClient, etudiant: dict, faux_modele) -> None:
    cours = _cours_avec_cartes(client, etudiant)
    autre = client.post("/api/auth/register", json={"email": "autre@exemple.tn", "password": "motdepasse-solide"})
    entetes = {"Authorization": f"Bearer {autre.json()['token']}"}
    assert client.get(f"/api/courses/{cours}/flashcards/export", headers=entetes).status_code == 403


def test_un_champ_ne_casse_pas_les_colonnes() -> None:
    from app.services.export_cartes import _cellule

    assert _cellule("a\tb\nc <d>") == "a b<br>c &lt;d&gt;"


def test_nom_de_fichier() -> None:
    assert nom_de_fichier("Réseaux & Systèmes") == "reseaux-systemes"
    assert nom_de_fichier("مقدمة") == "cours"
