"""
Presentation narree (decision 044).

Le script est genere en UN appel, par le meme chemin que le quiz (masquage du
cours entier), valide par son schema, enregistre, et relu sans appel. La voix
et l'animation sont produites par le navigateur : rien a tester ici.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.schemas.llm import PresentationIA

from .test_api import COURS_COURT


def _cours(client: TestClient, entetes: dict, contenu: str = COURS_COURT) -> str:
    r = client.post("/api/courses", headers=entetes, json={"title": "Cours", "content": contenu})
    return r.json()["course"]["id"]


def test_aucune_presentation_au_depart_et_sans_appel(client: TestClient, etudiant: dict, faux_modele) -> None:
    cours = _cours(client, etudiant)
    r = client.get(f"/api/courses/{cours}/presentation", headers=etudiant)
    assert r.status_code == 200
    assert r.json()["presentation"] is None
    assert faux_modele.appels == []


def test_generer_puis_relire(client: TestClient, etudiant: dict, faux_modele) -> None:
    cours = _cours(client, etudiant)
    r = client.post(f"/api/courses/{cours}/presentation", headers=etudiant)
    assert r.status_code == 201, r.text
    p = r.json()["presentation"]
    assert len(p["payload"]["scenes"]) == 5
    assert p["payload"]["scenes"][0]["narration"]
    assert len(faux_modele.appels) == 1

    relue = client.get(f"/api/courses/{cours}/presentation", headers=etudiant).json()["presentation"]
    assert relue["id"] == p["id"]
    assert len(faux_modele.appels) == 1  # relire ne coute rien


def test_le_cours_part_masque(client: TestClient, etudiant: dict, faux_modele) -> None:
    cours = _cours(client, etudiant, COURS_COURT + " Contact : prof.ali@universite.tn.")
    client.post(f"/api/courses/{cours}/presentation", headers=etudiant)
    assert "prof.ali@universite.tn" not in faux_modele.appels[0]["user"]


def test_un_autre_etudiant_ne_voit_rien(client: TestClient, etudiant: dict, faux_modele) -> None:
    cours = _cours(client, etudiant)
    client.post(f"/api/courses/{cours}/presentation", headers=etudiant)
    autre = client.post("/api/auth/register", json={"email": "autre@exemple.tn", "password": "motdepasse-solide"})
    entetes = {"Authorization": f"Bearer {autre.json()['token']}"}
    assert client.get(f"/api/courses/{cours}/presentation", headers=entetes).status_code == 403
    assert client.post(f"/api/courses/{cours}/presentation", headers=entetes).status_code == 403


def test_la_generation_compte_dans_le_quota(client: TestClient, etudiant: dict, faux_modele, monkeypatch) -> None:
    from app.config import parametres

    monkeypatch.setattr(parametres, "MAX_APPELS_MODELE_PAR_MINUTE", 1)
    cours = _cours(client, etudiant)
    assert client.post(f"/api/courses/{cours}/presentation", headers=etudiant).status_code == 201
    assert client.post(f"/api/courses/{cours}/presentation", headers=etudiant).status_code == 429


def test_supprimer_le_cours_emporte_la_presentation(client: TestClient, etudiant: dict, faux_modele, session_fabrique) -> None:
    from app.models import Presentation

    cours = _cours(client, etudiant)
    client.post(f"/api/courses/{cours}/presentation", headers=etudiant)
    client.delete(f"/api/courses/{cours}", headers=etudiant)
    with session_fabrique() as session:
        assert session.query(Presentation).count() == 0


class TestSchema:
    scene = {"titre": "Titre", "points": ["Un point"], "narration": "x" * 50, "citation": "Une citation du cours."}

    def test_une_scene_sans_citation_est_refusee(self) -> None:
        sans = {k: v for k, v in self.scene.items() if k != "citation"}
        with pytest.raises(ValidationError):
            PresentationIA.model_validate({"titre": "Cours", "scenes": [sans] * 5})

    @pytest.mark.parametrize("nombre", [3, 11])
    def test_le_nombre_de_scenes_est_borne(self, nombre: int) -> None:
        with pytest.raises(ValidationError):
            PresentationIA.model_validate({"titre": "Cours", "scenes": [self.scene] * nombre})

    def test_trop_de_points_est_refuse(self) -> None:
        trop = dict(self.scene, points=["a1a", "b2b", "c3c", "d4d", "e5e"])
        with pytest.raises(ValidationError):
            PresentationIA.model_validate({"titre": "Cours", "scenes": [trop] * 5})
