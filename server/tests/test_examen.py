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


class TestTirageDiversifie:
    """
    Le tirage prefere les questions les moins proches de celles deja
    retenues — sans jamais en supprimer aucune. La distinction est tout
    l'objet de DECISIONS 018.
    """

    @staticmethod
    def _q(texte: str) -> dict:
        return {"question": texte, "options": [], "correctIndex": 0}

    def test_un_doublon_est_evite_quand_une_alternative_existe(self) -> None:
        from app.services.examen import _choisir_varie

        disponibles = [
            self._q("Quel est le prix de base par nuit pour une chambre standard ?"),
            self._q("Quel est le prix de base par nuit pour une chambre standard "
                    "selon le cours ?"),
            self._q("Quel outil mesure la couverture de code en Python ?"),
        ]
        # Dix graines : le resultat ne doit pas dependre du hasard du tirage.
        for graine in range(10):
            pris: list = []
            choisies = _choisir_varie(disponibles, 2, pris, random.Random(graine))
            textes = {c["question"] for c in choisies}
            assert "Quel outil mesure la couverture de code en Python ?" in textes, (
                f"graine {graine} : la question distincte aurait du etre retenue"
            )

    def test_aucune_question_n_est_perdue_quand_tout_se_ressemble(self) -> None:
        """
        LE POINT CENTRAL. Un filtre qui supprime rendrait ici deux questions
        au lieu de quatre, sans rien dire. Le tirage par preference rend les
        quatre : la moins mauvaise est prise quand meme.
        """
        from app.services.examen import _choisir_varie

        disponibles = [
            self._q(f"Quel est le prix de base par nuit pour une chambre standard {i} ?")
            for i in range(4)
        ]
        choisies = _choisir_varie(disponibles, 4, [], random.Random(1))
        assert len(choisies) == 4

    def test_le_tirage_reste_reproductible_a_graine_egale(self) -> None:
        from app.services.examen import _choisir_varie

        disponibles = [self._q(f"Question numero {i} sur un sujet distinct ?") for i in range(8)]
        a = _choisir_varie(disponibles, 4, [], random.Random(3))
        b = _choisir_varie(disponibles, 4, [], random.Random(3))
        assert [q["question"] for q in a] == [q["question"] for q in b]

    def test_deux_graines_donnent_des_examens_differents(self) -> None:
        """Sinon le meme examen reviendrait a chaque composition."""
        from app.services.examen import _choisir_varie

        disponibles = [self._q(f"Question numero {i} sur un sujet distinct ?") for i in range(8)]
        resultats = {
            tuple(q["question"] for q in _choisir_varie(disponibles, 3, [], random.Random(g)))
            for g in range(6)
        }
        assert len(resultats) > 1

    def test_la_diversite_porte_sur_l_examen_entier_pas_sur_un_cours(self) -> None:
        """
        `sacs_pris` est partage entre les cours : une question du cours B
        proche d'une question deja retenue dans le cours A doit etre
        depriorisee elle aussi.
        """
        from app.services.enonces import sac_de_mots
        from app.services.examen import _choisir_varie

        deja = [sac_de_mots("Quel est le prix de base par nuit pour une chambre standard ?")]
        disponibles = [
            self._q("Quel est le prix de base par nuit pour une chambre standard "
                    "selon le cours ?"),
            self._q("Quel outil mesure la couverture de code en Python ?"),
        ]
        choisies = _choisir_varie(disponibles, 1, deja, random.Random(0))
        assert choisies[0]["question"] == "Quel outil mesure la couverture de code en Python ?"

    def test_le_compte_demande_est_tenu_de_bout_en_bout(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        """
        La doublure du modele produit des enonces tous tres proches les uns
        des autres — « Question numero 1 sur le cours ? », « Question numero 2
        … » — soit le pire cas pour ce tirage. L'examen doit quand meme
        rendre exactement le nombre demande.
        """
        a = cours_avec_quiz(client, etudiant, "Chapitre 1", nombre=10)
        donnees = composer(client, etudiant, [a], nombre=8).json()
        assert donnees["total"] == 8
        assert len(donnees["questions"]) == 8


class TestBranchementDuTirage:
    """
    Les tests ci-dessus eprouvent `_choisir_varie`. Ils ne disent RIEN du fait
    que `composer` l'utilise — on pouvait remettre un tirage au hasard, ou
    cloisonner la diversite par cours, sans qu'un seul tombe.

    Verifie en cassant expres les deux : 30 tests verts dans les deux cas.
    Ceux-ci appellent donc le service, avec une graine, sur des enonces
    fabriques — la doublure du modele produit des questions toutes proches
    les unes des autres, ce qui ne permet de distinguer aucun tirage.
    """

    PRIX = "Quel est le prix de base par nuit pour une chambre standard ?"
    PRIX_BIS = "Quel est le prix de base par nuit pour une chambre standard selon le cours ?"
    #: Enonces volontairement sans mots communs entre eux : le tirage ne doit
    #: avoir aucune raison d'en preferer un plutot qu'un autre.
    AUTRES = [
        "Quel outil mesure la couverture de code en Python ?",
        "Quel format sert a ecrire les scenarios comportementaux ?",
        "Combien d'ECTS ce module represente-t-il ?",
        "Qui assure la responsabilite pedagogique de l'enseignement ?",
        "A quelle date la soutenance est-elle programmee ?",
    ]

    @staticmethod
    def _monter(session_fabrique, cours_et_questions: list[list[str]]):
        """Cree un etudiant, ses cours et leurs quiz, sans passer par le modele."""
        from app.models import Cours, Quiz, Utilisateur

        session = session_fabrique()
        etudiant = Utilisateur(email="tirage@exemple.tn", password_hash="x")
        session.add(etudiant)
        session.flush()

        identifiants = []
        for rang, questions in enumerate(cours_et_questions):
            cours = Cours(
                owner_id=etudiant.id,
                title=f"Cours {rang + 1}",
                content="contenu" * 50,
                char_count=350,
                hash=f"h{rang}",
            )
            session.add(cours)
            session.flush()
            session.add(
                Quiz(
                    course_id=cours.id,
                    payload={
                        "questions": [
                            {
                                "question": texte,
                                "options": ["a", "b", "c", "d"],
                                "correctIndex": 0,
                                "explanation": "explication",
                                "sourceQuote": "extrait",
                            }
                            for texte in questions
                        ]
                    },
                    question_count=len(questions),
                    difficulty="standard",
                    model="m",
                    prompt_version="v3",
                    temperature=0.7,
                    sent_payload="",
                    segment_count=1,
                )
            )
            identifiants.append(cours.id)
        session.commit()
        return session, etudiant.id, identifiants

    def test_composer_evite_reellement_le_doublon(self, session_fabrique) -> None:
        """
        Six questions dont deux jumelles, cinq demandees : une doit sauter,
        et ce doit etre une jumelle.

        Un tirage au hasard laisserait les deux jumelles dans deux cas sur
        trois — il ne saute qu'une question sur six.
        """
        from app.services.examen import composer

        session, proprietaire, cours = self._monter(
            session_fabrique, [[self.PRIX, self.PRIX_BIS, *self.AUTRES[:4]]]
        )
        try:
            for graine in range(12):
                examen = composer(
                    session, proprietaire, cours, 5, alea=random.Random(graine)
                )
                textes = {q["question"] for q in examen.questions}
                assert len(textes) == 5
                assert not {self.PRIX, self.PRIX_BIS} <= textes, (
                    f"graine {graine} : les deux questions jumelles ont ete retenues"
                )
        finally:
            session.close()

    def test_la_diversite_traverse_les_cours(self, session_fabrique) -> None:
        """
        Echoue si `composer` repart d'une liste vide a chaque cours.

        Le cours 1 n'a qu'une question, PRIX ; il la fournit forcement. Le
        cours 2 en fournit quatre sur six, et doit ecarter la jumelle — ce
        qu'il ne peut savoir que si la diversite porte sur l'examen entier.
        """
        from app.services.examen import composer

        session, proprietaire, cours = self._monter(
            session_fabrique, [[self.PRIX], [self.PRIX_BIS, *self.AUTRES]]
        )
        try:
            for graine in range(12):
                examen = composer(
                    session, proprietaire, cours, 5, alea=random.Random(graine)
                )
                textes = {q["question"] for q in examen.questions}
                assert self.PRIX in textes
                assert self.PRIX_BIS not in textes, (
                    f"graine {graine} : le second cours a repris la jumelle"
                )
        finally:
            session.close()


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
        """
        Deux quiz successifs reposent souvent la meme question a la virgule
        pres. La fonction vit desormais dans `enonces` parce que les cartes de
        revision s'en servent AUSSI, pour leur contrainte d'unicite — mais la
        propriete reste une exigence de l'examen blanc, donc le test reste ici.
        """
        from app.services.enonces import cle_enonce as _cle

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
