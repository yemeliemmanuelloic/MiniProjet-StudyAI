"""
Traduction d'un cours (decision 052).

Un NOUVEAU cours est cree, l'original reste intact. Le cours part masque, en
parties sans recouvrement, une par appel ; chaque partie compte dans le quota.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from .test_api import COURS_COURT


def _cours(client: TestClient, entetes: dict, contenu: str = COURS_COURT, titre: str = "Reseaux") -> str:
    return client.post("/api/courses", headers=entetes, json={"title": titre, "content": contenu}).json()["course"]["id"]


def _traduire(client: TestClient, entetes: dict, cours: str, langue: str = "en"):
    return client.post(f"/api/courses/{cours}/translate", headers=entetes, json={"language": langue})


def _contenu(client: TestClient, entetes: dict, cours: str) -> str:
    return client.get(f"/api/courses/{cours}", headers=entetes).json()["course"]["content"]


def test_un_nouveau_cours_est_cree(client: TestClient, etudiant: dict, faux_modele) -> None:
    source = _cours(client, etudiant)
    r = _traduire(client, etudiant, source)
    assert r.status_code == 201, r.text
    nouveau = r.json()["course"]
    assert nouveau["title"] == "Reseaux (English)"
    assert nouveau["id"] != source
    assert _contenu(client, etudiant, nouveau["id"]).startswith("[TRADUIT] ")
    assert _contenu(client, etudiant, source) == COURS_COURT.strip()
    assert len(faux_modele.appels) == 1


def test_arabe(client: TestClient, etudiant: dict, faux_modele) -> None:
    r = _traduire(client, etudiant, _cours(client, etudiant), "ar")
    assert r.json()["course"]["title"] == "Reseaux (العربية)"
    assert "arabe" in faux_modele.appels[0]["system"]


def test_le_cours_part_masque_et_revient_restaure(client: TestClient, etudiant: dict, faux_modele) -> None:
    source = _cours(client, etudiant, COURS_COURT + " Contact : prof.ali@universite.tn.")
    nouveau = _traduire(client, etudiant, source).json()["course"]["id"]
    assert "prof.ali@universite.tn" not in faux_modele.appels[0]["user"]
    assert "prof.ali@universite.tn" in _contenu(client, etudiant, nouveau)


def test_un_cours_long_part_en_parties_sans_recouvrement(client: TestClient, etudiant: dict, faux_modele) -> None:
    paragraphe = "Le noyau ordonnance les processus selon leur priorite et leur etat. " * 20
    contenu = "\n\n".join(f"Partie {i}. {paragraphe}" for i in range(14))  # ~19 000 caracteres
    nouveau = _traduire(client, etudiant, _cours(client, etudiant, contenu)).json()["course"]["id"]
    assert len(faux_modele.appels) == 3
    traduit = _contenu(client, etudiant, nouveau)
    # Chaque partie du cours apparait exactement une fois : pas de recouvrement.
    for i in range(14):
        assert traduit.count(f"Partie {i}.") == 1


def test_un_cours_trop_long_est_refuse_sans_appel(client: TestClient, etudiant: dict, faux_modele) -> None:
    source = _cours(client, etudiant, "Un paragraphe de cours assez long. " * 2000)
    r = _traduire(client, etudiant, source)
    assert r.status_code == 400
    assert faux_modele.appels == []


def test_langue_inconnue(client: TestClient, etudiant: dict) -> None:
    assert _traduire(client, etudiant, _cours(client, etudiant), "de").status_code in (400, 422)


def test_un_autre_etudiant_ne_traduit_rien(client: TestClient, etudiant: dict, faux_modele) -> None:
    source = _cours(client, etudiant)
    autre = client.post("/api/auth/register", json={"email": "autre@exemple.tn", "password": "motdepasse-solide"})
    entetes = {"Authorization": f"Bearer {autre.json()['token']}"}
    assert _traduire(client, entetes, source).status_code == 403
    assert faux_modele.appels == []


def test_chaque_partie_compte_dans_le_quota(client: TestClient, etudiant: dict, faux_modele, monkeypatch) -> None:
    from app.config import parametres

    monkeypatch.setattr(parametres, "MAX_APPELS_MODELE_PAR_MINUTE", 2)
    contenu = "Le noyau ordonnance les processus selon leur priorite. " * 350  # ~3 parties
    r = _traduire(client, etudiant, _cours(client, etudiant, contenu))
    assert r.status_code == 429
    assert faux_modele.appels == []


def test_supprimer_l_original_garde_la_traduction(client: TestClient, etudiant: dict, faux_modele, session_fabrique) -> None:
    from app.models import Traduction

    source = _cours(client, etudiant)
    nouveau = _traduire(client, etudiant, source).json()["course"]["id"]
    client.delete(f"/api/courses/{source}", headers=etudiant)
    assert client.get(f"/api/courses/{nouveau}", headers=etudiant).status_code == 200
    client.delete(f"/api/courses/{nouveau}", headers=etudiant)
    with session_fabrique() as s:
        assert s.query(Traduction).count() == 0


def test_la_consommation_compte_la_traduction(client: TestClient, etudiant: dict, faux_modele) -> None:
    _traduire(client, etudiant, _cours(client, etudiant))
    modules = {m["module"]: m for m in client.get("/api/usage", headers=etudiant).json()["parModule"]}
    assert modules["Traduction"]["calls"] == 1
