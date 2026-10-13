"""
Tableau de consommation.

Un tableau de couts qui ment est pire que pas de tableau : il donne
confiance. Ces tests portent donc d'abord sur l'HONNETETE des chiffres —
qu'une operation sans decompte d'appels ne soit pas comptee comme en valant
un, et qu'un etudiant ne voie jamais la consommation d'un autre.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from .test_api import COURS_COURT, cours_long, creer_cours


def usage(client: TestClient, entetes: dict) -> dict:
    reponse = client.get("/api/usage", headers=entetes)
    assert reponse.status_code == 200, reponse.text
    return reponse.json()


class TestComptage:
    def test_une_bibliotheque_vide_rend_des_zeros(
        self, client: TestClient, etudiant: dict
    ) -> None:
        donnees = usage(client, etudiant)
        assert donnees["total"]["operations"] == 0
        assert donnees["total"]["cout"] == 0
        assert donnees["parCours"] == []

    def test_les_jetons_sont_additionnes_par_module(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        identifiant = creer_cours(client, etudiant)
        client.post(
            f"/api/courses/{identifiant}/summary", headers=etudiant, json={"level": "standard"}
        )
        client.post(
            f"/api/courses/{identifiant}/quiz", headers=etudiant, json={"questionCount": 3}
        )

        donnees = usage(client, etudiant)
        modules = {m["module"]: m for m in donnees["parModule"]}

        assert modules["Resume"]["operations"] == 1
        assert modules["Quiz"]["operations"] == 1
        assert modules["Tuteur"]["operations"] == 0
        assert donnees["total"]["tokensIn"] > 0
        assert donnees["total"]["tokensOut"] > 0

    def test_un_cours_long_compte_plusieurs_appels_pour_une_operation(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        """
        C'est tout l'interet de la colonne `calls` : une operation n'est pas
        un appel. Un resume de cours long en demande un par segment, plus
        l'agregation.
        """
        identifiant = creer_cours(client, etudiant, cours_long())
        client.post(
            f"/api/courses/{identifiant}/summary", headers=etudiant, json={"level": "standard"}
        )

        resume = next(m for m in usage(client, etudiant)["parModule"] if m["module"] == "Resume")
        assert resume["operations"] == 1
        assert resume["calls"] > 1, "un cours long doit coûter plus d'un appel"
        assert resume["calls"] == len(faux_modele.appels)

    def test_le_message_de_l_etudiant_ne_compte_pas_comme_une_operation(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        """
        La table des messages contient les deux roles. Compter la question de
        l'etudiant comme une operation du modele doublerait le total.
        """
        identifiant = creer_cours(client, etudiant)
        client.post(
            f"/api/courses/{identifiant}/chat", headers=etudiant, json={"question": "Et donc ?"}
        )

        tuteur = next(m for m in usage(client, etudiant)["parModule"] if m["module"] == "Tuteur")
        assert tuteur["operations"] == 1


class TestHonnetete:
    def test_une_operation_sans_decompte_est_comptee_a_part(
        self, client: TestClient, etudiant: dict, faux_modele, session_fabrique
    ) -> None:
        """
        Les lignes anterieures au 13 octobre n'ont pas de nombre d'appels.
        Les additionner comme si elles valaient un appel donnerait un total
        faux en l'annoncant exact.
        """
        from app.models import Resume

        identifiant = creer_cours(client, etudiant)
        client.post(
            f"/api/courses/{identifiant}/summary", headers=etudiant, json={"level": "standard"}
        )

        # Simule une ligne d'avant la migration 0004.
        session = session_fabrique()
        resume = session.query(Resume).one()
        resume.calls = None
        session.commit()
        session.close()

        ligne = next(m for m in usage(client, etudiant)["parModule"] if m["module"] == "Resume")
        assert ligne["operations"] == 1
        assert ligne["operationsSansDecompte"] == 1
        assert ligne["calls"] == 0, "une ligne inconnue ne doit pas valoir un appel"

    def test_le_tarif_est_rendu_avec_sa_source(
        self, client: TestClient, etudiant: dict
    ) -> None:
        """
        Une estimation en argent dont la source n'est pas visible se lit comme
        un fait. Le tarif vient d'agregateurs tiers, et cela doit se voir.
        """
        tarif = usage(client, etudiant)["tarif"]
        assert tarif["entreeParMillion"] > 0
        assert tarif["devise"]
        assert "verifier" in tarif["source"].lower()

    def test_le_cout_suit_le_tarif_configure(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        identifiant = creer_cours(client, etudiant)
        client.post(
            f"/api/courses/{identifiant}/summary", headers=etudiant, json={"level": "standard"}
        )

        donnees = usage(client, etudiant)
        total, tarif = donnees["total"], donnees["tarif"]
        attendu = round(
            total["tokensIn"] / 1e6 * tarif["entreeParMillion"]
            + total["tokensOut"] / 1e6 * tarif["sortieParMillion"],
            6,
        )
        assert total["cout"] == attendu

    def test_la_consultation_du_tableau_n_appelle_pas_le_modele(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        identifiant = creer_cours(client, etudiant)
        client.post(
            f"/api/courses/{identifiant}/summary", headers=etudiant, json={"level": "standard"}
        )

        avant = len(faux_modele.appels)
        usage(client, etudiant)
        assert len(faux_modele.appels) == avant


class TestCloisonnement:
    def test_un_etudiant_ne_voit_pas_la_consommation_d_un_autre(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        identifiant = creer_cours(client, etudiant)
        client.post(
            f"/api/courses/{identifiant}/summary", headers=etudiant, json={"level": "standard"}
        )

        autre = client.post(
            "/api/auth/register",
            json={"email": "intrus@exemple.tn", "password": "motdepasse-solide"},
        )
        entetes = {"Authorization": f"Bearer {autre.json()['token']}"}

        assert usage(client, entetes)["total"]["operations"] == 0
        assert usage(client, etudiant)["total"]["operations"] == 1

    def test_le_tableau_est_protege(self, client: TestClient) -> None:
        assert client.get("/api/usage").status_code == 401


class TestVentilation:
    def test_le_cours_le_plus_couteux_est_en_tete(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        court = creer_cours(client, etudiant, COURS_COURT)
        long = creer_cours(client, etudiant, cours_long())
        for identifiant in (court, long):
            client.post(
                f"/api/courses/{identifiant}/summary",
                headers=etudiant,
                json={"level": "standard"},
            )

        par_cours = usage(client, etudiant)["parCours"]
        assert len(par_cours) == 2
        assert par_cours[0]["courseId"] == long
        assert par_cours[0]["cout"] >= par_cours[1]["cout"]

    def test_le_modele_qui_a_repondu_est_nomme(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        """Le tableau qui servira le jour d'une comparaison entre fournisseurs."""
        identifiant = creer_cours(client, etudiant)
        client.post(
            f"/api/courses/{identifiant}/summary", headers=etudiant, json={"level": "standard"}
        )

        par_modele = usage(client, etudiant)["parModele"]
        assert [m["model"] for m in par_modele] == ["modele-de-test"]

    def test_les_examens_blancs_comptent_dans_le_gratuit(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        from .test_examen import composer, cours_avec_quiz

        a = cours_avec_quiz(client, etudiant, "Chapitre 1")
        composer(client, etudiant, [a], nombre=5)

        gratuit = usage(client, etudiant)["gratuit"]
        assert gratuit["examens"] == 1
        assert gratuit["questionsServies"] == 5
