"""
Glossaire (decision 054).

Les termes sont etablis en UN appel, par le meme chemin que la carte mentale
(masquage du cours entier), valides par leur schema, enregistres, et relus
sans appel.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.schemas.llm import GlossaireIA

from .test_api import COURS_COURT


def _cours(client: TestClient, entetes: dict, contenu: str = COURS_COURT) -> str:
    r = client.post("/api/courses", headers=entetes, json={"title": "Cours", "content": contenu})
    return r.json()["course"]["id"]


def test_aucun_glossaire_au_depart_et_sans_appel(client: TestClient, etudiant: dict, faux_modele) -> None:
    cours = _cours(client, etudiant)
    r = client.get(f"/api/courses/{cours}/glossary", headers=etudiant)
    assert r.status_code == 200
    assert r.json()["glossary"] is None
    assert faux_modele.appels == []


def test_generer_puis_relire(client: TestClient, etudiant: dict, faux_modele) -> None:
    cours = _cours(client, etudiant)
    r = client.post(f"/api/courses/{cours}/glossary", headers=etudiant)
    assert r.status_code == 201, r.text
    p = r.json()["glossary"]
    termes = [t["terme"] for t in p["payload"]["termes"]]
    # « Quantum » et « quantum » : le doublon a la casse pres est retire.
    assert termes == ["Ordonnanceur", "Quantum", "Famine", "Vieillissement"]
    assert p["payload"]["termes"][0]["citation"]
    assert len(faux_modele.appels) == 1

    relue = client.get(f"/api/courses/{cours}/glossary", headers=etudiant).json()["glossary"]
    assert relue["id"] == p["id"]
    assert len(faux_modele.appels) == 1  # relire ne coute rien


def test_le_cours_part_masque(client: TestClient, etudiant: dict, faux_modele) -> None:
    cours = _cours(client, etudiant, COURS_COURT + " Contact : prof.ali@universite.tn.")
    client.post(f"/api/courses/{cours}/glossary", headers=etudiant)
    assert "prof.ali@universite.tn" not in faux_modele.appels[0]["user"]


def test_un_autre_etudiant_ne_voit_rien(client: TestClient, etudiant: dict, faux_modele) -> None:
    cours = _cours(client, etudiant)
    client.post(f"/api/courses/{cours}/glossary", headers=etudiant)
    autre = client.post("/api/auth/register", json={"email": "autre@exemple.tn", "password": "motdepasse-solide"})
    entetes = {"Authorization": f"Bearer {autre.json()['token']}"}
    assert client.get(f"/api/courses/{cours}/glossary", headers=entetes).status_code == 403
    assert client.post(f"/api/courses/{cours}/glossary", headers=entetes).status_code == 403


def test_la_generation_compte_dans_le_quota(client: TestClient, etudiant: dict, faux_modele, monkeypatch) -> None:
    from app.config import parametres

    monkeypatch.setattr(parametres, "MAX_APPELS_MODELE_PAR_MINUTE", 1)
    cours = _cours(client, etudiant)
    assert client.post(f"/api/courses/{cours}/glossary", headers=etudiant).status_code == 201
    assert client.post(f"/api/courses/{cours}/glossary", headers=etudiant).status_code == 429


def test_supprimer_le_cours_emporte_le_glossaire(client: TestClient, etudiant: dict, faux_modele, session_fabrique) -> None:
    from app.models import Glossaire

    cours = _cours(client, etudiant)
    client.post(f"/api/courses/{cours}/glossary", headers=etudiant)
    client.delete(f"/api/courses/{cours}", headers=etudiant)
    with session_fabrique() as session:
        assert session.query(Glossaire).count() == 0


class TestSchema:
    terme = {"terme": "Quantum", "definition": "Une definition assez longue du terme.", "citation": "Une citation du cours."}

    def test_un_terme_sans_citation_est_refuse(self) -> None:
        sans = {k: v for k, v in self.terme.items() if k != "citation"}
        with pytest.raises(ValidationError):
            GlossaireIA.model_validate({"termes": [sans] * 3})

    @pytest.mark.parametrize("nombre", [2, 31])
    def test_le_nombre_de_termes_est_borne(self, nombre: int) -> None:
        with pytest.raises(ValidationError):
            GlossaireIA.model_validate({"termes": [self.terme] * nombre})

    def test_une_definition_trop_courte(self) -> None:
        with pytest.raises(ValidationError):
            GlossaireIA.model_validate({"termes": [dict(self.terme, definition="Court.")] * 3})
