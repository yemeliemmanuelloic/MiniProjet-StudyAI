"""
Garde-fous de debit ajoutes le 20 octobre : plafond global du jour, echecs de
connexion, inscriptions par adresse. Le plafond par minute est teste dans
test_api.py (TestDebit).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import parametres
from tests.test_api import creer_cours


def _inscrire(client: TestClient, email: str, ip: str = "203.0.113.7"):
    return client.post(
        "/api/auth/register",
        json={"email": email, "password": "motdepasse-solide"},
        headers={"X-Forwarded-For": ip},
    )


def _connecter(client: TestClient, email: str, mot_de_passe: str):
    return client.post("/api/auth/login", json={"email": email, "password": mot_de_passe})


class TestPlafondGlobal:
    def test_plusieurs_comptes_ne_depassent_pas_le_plafond_du_jour(
        self, client: TestClient, faux_modele, monkeypatch
    ) -> None:
        # Deux comptes, chacun sous son plafond par minute, mais ensemble
        # au-dela du plafond global : c'est le cas que le garde-fou par
        # etudiant ne voyait pas.
        monkeypatch.setattr(parametres, "MAX_APPELS_MODELE_PAR_JOUR", 3)
        comptes = []
        for i, ip in enumerate(["198.51.100.1", "198.51.100.2"]):
            jeton = _inscrire(client, f"compte{i}@exemple.tn", ip).json()["token"]
            entetes = {"Authorization": f"Bearer {jeton}"}
            comptes.append((entetes, creer_cours(client, entetes)))

        codes = []
        for entetes, cours in comptes * 2:
            codes.append(
                client.post(
                    f"/api/courses/{cours}/quiz", headers=entetes, json={"questionCount": 3}
                ).status_code
            )

        assert codes == [200, 200, 200, 429]
        assert len(faux_modele.appels) == 3

    def test_le_refus_le_dit_et_signale_le_plafond_du_jour(
        self, client: TestClient, etudiant: dict, faux_modele, monkeypatch
    ) -> None:
        monkeypatch.setattr(parametres, "MAX_APPELS_MODELE_PAR_JOUR", 0)
        cours = creer_cours(client, etudiant)
        reponse = client.post(
            f"/api/courses/{cours}/quiz", headers=etudiant, json={"questionCount": 3}
        )
        corps = reponse.json()["error"]
        assert reponse.status_code == 429
        assert corps["code"] == "RATE_LIMITED"
        assert corps["details"]["quota_jour"] is True
        assert 0 < corps["details"]["attente_s"] <= 24 * 3600 + 1
        assert faux_modele.appels == []

    def test_les_fonctions_sans_ia_restent_ouvertes(
        self, client: TestClient, etudiant: dict, monkeypatch
    ) -> None:
        monkeypatch.setattr(parametres, "MAX_APPELS_MODELE_PAR_JOUR", 0)
        cours = creer_cours(client, etudiant)
        assert client.get("/api/courses", headers=etudiant).status_code == 200
        assert client.get(f"/api/courses/{cours}/progress", headers=etudiant).status_code == 200
        assert client.get("/api/search?q=cours", headers=etudiant).status_code == 200


class TestConnexion:
    def test_l_adresse_est_bloquee_apres_trop_d_echecs(self, client: TestClient) -> None:
        _inscrire(client, "cible@exemple.tn")
        limite = parametres.MAX_ECHECS_CONNEXION
        codes = [_connecter(client, "cible@exemple.tn", "mauvais-mot").status_code for _ in range(limite)]
        assert codes == [401] * limite

        # Meme le BON mot de passe est refuse pendant le blocage : sinon la
        # devinette pourrait continuer en lisant la difference de reponse.
        bloquee = _connecter(client, "cible@exemple.tn", "motdepasse-solide")
        assert bloquee.status_code == 429
        assert bloquee.json()["error"]["code"] == "RATE_LIMITED"
        assert bloquee.json()["error"]["details"]["attente_s"] > 0

    def test_une_adresse_inconnue_est_bloquee_de_la_meme_facon(self, client: TestClient) -> None:
        # Sinon le blocage revelerait quelles adresses ont un compte.
        for _ in range(parametres.MAX_ECHECS_CONNEXION):
            assert _connecter(client, "fantome@exemple.tn", "x" * 10).status_code == 401
        assert _connecter(client, "fantome@exemple.tn", "x" * 10).status_code == 429

    def test_une_connexion_reussie_remet_le_compteur_a_zero(self, client: TestClient) -> None:
        _inscrire(client, "distrait@exemple.tn")
        for _ in range(parametres.MAX_ECHECS_CONNEXION - 1):
            _connecter(client, "distrait@exemple.tn", "mauvais-mot")
        assert _connecter(client, "distrait@exemple.tn", "motdepasse-solide").status_code == 200
        for _ in range(parametres.MAX_ECHECS_CONNEXION - 1):
            assert _connecter(client, "distrait@exemple.tn", "mauvais-mot").status_code == 401

    def test_le_blocage_ne_touche_pas_les_autres_adresses(self, client: TestClient) -> None:
        _inscrire(client, "voisin@exemple.tn")
        for _ in range(parametres.MAX_ECHECS_CONNEXION):
            _connecter(client, "cible@exemple.tn", "mauvais-mot")
        assert _connecter(client, "voisin@exemple.tn", "motdepasse-solide").status_code == 200


class TestInscription:
    def test_les_inscriptions_sont_plafonnees_par_adresse(self, client: TestClient) -> None:
        limite = parametres.MAX_INSCRIPTIONS_PAR_HEURE
        codes = [_inscrire(client, f"serie{i}@exemple.tn").status_code for i in range(limite + 1)]
        assert codes == [201] * limite + [429]

    def test_une_autre_adresse_peut_toujours_s_inscrire(self, client: TestClient) -> None:
        for i in range(parametres.MAX_INSCRIPTIONS_PAR_HEURE):
            _inscrire(client, f"serie{i}@exemple.tn", ip="203.0.113.7")
        assert _inscrire(client, "autre@exemple.tn", ip="203.0.113.99").status_code == 201


@pytest.mark.parametrize("cle", ["password", "motdepasse-solide"])
def test_le_journal_ne_contient_jamais_de_mot_de_passe(
    client: TestClient, caplog, cle: str
) -> None:
    caplog.set_level("WARNING", logger="studyai.securite")
    _inscrire(client, "journal@exemple.tn")
    for _ in range(parametres.MAX_ECHECS_CONNEXION + 1):
        _connecter(client, "journal@exemple.tn", "motdepasse-solide-mais-faux")
    assert caplog.records, "les refus doivent etre journalises"
    assert all("motdepasse-solide" not in r.getMessage() for r in caplog.records)
