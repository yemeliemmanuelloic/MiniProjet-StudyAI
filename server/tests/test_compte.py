"""
Page « Mon compte » (20 octobre) : connexions, changement de mot de passe,
suppression du compte, export des donnees, et invalidation des jetons.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.test_api import creer_cours

MOT = "motdepasse-solide"


def _connecter(client: TestClient, email: str = "etudiant@exemple.tn", mot: str = MOT):
    return client.post("/api/auth/login", json={"email": email, "password": mot})


def _entetes(jeton: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {jeton}"}


class TestConnexions:
    def test_la_connexion_precedente_est_celle_d_avant(self, client: TestClient, etudiant: dict) -> None:
        premiere = _connecter(client).json()["user"]
        # Premiere connexion apres l'inscription : rien d'anterieur a montrer.
        assert premiere["previousLoginAt"] is None

        seconde = _connecter(client).json()
        moi = client.get("/api/auth/me", headers=_entetes(seconde["token"])).json()["user"]
        assert moi["previousLoginAt"] is not None
        assert moi["createdAt"] is not None

    def test_un_echec_ne_change_pas_les_dates(self, client: TestClient, etudiant: dict) -> None:
        _connecter(client)
        avant = client.get("/api/auth/me", headers=etudiant).json()["user"]["previousLoginAt"]
        _connecter(client, mot="mauvais-mot")
        apres = client.get("/api/auth/me", headers=etudiant).json()["user"]["previousLoginAt"]
        assert avant == apres


class TestMotDePasse:
    def test_changer_le_mot_de_passe(self, client: TestClient, etudiant: dict) -> None:
        reponse = client.post(
            "/api/auth/password",
            headers=etudiant,
            json={"currentPassword": MOT, "newPassword": "nouveau-mot-solide"},
        )
        assert reponse.status_code == 200
        assert _connecter(client).status_code == 401
        assert _connecter(client, mot="nouveau-mot-solide").status_code == 200

    def test_les_autres_sessions_sont_deconnectees(self, client: TestClient, etudiant: dict) -> None:
        # « etudiant » joue l'appareil vole ; la reponse donne le jeton neuf
        # de l'appareil qui change le mot de passe.
        neuf = client.post(
            "/api/auth/password",
            headers=etudiant,
            json={"currentPassword": MOT, "newPassword": "nouveau-mot-solide"},
        ).json()["token"]

        assert client.get("/api/courses", headers=etudiant).status_code == 401
        assert client.get("/api/courses", headers=_entetes(neuf)).status_code == 200

    def test_le_mot_de_passe_actuel_est_exige(self, client: TestClient, etudiant: dict) -> None:
        reponse = client.post(
            "/api/auth/password",
            headers=etudiant,
            json={"currentPassword": "pas-le-bon", "newPassword": "nouveau-mot-solide"},
        )
        assert reponse.status_code == 400
        assert _connecter(client).status_code == 200

    def test_le_nouveau_mot_de_passe_doit_etre_assez_long(self, client: TestClient, etudiant: dict) -> None:
        reponse = client.post(
            "/api/auth/password", headers=etudiant, json={"currentPassword": MOT, "newPassword": "court"}
        )
        assert reponse.status_code == 400

    def test_la_devinette_par_cette_route_est_freinee(self, client: TestClient, etudiant: dict) -> None:
        # Une session volee ne doit pas offrir une seconde porte, non freinee,
        # pour deviner le mot de passe : le compteur est celui de la connexion.
        from app.config import parametres

        codes = [
            client.post(
                "/api/auth/password",
                headers=etudiant,
                json={"currentPassword": f"essai-{i}", "newPassword": "nouveau-mot-solide"},
            ).status_code
            for i in range(parametres.MAX_ECHECS_CONNEXION + 1)
        ]
        assert codes[-1] == 429


class TestSuppression:
    def test_supprimer_le_compte_efface_tout(
        self, client: TestClient, etudiant: dict, faux_modele, session_fabrique
    ) -> None:
        from sqlalchemy import func, select

        from app.models import Carte, Cours, Message, Quiz, Resume, Utilisateur

        cours = creer_cours(client, etudiant)
        client.post(f"/api/courses/{cours}/summary", headers=etudiant, json={})
        client.post(f"/api/courses/{cours}/quiz", headers=etudiant, json={"questionCount": 3})
        client.post(f"/api/courses/{cours}/chat", headers=etudiant, json={"question": "De quoi parle le cours ?"})

        reponse = client.request("DELETE", "/api/auth/me", headers=etudiant, json={"password": MOT})
        assert reponse.status_code == 204

        with session_fabrique() as s:
            for table in (Utilisateur, Cours, Resume, Quiz, Message, Carte):
                assert s.scalar(select(func.count()).select_from(table)) == 0, table.__name__

    def test_les_jetons_du_compte_supprime_sont_refuses(self, client: TestClient, etudiant: dict) -> None:
        client.request("DELETE", "/api/auth/me", headers=etudiant, json={"password": MOT})
        assert client.get("/api/auth/me", headers=etudiant).status_code == 401
        assert client.get("/api/courses", headers=etudiant).status_code == 401

    def test_le_mot_de_passe_est_exige(self, client: TestClient, etudiant: dict) -> None:
        reponse = client.request("DELETE", "/api/auth/me", headers=etudiant, json={"password": "pas-le-bon"})
        assert reponse.status_code == 400
        assert client.get("/api/courses", headers=etudiant).status_code == 200

    def test_les_donnees_d_un_autre_etudiant_sont_intactes(self, client: TestClient, etudiant: dict) -> None:
        autre = client.post(
            "/api/auth/register", json={"email": "autre@exemple.tn", "password": MOT}
        ).json()["token"]
        cours_autre = creer_cours(client, _entetes(autre))
        client.request("DELETE", "/api/auth/me", headers=etudiant, json={"password": MOT})
        assert client.get(f"/api/courses/{cours_autre}", headers=_entetes(autre)).status_code == 200


class TestExport:
    def test_l_export_contient_les_donnees_et_rien_de_sensible(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        cours = creer_cours(client, etudiant)
        client.post(f"/api/courses/{cours}/summary", headers=etudiant, json={})
        client.post(f"/api/courses/{cours}/quiz", headers=etudiant, json={"questionCount": 3})

        reponse = client.get("/api/auth/me/export", headers=etudiant)
        assert reponse.status_code == 200
        assert "attachment" in reponse.headers["content-disposition"]
        donnees = reponse.json()

        assert donnees["format"] == "studyai-export-v1"
        assert donnees["account"]["email"] == "etudiant@exemple.tn"
        assert len(donnees["courses"]) == 1
        assert donnees["courses"][0]["content"]
        assert len(donnees["courses"][0]["summaries"]) == 1
        assert len(donnees["courses"][0]["quizzes"][0]["questions"]) == 3

        brut = reponse.text
        assert "passwordHash" not in brut and "$2b$" not in brut
        assert "sentPayload" not in brut

    def test_l_export_ne_contient_que_ses_propres_cours(self, client: TestClient, etudiant: dict) -> None:
        autre = client.post(
            "/api/auth/register", json={"email": "autre@exemple.tn", "password": MOT}
        ).json()["token"]
        creer_cours(client, _entetes(autre))
        creer_cours(client, etudiant)
        donnees = client.get("/api/auth/me/export", headers=etudiant).json()
        assert len(donnees["courses"]) == 1

    def test_l_export_n_appelle_pas_le_modele(self, client: TestClient, etudiant: dict, faux_modele) -> None:
        creer_cours(client, etudiant)
        client.get("/api/auth/me/export", headers=etudiant)
        assert faux_modele.appels == []
