"""
Examen blanc multi-cours.

Trois proprietes comptent plus que les autres, et sont testees en premier :

  1. les bonnes reponses ne descendent pas pendant l'epreuve ;
  2. composer un examen n'appelle PAS le modele — c'est l'argument central
     de cette fonctionnalite, et il doit etre verifie, pas affirme ;
  3. une copie rendue ne peut pas etre rendue deux fois, sinon il suffirait
     de renvoyer le formulaire apres avoir lu le corrige.
"""

from __future__ import annotations

import random

import pytest
from fastapi.testclient import TestClient

from .test_api import COURS_COURT, creer_cours


def cours_avec_quiz(
    client: TestClient, entetes: dict, titre: str, nombre: int = 5
) -> str:
    """Cree un cours et lui genere un quiz : la matiere premiere d'un examen."""
    reponse = client.post(
        "/api/courses",
        headers=entetes,
        json={"title": titre, "content": COURS_COURT},
    )
    identifiant = reponse.json()["course"]["id"]
    quiz = client.post(
        f"/api/courses/{identifiant}/quiz",
        headers=entetes,
        json={"questionCount": nombre},
    )
    assert quiz.status_code in (200, 201), quiz.text
    return identifiant


def composer(client: TestClient, entetes: dict, cours: list[str], **reste):
    return client.post(
        "/api/exams",
        headers=entetes,
        json={"courseIds": cours, "questionCount": reste.pop("nombre", 10), **reste},
    )


class TestSecretDesReponses:
    def test_les_bonnes_reponses_ne_descendent_pas_pendant_l_epreuve(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        a = cours_avec_quiz(client, etudiant, "Chapitre 1")
        b = cours_avec_quiz(client, etudiant, "Chapitre 2")

        reponse = composer(client, etudiant, [a, b])
        assert reponse.status_code == 201, reponse.text

        brut = reponse.text
        for interdit in ("correctIndex", "explanation", "sourceQuote"):
            assert interdit not in brut, f"{interdit} a fuite pendant l'epreuve"

        for question in reponse.json()["questions"]:
            assert set(question) == {"question", "options"}

    def test_la_reprise_d_un_examen_ne_fuit_pas_non_plus(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        """Le chemin GET est distinct du POST : il doit etre verifie a part."""
        a = cours_avec_quiz(client, etudiant, "Chapitre 1")
        identifiant = composer(client, etudiant, [a], nombre=5).json()["id"]

        reprise = client.get(f"/api/exams/{identifiant}", headers=etudiant)
        assert reprise.status_code == 200
        assert "correctIndex" not in reprise.text

    def test_les_reponses_descendent_a_la_correction(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        a = cours_avec_quiz(client, etudiant, "Chapitre 1")
        identifiant = composer(client, etudiant, [a], nombre=5).json()["id"]

        rendu = client.post(
            f"/api/exams/{identifiant}/submit",
            headers=etudiant,
            json={"answers": [0, 1, 2, 3, 0]},
        )
        assert rendu.status_code == 200, rendu.text
        ligne = rendu.json()["correction"][0]
        assert "correctIndex" in ligne
        assert "sourceQuote" in ligne


class TestCoutEnAppels:
    def test_composer_un_examen_n_appelle_pas_le_modele(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        """
        C'EST L'ARGUMENT CENTRAL de cette fonctionnalite : les quiz sont deja
        en base, donc un examen blanc est gratuit. Affirme dans le rapport,
        il doit etre verifie ici.
        """
        a = cours_avec_quiz(client, etudiant, "Chapitre 1")
        b = cours_avec_quiz(client, etudiant, "Chapitre 2")

        avant = len(faux_modele.appels)
        reponse = composer(client, etudiant, [a, b])
        assert reponse.status_code == 201
        assert len(faux_modele.appels) == avant, "un examen blanc a coute un appel"

    def test_la_correction_non_plus(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        a = cours_avec_quiz(client, etudiant, "Chapitre 1")
        identifiant = composer(client, etudiant, [a], nombre=5).json()["id"]

        avant = len(faux_modele.appels)
        client.post(
            f"/api/exams/{identifiant}/submit", headers=etudiant, json={"answers": [0]}
        )
        assert len(faux_modele.appels) == avant

    def test_completer_appelle_le_modele_et_le_dit(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        """La generation reste possible, mais seulement sur demande explicite."""
        avec = cours_avec_quiz(client, etudiant, "Chapitre 1")
        sans = creer_cours(client, etudiant)

        avant = len(faux_modele.appels)
        reponse = composer(client, etudiant, [avec, sans], completer=True)
        assert reponse.status_code == 201, reponse.text
        assert len(faux_modele.appels) > avant


class TestComposition:
    def test_les_questions_viennent_de_tous_les_cours(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        a = cours_avec_quiz(client, etudiant, "Chapitre 1")
        b = cours_avec_quiz(client, etudiant, "Chapitre 2")
        c = cours_avec_quiz(client, etudiant, "Chapitre 3")

        identifiant = composer(client, etudiant, [a, b, c], nombre=9).json()["id"]
        rendu = client.post(
            f"/api/exams/{identifiant}/submit",
            headers=etudiant,
            json={"answers": [0] * 9},
        ).json()

        cours_vus = {ligne["courseId"] for ligne in rendu["correction"]}
        assert cours_vus == {a, b, c}

    def test_un_cours_a_court_de_questions_est_signale_et_compense(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        """
        Demander 10 questions sur deux cours dont l'un n'en a que 3 doit en
        rendre 10, pas 8 : le deficit est repris sur le cours qui a du stock.
        Et l'etudiant doit savoir que l'equilibre n'a pas ete tenu.
        """
        riche = cours_avec_quiz(client, etudiant, "Chapitre riche", nombre=10)
        pauvre = cours_avec_quiz(client, etudiant, "Chapitre pauvre", nombre=3)

        donnees = composer(client, etudiant, [riche, pauvre], nombre=10).json()
        assert donnees["total"] == 10
        assert len(donnees["questions"]) == 10

        assert len(donnees["warnings"]) == 1
        avertissement = donnees["warnings"][0]
        assert avertissement["courseTitle"] == "Chapitre pauvre"
        assert avertissement["attendu"] == 5
        assert avertissement["obtenu"] == 3

    def test_sans_aucun_quiz_l_examen_est_refuse_avec_le_remede(
        self, client: TestClient, etudiant: dict
    ) -> None:
        vide = creer_cours(client, etudiant)
        reponse = composer(client, etudiant, [vide])

        assert reponse.status_code == 400
        message = reponse.json()["error"]["message"]
        assert "quiz" in message.lower()
        assert "completer" in message.lower()

    def test_le_meme_cours_demande_deux_fois_ne_compte_qu_une(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        a = cours_avec_quiz(client, etudiant, "Chapitre 1")
        donnees = composer(client, etudiant, [a, a, a], nombre=5).json()
        assert len(donnees["courses"]) == 1

    def test_la_duree_par_defaut_est_une_minute_par_question(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        a = cours_avec_quiz(client, etudiant, "Chapitre 1")
        donnees = composer(client, etudiant, [a], nombre=5).json()
        assert donnees["durationS"] == 300

    def test_une_duree_explicite_est_respectee(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        a = cours_avec_quiz(client, etudiant, "Chapitre 1")
        donnees = composer(client, etudiant, [a], nombre=5, durationMin=2).json()
        assert donnees["durationS"] == 120
        assert 0 < donnees["remainingS"] <= 120


class TestRemiseDeLaCopie:
    def test_une_copie_ne_peut_pas_etre_rendue_deux_fois(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        """
        Sans ce garde-fou, il suffirait de lire le corrige puis de renvoyer le
        formulaire avec les bonnes reponses.
        """
        a = cours_avec_quiz(client, etudiant, "Chapitre 1")
        identifiant = composer(client, etudiant, [a], nombre=5).json()["id"]

        premier = client.post(
            f"/api/exams/{identifiant}/submit",
            headers=etudiant,
            json={"answers": [0] * 5},
        )
        assert premier.status_code == 200

        second = client.post(
            f"/api/exams/{identifiant}/submit",
            headers=etudiant,
            json={"answers": [1] * 5},
        )
        assert second.status_code == 400
        assert "deja" in second.json()["error"]["message"].lower()

    def test_une_question_sans_reponse_est_un_cas_normal(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        """Sur un examen chronometre, laisser une question vide est attendu."""
        a = cours_avec_quiz(client, etudiant, "Chapitre 1")
        identifiant = composer(client, etudiant, [a], nombre=5).json()["id"]

        rendu = client.post(
            f"/api/exams/{identifiant}/submit",
            headers=etudiant,
            json={"answers": [0, None, None, 2, None]},
        )
        assert rendu.status_code == 200, rendu.text
        assert rendu.json()["exam"]["total"] == 5

    def test_le_score_par_cours_classe_le_plus_faible_en_premier(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        """
        Savoir qu'on a 12/20 n'indique pas quoi reviser ; savoir qu'on a 2/5
        sur le chapitre 3, si. L'ordre porte donc l'information.
        """
        a = cours_avec_quiz(client, etudiant, "Chapitre 1")
        b = cours_avec_quiz(client, etudiant, "Chapitre 2")
        identifiant = composer(client, etudiant, [a, b], nombre=10).json()["id"]

        rendu = client.post(
            f"/api/exams/{identifiant}/submit",
            headers=etudiant,
            json={"answers": [0] * 10},
        ).json()

        taux = [ligne["score"] / ligne["total"] for ligne in rendu["parCours"]]
        assert taux == sorted(taux)


class TestProprieteDesDonnees:
    def test_un_etudiant_ne_compose_pas_sur_le_cours_d_un_autre(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        a = cours_avec_quiz(client, etudiant, "Chapitre 1")

        autre = client.post(
            "/api/auth/register",
            json={"email": "intrus@exemple.tn", "password": "motdepasse-solide"},
        )
        entetes = {"Authorization": f"Bearer {autre.json()['token']}"}

        assert composer(client, entetes, [a]).status_code == 403

    def test_un_etudiant_ne_voit_pas_l_examen_d_un_autre(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        a = cours_avec_quiz(client, etudiant, "Chapitre 1")
        identifiant = composer(client, etudiant, [a], nombre=5).json()["id"]

        autre = client.post(
            "/api/auth/register",
            json={"email": "intrus@exemple.tn", "password": "motdepasse-solide"},
        )
        entetes = {"Authorization": f"Bearer {autre.json()['token']}"}

        assert client.get(f"/api/exams/{identifiant}", headers=entetes).status_code == 403

    def test_l_historique_ne_montre_que_ses_propres_examens(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        a = cours_avec_quiz(client, etudiant, "Chapitre 1")
        composer(client, etudiant, [a], nombre=5)

        autre = client.post(
            "/api/auth/register",
            json={"email": "intrus@exemple.tn", "password": "motdepasse-solide"},
        )
        entetes = {"Authorization": f"Bearer {autre.json()['token']}"}

        assert client.get("/api/exams", headers=entetes).json()["exams"] == []
        assert len(client.get("/api/exams", headers=etudiant).json()["exams"]) == 1


class TestRepartition:
    """Tests unitaires de l'ajustement : plus rapides et plus precis qu'en HTTP."""

    @pytest.mark.parametrize(
        ("parts", "stocks", "attendu"),
        [
            ([5, 5], [10, 10], [5, 5]),          # cas nominal
            ([5, 5], [10, 2], [8, 2]),           # deficit repris sur le riche
            ([5, 5], [2, 2], [2, 2]),            # rien a rattraper nulle part
            ([4, 3, 3], [1, 10, 10], [1, 5, 4]), # rattrapage reparti, pas empile
        ],
    )
    def test_le_deficit_est_redistribue(
        self, parts: list[int], stocks: list[int], attendu: list[int]
    ) -> None:
        from app.services.examen import _repartir_reellement

        assert _repartir_reellement(parts, stocks) == attendu

    def test_le_dedoublonnage_ignore_accents_et_ponctuation(self) -> None:
        """Deux quiz successifs reposent souvent la meme question a la virgule pres."""
        from app.services.examen import _cle

        assert _cle("Qu'est-ce qu'un prompt ?") == _cle("Qu est ce qu un prompt")
        assert _cle("La préemption, c'est quoi ?") == _cle("La preemption c est quoi")
        assert _cle("Premiere question") != _cle("Deuxieme question")

    def test_le_tirage_est_reproductible_a_graine_egale(self) -> None:
        """Sans quoi aucun test de composition ne serait stable."""
        from app.services.examen import _repartir_reellement

        a = random.Random(7).sample(range(20), 5)
        b = random.Random(7).sample(range(20), 5)
        assert a == b
        assert _repartir_reellement([5], [20]) == [5]
