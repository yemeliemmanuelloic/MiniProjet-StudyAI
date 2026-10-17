"""
Cartes de revision espacee.

Quatre proprietes passent avant les autres, et sont testees en premier :

  1. fabriquer un jeu n'appelle PAS le modele. C'est l'argument central de ce
     module, exactement comme pour l'examen blanc, et il doit etre VERIFIE —
     le compteur de la doublure est la pour cela ;
  2. l'operation est idempotente. Regenerer un quiz ne doit pas dupliquer des
     cartes ni effacer trois semaines de revision ;
  3. un cours sans quiz refuse, au lieu d'en generer un en silence. Un appel
     au modele declenche depuis un ecran qui promet la gratuite serait
     precisement le cout invisible que le tableau de consommation existe pour
     rendre visible ;
  4. les cartes d'un etudiant ne sont ni lisibles ni revisables par un autre.

L'arithmetique de SM-2, elle, est verifiee a part dans `test_sm2.py` : elle ne
touche ni a la base ni a l'horloge, et se teste sans passer par l'API.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.models import Carte
from app.services.cartes import PAR_SESSION

from .test_api import COURS_COURT


def cours_avec_quiz(
    client: TestClient, entetes: dict, titre: str = "Chapitre", nombre: int = 5
) -> str:
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


def second_etudiant(client: TestClient) -> dict[str, str]:
    reponse = client.post(
        "/api/auth/register",
        json={"email": "autre@exemple.tn", "password": "motdepasse-solide"},
    )
    assert reponse.status_code == 201, reponse.text
    return {"Authorization": f"Bearer {reponse.json()['token']}"}


class TestCoutNul:
    def test_fabriquer_un_jeu_n_appelle_pas_le_modele(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        cours = cours_avec_quiz(client, etudiant, nombre=5)
        avant = len(faux_modele.appels)

        reponse = client.post(f"/api/courses/{cours}/flashcards", headers=etudiant)
        assert reponse.status_code == 201, reponse.text
        assert reponse.json()["creees"] == 5
        assert len(faux_modele.appels) == avant, "la fabrication a appele le modele"

    def test_reviser_n_appelle_pas_le_modele_non_plus(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        cours = cours_avec_quiz(client, etudiant)
        client.post(f"/api/courses/{cours}/flashcards", headers=etudiant)
        cartes = client.get(f"/api/courses/{cours}/flashcards", headers=etudiant).json()
        avant = len(faux_modele.appels)

        for carte in cartes["cards"]:
            reponse = client.post(
                f"/api/flashcards/{carte['id']}/review",
                headers=etudiant,
                json={"bouton": "correct"},
            )
            assert reponse.status_code == 200, reponse.text

        assert len(faux_modele.appels) == avant

    def test_le_nombre_d_appels_est_annonce_et_vaut_zero(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        """La gratuite est AFFICHEE, pas seulement vraie : sinon il faut me croire."""
        cours = cours_avec_quiz(client, etudiant)
        reponse = client.post(f"/api/courses/{cours}/flashcards", headers=etudiant)
        assert reponse.json()["appels"] == 0


class TestIdempotence:
    def test_refabriquer_ne_cree_aucun_doublon(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        cours = cours_avec_quiz(client, etudiant, nombre=5)
        premier = client.post(f"/api/courses/{cours}/flashcards", headers=etudiant)
        second = client.post(f"/api/courses/{cours}/flashcards", headers=etudiant)

        assert premier.json()["creees"] == 5
        assert second.json()["creees"] == 0
        assert second.json()["ignorees"] == 5
        assert second.json()["etat"]["total"] == 5

    def test_refabriquer_n_efface_pas_la_progression(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        """
        LE SCENARIO QUE CETTE CONTRAINTE PROTEGE : l'etudiant revise son jeu
        pendant trois semaines, regenere le quiz du cours, et retrouve ses
        cartes a zero. La contrainte (cours, cle) l'empeche.
        """
        cours = cours_avec_quiz(client, etudiant)
        client.post(f"/api/courses/{cours}/flashcards", headers=etudiant)
        carte = client.get(f"/api/courses/{cours}/flashcards", headers=etudiant).json()[
            "cards"
        ][0]
        client.post(
            f"/api/flashcards/{carte['id']}/review",
            headers=etudiant,
            json={"bouton": "facile"},
        )

        client.post(
            f"/api/courses/{cours}/quiz", headers=etudiant, json={"questionCount": 5}
        )
        client.post(f"/api/courses/{cours}/flashcards", headers=etudiant)

        etat = client.post(
            f"/api/courses/{cours}/flashcards", headers=etudiant
        ).json()["etat"]
        assert etat["total"] == 5
        assert etat["neuves"] == 4, "une carte revisee est repassee a neuf"


class TestRefusExplicite:
    def test_un_cours_sans_quiz_refuse_au_lieu_de_generer(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        cours = client.post(
            "/api/courses",
            headers=etudiant,
            json={"title": "Sans quiz", "content": COURS_COURT},
        ).json()["course"]["id"]
        avant = len(faux_modele.appels)

        reponse = client.post(f"/api/courses/{cours}/flashcards", headers=etudiant)
        assert reponse.status_code == 400
        assert reponse.json()["error"]["code"] == "VALIDATION_ERROR"
        assert len(faux_modele.appels) == avant, "un quiz a ete genere en silence"

    def test_une_note_inconnue_est_refusee_avec_les_valeurs_attendues(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        cours = cours_avec_quiz(client, etudiant)
        client.post(f"/api/courses/{cours}/flashcards", headers=etudiant)
        carte = client.get(f"/api/courses/{cours}/flashcards", headers=etudiant).json()[
            "cards"
        ][0]

        reponse = client.post(
            f"/api/flashcards/{carte['id']}/review",
            headers=etudiant,
            json={"bouton": "peut-etre"},
        )
        assert reponse.status_code == 400
        assert reponse.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_une_carte_inexistante_rend_un_404_et_non_un_500(
        self, client: TestClient, etudiant: dict
    ) -> None:
        reponse = client.post(
            "/api/flashcards/inconnue/review",
            headers=etudiant,
            json={"bouton": "correct"},
        )
        assert reponse.status_code == 404
        assert reponse.json()["error"]["code"] == "NOT_FOUND"


class TestIsolation:
    def test_un_autre_etudiant_ne_voit_pas_le_jeu(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        cours = cours_avec_quiz(client, etudiant)
        client.post(f"/api/courses/{cours}/flashcards", headers=etudiant)
        intrus = second_etudiant(client)

        assert (
            client.get(f"/api/courses/{cours}/flashcards", headers=intrus).status_code
            == 403
        )

    def test_un_autre_etudiant_ne_peut_pas_reviser_une_carte(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        """
        La carte n'a pas de proprietaire a elle : c'est le cours qui en porte
        un. Sans cette verification, connaitre un identifiant de carte
        suffirait a faire avancer le jeu de quelqu'un d'autre.
        """
        cours = cours_avec_quiz(client, etudiant)
        client.post(f"/api/courses/{cours}/flashcards", headers=etudiant)
        carte = client.get(f"/api/courses/{cours}/flashcards", headers=etudiant).json()[
            "cards"
        ][0]
        intrus = second_etudiant(client)

        reponse = client.post(
            f"/api/flashcards/{carte['id']}/review",
            headers=intrus,
            json={"bouton": "facile"},
        )
        assert reponse.status_code == 403

    def test_sans_jeton_rien_n_est_accessible(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        cours = cours_avec_quiz(client, etudiant)
        assert client.get(f"/api/courses/{cours}/flashcards").status_code == 401


class TestEcheances:
    def test_une_carte_neuve_est_due_tout_de_suite(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        """Sinon l'etudiant fabrique son jeu et tombe sur un ecran vide."""
        cours = cours_avec_quiz(client, etudiant, nombre=5)
        client.post(f"/api/courses/{cours}/flashcards", headers=etudiant)

        jeu = client.get(f"/api/courses/{cours}/flashcards", headers=etudiant).json()
        assert len(jeu["cards"]) == 5
        assert jeu["etat"]["dues"] == 5

    def test_une_carte_revisee_quitte_la_session_du_jour(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        cours = cours_avec_quiz(client, etudiant, nombre=5)
        client.post(f"/api/courses/{cours}/flashcards", headers=etudiant)
        carte = client.get(f"/api/courses/{cours}/flashcards", headers=etudiant).json()[
            "cards"
        ][0]

        client.post(
            f"/api/flashcards/{carte['id']}/review",
            headers=etudiant,
            json={"bouton": "correct"},
        )
        restantes = client.get(
            f"/api/courses/{cours}/flashcards", headers=etudiant
        ).json()["cards"]
        assert carte["id"] not in [c["id"] for c in restantes]
        assert len(restantes) == 4

    def test_un_oubli_ramene_la_carte_des_le_lendemain(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        cours = cours_avec_quiz(client, etudiant)
        client.post(f"/api/courses/{cours}/flashcards", headers=etudiant)
        carte = client.get(f"/api/courses/{cours}/flashcards", headers=etudiant).json()[
            "cards"
        ][0]

        apres = client.post(
            f"/api/flashcards/{carte['id']}/review",
            headers=etudiant,
            json={"bouton": "oublie"},
        ).json()
        assert apres["intervalle"] == 1
        assert apres["repetitions"] == 0

    def test_une_carte_en_retard_revient_dans_la_session(
        self, client: TestClient, etudiant: dict, faux_modele, session_fabrique
    ) -> None:
        """
        On ne peut pas attendre un mois : on recule l'echeance en base. Sans ce
        test, rien ne verifierait que la requete « cartes dues » lit bien une
        DATE et non un drapeau.
        """
        cours = cours_avec_quiz(client, etudiant, nombre=3)
        client.post(f"/api/courses/{cours}/flashcards", headers=etudiant)
        for carte in client.get(
            f"/api/courses/{cours}/flashcards", headers=etudiant
        ).json()["cards"]:
            client.post(
                f"/api/flashcards/{carte['id']}/review",
                headers=etudiant,
                json={"bouton": "facile"},
            )
        assert (
            client.get(f"/api/courses/{cours}/flashcards", headers=etudiant).json()[
                "cards"
            ]
            == []
        )

        with session_fabrique() as session:
            for carte in session.query(Carte).all():
                carte.due_le = datetime.now(timezone.utc) - timedelta(days=2)
            session.commit()

        assert (
            len(
                client.get(
                    f"/api/courses/{cours}/flashcards", headers=etudiant
                ).json()["cards"]
            )
            == 3
        )

    def test_la_session_est_plafonnee(
        self, client: TestClient, etudiant: dict, faux_modele, session_fabrique
    ) -> None:
        """
        Au-dela, la session n'est plus tenable d'une traite — et l'abandon au
        milieu est pire que de ne pas commencer, les cartes vues restant
        marquees comme revisees.
        """
        cours = cours_avec_quiz(client, etudiant, nombre=5)
        client.post(f"/api/courses/{cours}/flashcards", headers=etudiant)

        with session_fabrique() as session:
            for i in range(PAR_SESSION + 5):
                session.add(
                    Carte(
                        course_id=cours,
                        cle=f"carte ajoutee {i}",
                        recto=f"Enonce {i} ?",
                        verso="Reponse",
                        explication="Explication.",
                        citation=None,
                        facilite=2.5,
                        intervalle=0,
                        repetitions=0,
                        due_le=datetime.now(timezone.utc) - timedelta(days=1),
                        revisions=0,
                    )
                )
            session.commit()

        jeu = client.get(f"/api/courses/{cours}/flashcards", headers=etudiant).json()
        assert len(jeu["cards"]) == PAR_SESSION
        assert jeu["etat"]["total"] == PAR_SESSION + 10


class TestContenu:
    def test_le_verso_descend_avec_la_carte(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        """
        CHOIX INVERSE DE CELUI DU QUIZ, et delibere. Le quiz retire la bonne
        reponse avant l'envoi parce qu'il est note. Une carte est auto-evaluee
        et doit se retourner sans aller-retour reseau : il n'y a rien a
        proteger. Ce test fige la decision pour qu'elle ne passe pas pour un
        oubli lors d'une relecture.
        """
        cours = cours_avec_quiz(client, etudiant)
        client.post(f"/api/courses/{cours}/flashcards", headers=etudiant)
        carte = client.get(f"/api/courses/{cours}/flashcards", headers=etudiant).json()[
            "cards"
        ][0]

        assert carte["verso"]
        assert carte["explication"]
        assert carte["recto"] != carte["verso"]

    def test_le_verso_est_la_bonne_option_et_non_son_rang(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        """
        Stocker `correctIndex` obligerait a garder les options a cote, et une
        carte dont le verso serait « 2 » n'apprendrait rien.
        """
        cours = cours_avec_quiz(client, etudiant)
        client.post(f"/api/courses/{cours}/flashcards", headers=etudiant)
        carte = client.get(f"/api/courses/{cours}/flashcards", headers=etudiant).json()[
            "cards"
        ][0]
        assert carte["verso"].startswith("Option ")


class TestCycleDeVie:
    def test_supprimer_le_cours_emporte_ses_cartes(
        self, client: TestClient, etudiant: dict, faux_modele, session_fabrique
    ) -> None:
        """
        Contrairement a l'examen blanc, qui porte sur plusieurs cours et doit
        survivre a la suppression de l'un d'eux. Une carte appartient a un
        seul cours et n'a plus de sens sans lui.
        """
        cours = cours_avec_quiz(client, etudiant)
        client.post(f"/api/courses/{cours}/flashcards", headers=etudiant)

        assert client.delete(f"/api/courses/{cours}", headers=etudiant).status_code == 204
        with session_fabrique() as session:
            assert session.query(Carte).filter(Carte.course_id == cours).count() == 0

    def test_la_reinitialisation_garde_les_cartes_et_remet_l_avancement(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        cours = cours_avec_quiz(client, etudiant, nombre=5)
        client.post(f"/api/courses/{cours}/flashcards", headers=etudiant)
        for carte in client.get(
            f"/api/courses/{cours}/flashcards", headers=etudiant
        ).json()["cards"]:
            client.post(
                f"/api/flashcards/{carte['id']}/review",
                headers=etudiant,
                json={"bouton": "facile"},
            )

        etat = client.post(
            f"/api/courses/{cours}/flashcards/reset", headers=etudiant
        ).json()
        assert etat["total"] == 5, "les cartes ont ete supprimees"
        assert etat["neuves"] == 5
        assert etat["dues"] == 5

    def test_le_compte_des_acquises_suit_l_intervalle(
        self, client: TestClient, etudiant: dict, faux_modele, session_fabrique
    ) -> None:
        cours = cours_avec_quiz(client, etudiant, nombre=3)
        client.post(f"/api/courses/{cours}/flashcards", headers=etudiant)
        with session_fabrique() as session:
            carte = session.query(Carte).first()
            carte.intervalle = 30
            carte.repetitions = 5
            session.commit()

        etat = client.get(
            f"/api/courses/{cours}/flashcards", headers=etudiant
        ).json()["etat"]
        assert etat["acquises"] == 1
        assert etat["total"] == 3
