"""
Carte mentale (decision 047).

La structure est generee en UN appel, par le meme chemin que la presentation
(masquage du cours entier), validee par son schema, enregistree, et relue sans
appel. Le dessin est fait par le navigateur.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.schemas.llm import CarteMentaleIA

from .test_api import COURS_COURT


def _cours(client: TestClient, entetes: dict, contenu: str = COURS_COURT) -> str:
    r = client.post("/api/courses", headers=entetes, json={"title": "Cours", "content": contenu})
    return r.json()["course"]["id"]


def test_aucune_carte_au_depart_et_sans_appel(client: TestClient, etudiant: dict, faux_modele) -> None:
    cours = _cours(client, etudiant)
    r = client.get(f"/api/courses/{cours}/mindmap", headers=etudiant)
    assert r.status_code == 200
    assert r.json()["mindMap"] is None
    assert faux_modele.appels == []


def test_generer_puis_relire(client: TestClient, etudiant: dict, faux_modele) -> None:
    cours = _cours(client, etudiant)
    r = client.post(f"/api/courses/{cours}/mindmap", headers=etudiant)
    assert r.status_code == 201, r.text
    p = r.json()["mindMap"]
    assert p["payload"]["sujet"] == "Sujet du cours"
    assert len(p["payload"]["branches"]) == 4
    assert p["payload"]["branches"][0]["enfants"][0]["citation"]
    assert len(faux_modele.appels) == 1

    relue = client.get(f"/api/courses/{cours}/mindmap", headers=etudiant).json()["mindMap"]
    assert relue["id"] == p["id"]
    assert len(faux_modele.appels) == 1  # relire ne coute rien


def test_le_cours_part_masque(client: TestClient, etudiant: dict, faux_modele) -> None:
    cours = _cours(client, etudiant, COURS_COURT + " Contact : prof.ali@universite.tn.")
    client.post(f"/api/courses/{cours}/mindmap", headers=etudiant)
    assert "prof.ali@universite.tn" not in faux_modele.appels[0]["user"]


def test_un_autre_etudiant_ne_voit_rien(client: TestClient, etudiant: dict, faux_modele) -> None:
    cours = _cours(client, etudiant)
    client.post(f"/api/courses/{cours}/mindmap", headers=etudiant)
    autre = client.post("/api/auth/register", json={"email": "autre@exemple.tn", "password": "motdepasse-solide"})
    entetes = {"Authorization": f"Bearer {autre.json()['token']}"}
    assert client.get(f"/api/courses/{cours}/mindmap", headers=entetes).status_code == 403
    assert client.post(f"/api/courses/{cours}/mindmap", headers=entetes).status_code == 403


def test_la_generation_compte_dans_le_quota(client: TestClient, etudiant: dict, faux_modele, monkeypatch) -> None:
    from app.config import parametres

    monkeypatch.setattr(parametres, "MAX_APPELS_MODELE_PAR_MINUTE", 1)
    cours = _cours(client, etudiant)
    assert client.post(f"/api/courses/{cours}/mindmap", headers=etudiant).status_code == 201
    assert client.post(f"/api/courses/{cours}/mindmap", headers=etudiant).status_code == 429


def test_supprimer_le_cours_emporte_la_carte(client: TestClient, etudiant: dict, faux_modele, session_fabrique) -> None:
    from app.models import CarteMentale

    cours = _cours(client, etudiant)
    client.post(f"/api/courses/{cours}/mindmap", headers=etudiant)
    client.delete(f"/api/courses/{cours}", headers=etudiant)
    with session_fabrique() as session:
        assert session.query(CarteMentale).count() == 0


class TestSchema:
    idee = {"idee": "Une idee", "citation": "Une citation du cours."}

    def test_une_idee_sans_citation_est_refusee(self) -> None:
        branche = {"idee": "Branche", "enfants": [{"idee": "Sans source"}], "citation": "Une citation du cours."}
        with pytest.raises(ValidationError):
            CarteMentaleIA.model_validate({"sujet": "Cours", "branches": [branche] * 3})

    @pytest.mark.parametrize("nombre", [2, 8])
    def test_le_nombre_de_branches_est_borne(self, nombre: int) -> None:
        with pytest.raises(ValidationError):
            CarteMentaleIA.model_validate({"sujet": "Cours", "branches": [self.idee] * nombre})

    def test_trop_d_idees_sous_une_branche(self) -> None:
        branche = dict(self.idee, enfants=[self.idee] * 6)
        with pytest.raises(ValidationError):
            CarteMentaleIA.model_validate({"sujet": "Cours", "branches": [branche] * 3})

    def test_une_etiquette_trop_longue_est_refusee(self) -> None:
        longue = dict(self.idee, idee="x" * 91)
        with pytest.raises(ValidationError):
            CarteMentaleIA.model_validate({"sujet": "Cours", "branches": [longue] * 3})
