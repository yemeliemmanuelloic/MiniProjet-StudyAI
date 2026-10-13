"""
Tests de bout en bout : HTTP -> routes -> services -> pipeline IA -> base.

Seuls la base et le fournisseur de modele sont doubles (voir conftest.py).
Ces tests couvrent ce qui ferait reellement echouer une demonstration :
l'authentification, la propriete des donnees, le secret des bonnes reponses,
le traitement des cours longs, et la forme des erreurs.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

COURS_COURT = (
    "L'ordonnanceur arbitre l'acces au processeur entre les processus prets. "
    "Lorsque le quantum expire, l'ordonnanceur reprend la main et choisit un "
    "autre processus. Ce mecanisme s'appelle la preemption. "
) * 3


def cours_long(parties: int = 25) -> str:
    return "\n\n".join(
        f"Chapitre {i}. "
        + f"La notion numero {i} est expliquee en detail dans ce paragraphe. " * 25
        for i in range(1, parties + 1)
    )


def creer_cours(client: TestClient, entetes: dict, contenu: str = COURS_COURT) -> str:
    reponse = client.post(
        "/api/courses",
        headers=entetes,
        json={"title": "Systemes d'exploitation", "subject": "SE", "content": contenu},
    )
    assert reponse.status_code == 201, reponse.text
    return reponse.json()["course"]["id"]


class TestAuthentification:
    def test_inscription_puis_connexion(self, client: TestClient) -> None:
        client.post(
            "/api/auth/register",
            json={"email": "a@exemple.tn", "password": "motdepasse-solide"},
        )
        reponse = client.post(
            "/api/auth/login",
            json={"email": "a@exemple.tn", "password": "motdepasse-solide"},
        )
        assert reponse.status_code == 200
        assert reponse.json()["user"]["email"] == "a@exemple.tn"

    def test_mot_de_passe_faux(self, client: TestClient) -> None:
        client.post(
            "/api/auth/register",
            json={"email": "b@exemple.tn", "password": "motdepasse-solide"},
        )
        reponse = client.post(
            "/api/auth/login",
            json={"email": "b@exemple.tn", "password": "mauvais-mot-de-passe"},
        )
        assert reponse.status_code == 401
        assert reponse.json()["error"]["code"] == "UNAUTHORIZED"

    def test_adresse_deja_prise(self, client: TestClient) -> None:
        donnees = {"email": "c@exemple.tn", "password": "motdepasse-solide"}
        client.post("/api/auth/register", json=donnees)
        reponse = client.post("/api/auth/register", json=donnees)
        assert reponse.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_route_protegee_sans_jeton(self, client: TestClient) -> None:
        assert client.get("/api/courses").status_code == 401


class TestCours:
    def test_creation_et_liste(self, client: TestClient, etudiant: dict) -> None:
        creer_cours(client, etudiant)
        reponse = client.get("/api/courses", headers=etudiant)
        assert reponse.status_code == 200

        cours = reponse.json()["courses"]
        assert len(cours) == 1
        # Forme attendue par le front, heritee du schema precedent.
        assert cours[0]["_count"] == {"summaries": 0, "quizzes": 0, "messages": 0}
        # Le serveur enleve les blancs de bord avant d'enregistrer.
        assert cours[0]["charCount"] == len(COURS_COURT.strip())

    def test_cours_trop_court_refuse(self, client: TestClient, etudiant: dict) -> None:
        reponse = client.post(
            "/api/courses",
            headers=etudiant,
            json={"title": "Trop court", "content": "deux lignes"},
        )
        assert reponse.status_code == 400
        assert reponse.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_un_etudiant_ne_voit_pas_le_cours_d_un_autre(
        self, client: TestClient, etudiant: dict
    ) -> None:
        identifiant = creer_cours(client, etudiant)

        autre = client.post(
            "/api/auth/register",
            json={"email": "intrus@exemple.tn", "password": "motdepasse-solide"},
        ).json()
        entetes = {"Authorization": f"Bearer {autre['token']}"}

        reponse = client.get(f"/api/courses/{identifiant}", headers=entetes)
        assert reponse.status_code == 403
        assert reponse.json()["error"]["code"] == "FORBIDDEN"

    def test_suppression(self, client: TestClient, etudiant: dict) -> None:
        identifiant = creer_cours(client, etudiant)
        assert client.delete(f"/api/courses/{identifiant}", headers=etudiant).status_code == 204
        assert client.get(f"/api/courses/{identifiant}", headers=etudiant).status_code == 404


class TestResume:
    def test_cours_court_un_seul_appel(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        identifiant = creer_cours(client, etudiant)
        reponse = client.post(
            f"/api/courses/{identifiant}/summary", headers=etudiant, json={"level": "standard"}
        )
        assert reponse.status_code == 200, reponse.text

        resume = reponse.json()["summary"]
        assert resume["segmentCount"] == 1
        assert len(faux_modele.appels) == 1
        assert len(resume["payload"]["keyPoints"]) >= 3

    def test_cours_long_resume_par_agregation(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        """
        Le defaut corrige : l'ancienne version coupait a 20 000 caracteres.
        Ici, chaque segment donne lieu a un appel, plus un appel de fusion.
        """
        identifiant = creer_cours(client, etudiant, cours_long())
        reponse = client.post(
            f"/api/courses/{identifiant}/summary", headers=etudiant, json={"level": "court"}
        )
        assert reponse.status_code == 200, reponse.text

        resume = reponse.json()["summary"]
        assert resume["segmentCount"] > 1
        assert len(faux_modele.appels) == resume["segmentCount"] + 1  # + la fusion
        assert "fusionnee" in resume["payload"]["abstract"]

    def test_le_resume_est_mis_en_cache(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        identifiant = creer_cours(client, etudiant)
        client.post(f"/api/courses/{identifiant}/summary", headers=etudiant, json={})
        client.post(f"/api/courses/{identifiant}/summary", headers=etudiant, json={})
        assert len(faux_modele.appels) == 1, "le second appel aurait du etre servi par le cache"

    def test_un_changement_de_prompt_invalide_le_cache(
        self, client: TestClient, etudiant: dict, faux_modele, monkeypatch
    ) -> None:
        """
        Sans cette regle, une amelioration des consignes resterait invisible
        tant qu'un ancien resume dormirait en cache. C'est ce qui s'est passe
        le 13 octobre avec la correction des accents.
        """
        from app.llm import tasks

        identifiant = creer_cours(client, etudiant)
        client.post(f"/api/courses/{identifiant}/summary", headers=etudiant, json={})
        assert len(faux_modele.appels) == 1

        # Meme appel : servi par le cache.
        client.post(f"/api/courses/{identifiant}/summary", headers=etudiant, json={})
        assert len(faux_modele.appels) == 1

        # Nouvelle version de prompt : le cache ne doit plus repondre.
        import dataclasses

        monkeypatch.setattr(
            tasks, "TACHE_RESUME", dataclasses.replace(tasks.TACHE_RESUME, version_prompt="v99")
        )
        from app.services import study as service_study

        monkeypatch.setattr(service_study, "TACHE_RESUME", tasks.TACHE_RESUME)

        client.post(f"/api/courses/{identifiant}/summary", headers=etudiant, json={})
        assert len(faux_modele.appels) == 2, "le changement de version doit relancer l'analyse"

    def test_la_charge_envoyee_est_consultable(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        identifiant = creer_cours(client, etudiant)
        resume = client.post(
            f"/api/courses/{identifiant}/summary", headers=etudiant, json={}
        ).json()["summary"]

        reponse = client.get(f"/api/summaries/{resume['id']}/payload", headers=etudiant)
        assert reponse.status_code == 200
        assert "ordonnanceur" in reponse.json()["payload"]
        # Ce cours ne contient aucune donnee personnelle : la liste doit etre
        # VIDE. Elle affichait auparavant NOM, EMAIL, TEL et ETABLISSEMENT,
        # parce qu'elle lisait les exemples cites dans le prompt systeme.
        assert reponse.json()["tokenMap"] == []

    def test_les_types_masques_refletent_le_cours(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        contenu = "Contact : prof@exemple.tn, tel +216 55 123 456. " + COURS_COURT
        identifiant = creer_cours(client, etudiant, contenu)
        resume = client.post(
            f"/api/courses/{identifiant}/summary", headers=etudiant, json={}
        ).json()["summary"]

        types = client.get(
            f"/api/summaries/{resume['id']}/payload", headers=etudiant
        ).json()["tokenMap"]
        assert types == ["EMAIL", "TEL"]


class TestAnonymisation:
    def test_aucune_donnee_personnelle_ne_part(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        """
        Le test qui porte la regle centrale du projet, verifie sur la chaine
        complete et non sur la seule fonction de masquage.
        """
        contenu = (
            "Notes de cours de Amine Ben Salah, joignable au +216 55 123 456 "
            "ou a amine.bensalah@exemple.tn. Support distribue a ESPRIT. "
        ) + COURS_COURT

        identifiant = creer_cours(client, etudiant, contenu)
        client.post(f"/api/courses/{identifiant}/summary", headers=etudiant, json={})

        envoye = faux_modele.appels[0]["user"]
        assert "amine.bensalah@exemple.tn" not in envoye
        assert "55 123 456" not in envoye
        assert "ESPRIT" not in envoye
        assert "[EMAIL_1]" in envoye
        # Le contenu pedagogique, lui, doit etre intact.
        assert "ordonnanceur" in envoye

    def test_limite_connue_le_nom_d_un_tiers_n_est_pas_detecte(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        """
        Limite assumee, documentee ici plutot que decouverte en soutenance.

        Sans profil connu ni modele de reconnaissance d'entites nommees, un
        nom propre isole dans un support de cours n'est pas distinguable d'un
        terme technique. StudyAI masque ce qui a une FORME reconnaissable
        (adresse, numero, URL, etablissement, secret) ; un patronyme n'en a
        pas. Le rapport doit le dire.
        """
        contenu = "Travaux diriges rediges par Hela Trabelsi. " + COURS_COURT
        identifiant = creer_cours(client, etudiant, contenu)
        client.post(f"/api/courses/{identifiant}/summary", headers=etudiant, json={})

        envoye = faux_modele.appels[0]["user"]
        assert "Hela Trabelsi" in envoye  # non masque : c'est le constat, pas un souhait


class TestQuiz:
    def test_les_bonnes_reponses_ne_descendent_pas(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        identifiant = creer_cours(client, etudiant)
        reponse = client.post(
            f"/api/courses/{identifiant}/quiz",
            headers=etudiant,
            json={"questionCount": 3, "difficulty": "standard"},
        )
        assert reponse.status_code == 200, reponse.text

        quiz = reponse.json()["quiz"]
        envoye = reponse.text
        assert "correctIndex" not in envoye
        assert "explanation" not in envoye
        assert "sourceQuote" not in envoye
        assert all(len(q["options"]) == 4 for q in quiz["questions"])

    def test_correction_cote_serveur(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        """
        Le score est calcule par le serveur, jamais par le navigateur.

        Volontairement independant de la position de la bonne reponse : celle-ci
        est melangee cote serveur (voir melanger_options). Un test qui supposait
        une position fixe testait la doublure, pas la correction.
        """
        identifiant = creer_cours(client, etudiant)
        quiz = client.post(
            f"/api/courses/{identifiant}/quiz", headers=etudiant, json={"questionCount": 3}
        ).json()["quiz"]

        reponses = [0, 0, 0]
        reponse = client.post(
            f"/api/quizzes/{quiz['id']}/submit", headers=etudiant, json={"answers": reponses}
        )
        assert reponse.status_code == 200, reponse.text
        corrige = reponse.json()

        assert corrige["attempt"]["total"] == 3
        for i, ligne in enumerate(corrige["correction"]):
            assert ligne["chosen"] == reponses[i]
            assert 0 <= ligne["correctIndex"] <= 3
            assert ligne["correct"] is (reponses[i] == ligne["correctIndex"])
            # L'explication et la citation n'apparaissent qu'apres soumission.
            assert ligne["explanation"] and ligne["sourceQuote"]

        attendu = sum(1 for l in corrige["correction"] if l["correct"])
        assert corrige["attempt"]["score"] == attendu

    def test_question_sans_reponse_comptee_fausse(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        identifiant = creer_cours(client, etudiant)
        quiz = client.post(
            f"/api/courses/{identifiant}/quiz", headers=etudiant, json={"questionCount": 3}
        ).json()["quiz"]

        corrige = client.post(
            f"/api/quizzes/{quiz['id']}/submit", headers=etudiant, json={"answers": [-1, -1, -1]}
        ).json()
        assert corrige["attempt"]["score"] == 0
        assert corrige["correction"][0]["chosen"] == -1

    def test_la_bonne_reponse_change_de_position(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        """
        Defaut constate le 13 octobre : sur six questions produites par le
        modele, cinq avaient leur bonne reponse en position A. Un QCM dont la
        reponse est presque toujours la premiere n'evalue rien.

        Le melange est impose cote serveur, pas demande au modele.
        """
        import random

        from app.llm.pipeline import melanger_options

        # La doublure place systematiquement la bonne reponse en position 0.
        questions = [
            {
                "question": f"Question {i}",
                "options": ["correcte", "fausse 1", "fausse 2", "fausse 3"],
                "correctIndex": 0,
            }
            for i in range(20)
        ]
        melanger_options(questions, random.Random(7))

        positions = {q["correctIndex"] for q in questions}
        assert len(positions) > 1, "la bonne reponse reste toujours au meme endroit"

        # Et surtout : le melange ne doit jamais changer QUELLE reponse est correcte.
        for q in questions:
            assert q["options"][q["correctIndex"]] == "correcte"

    def test_cours_long_questions_echelonnees(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        identifiant = creer_cours(client, etudiant, cours_long())
        quiz = client.post(
            f"/api/courses/{identifiant}/quiz", headers=etudiant, json={"questionCount": 8}
        ).json()["quiz"]

        assert quiz["segmentCount"] > 1
        assert len(faux_modele.appels) > 1, "le quiz doit puiser dans plusieurs parties"
        # Les parties interrogees ne doivent pas etre toutes les premieres.
        parties = [a["user"] for a in faux_modele.appels]
        assert any("Chapitre 2" in p for p in parties[:1])
        assert any("Chapitre 1." not in p for p in parties[1:])


class TestTuteur:
    def test_reponse_et_historique(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        identifiant = creer_cours(client, etudiant)
        reponse = client.post(
            f"/api/courses/{identifiant}/chat",
            headers=etudiant,
            json={"question": "Qu'est-ce que la preemption ?"},
        )
        assert reponse.status_code == 200, reponse.text

        message = reponse.json()["message"]
        assert message["role"] == "assistant"
        assert message["grounded"] is True
        assert message["sources"]

        fil = client.get(f"/api/courses/{identifiant}/messages", headers=etudiant).json()
        assert [m["role"] for m in fil["messages"]] == ["user", "assistant"]

    def test_cours_long_seuls_les_passages_utiles_partent(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        """
        Le tuteur n'envoie que les passages retenus.

        Le cours est dimensionne a partir de la configuration plutot qu'en dur :
        un test qui supposait une taille de segment donnee cassait des que
        SEGMENT_CHARS changeait, alors que la regle testee, elle, ne change pas.
        """
        from app.config import parametres

        # Assez long pour produire nettement plus de segments qu'on n'en envoie.
        caracteres_vises = parametres.SEGMENT_CHARS * (parametres.SEGMENTS_CHAT + 3)
        parties = max(25, caracteres_vises // 1600)
        texte = cours_long(parties=parties)

        identifiant = creer_cours(client, etudiant, texte)
        client.post(
            f"/api/courses/{identifiant}/chat",
            headers=etudiant,
            json={"question": "Explique la notion numero 17."},
        )

        envoye = faux_modele.appels[-1]["user"]
        assert "notion numero 17" in envoye.lower()
        assert envoye.count("--- debut du passage") == parametres.SEGMENTS_CHAT
        assert len(envoye) < len(texte), "le cours entier ne doit pas partir"

    def test_question_trop_courte(self, client: TestClient, etudiant: dict) -> None:
        identifiant = creer_cours(client, etudiant)
        reponse = client.post(
            f"/api/courses/{identifiant}/chat", headers=etudiant, json={"question": "a"}
        )
        assert reponse.status_code == 400
        assert reponse.json()["error"]["code"] == "VALIDATION_ERROR"


class TestProgression:
    """
    Espace revision. Aucun appel au modele n'est necessaire pour ces calculs :
    tout vient de la table des tentatives.
    """

    @staticmethod
    def _quiz(client: TestClient, entetes: dict, cours: str, nombre: int = 3) -> dict:
        return client.post(
            f"/api/courses/{cours}/quiz", headers=entetes, json={"questionCount": nombre}
        ).json()["quiz"]

    @staticmethod
    def _soumettre(client: TestClient, entetes: dict, quiz: str, reponses: list[int]) -> dict:
        return client.post(
            f"/api/quizzes/{quiz}/submit", headers=entetes, json={"answers": reponses}
        ).json()

    def test_sans_tentative_les_compteurs_sont_a_zero(
        self, client: TestClient, etudiant: dict
    ) -> None:
        """Un cours jamais revise renvoie des zeros, pas une erreur."""
        identifiant = creer_cours(client, etudiant)
        reponse = client.get(f"/api/courses/{identifiant}/progress", headers=etudiant)
        assert reponse.status_code == 200, reponse.text

        p = reponse.json()
        assert p["attemptCount"] == 0
        assert p["averageScore"] == 0
        assert p["trend"] == []
        assert p["weakQuestions"] == []

    def test_moyenne_et_meilleur_score(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        identifiant = creer_cours(client, etudiant)
        quiz = self._quiz(client, etudiant, identifiant)
        n = len(quiz["questions"])

        # Une tentative entierement fausse, puis une entierement juste.
        rate = self._soumettre(client, etudiant, quiz["id"], [-1] * n)
        bonnes = [ligne["correctIndex"] for ligne in rate["correction"]]
        self._soumettre(client, etudiant, quiz["id"], bonnes)

        p = client.get(f"/api/courses/{identifiant}/progress", headers=etudiant).json()
        assert p["attemptCount"] == 2
        assert p["trend"] == [0, 100]
        assert p["averageScore"] == 50
        assert p["bestScore"] == 100
        assert p["lastScore"] == 100

        # Chaque question n'a ete ratee qu'une fois : sous le seuil.
        assert p["weakQuestions"] == []

    def test_une_question_ratee_deux_fois_remonte(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        identifiant = creer_cours(client, etudiant)
        quiz = self._quiz(client, etudiant, identifiant)
        n = len(quiz["questions"])

        for _ in range(2):
            self._soumettre(client, etudiant, quiz["id"], [-1] * n)

        p = client.get(f"/api/courses/{identifiant}/progress", headers=etudiant).json()
        assert len(p["weakQuestions"]) == n
        for faible in p["weakQuestions"]:
            assert faible["wrongCount"] == 2
            assert faible["sourceQuote"], "l'extrait du cours doit accompagner la question"

    def test_la_bonne_reponse_ne_descend_pas_dans_la_progression(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        """Meme regle que pour le quiz : sinon l'auto-evaluation n'a plus de sens."""
        identifiant = creer_cours(client, etudiant)
        quiz = self._quiz(client, etudiant, identifiant)
        for _ in range(2):
            self._soumettre(client, etudiant, quiz["id"], [-1] * len(quiz["questions"]))

        texte = client.get(f"/api/courses/{identifiant}/progress", headers=etudiant).text
        assert "correctIndex" not in texte
        assert "explanation" not in texte

    def test_historique_du_plus_recent_au_plus_ancien(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        identifiant = creer_cours(client, etudiant)
        quiz = self._quiz(client, etudiant, identifiant)
        for _ in range(3):
            self._soumettre(client, etudiant, quiz["id"], [0] * len(quiz["questions"]))

        reponse = client.get(f"/api/courses/{identifiant}/attempts", headers=etudiant)
        assert reponse.status_code == 200, reponse.text
        tentatives = reponse.json()["attempts"]
        assert len(tentatives) == 3
        dates = [t["createdAt"] for t in tentatives]
        assert dates == sorted(dates, reverse=True)
        assert all(t["quizId"] == quiz["id"] for t in tentatives)

    def test_la_progression_d_un_autre_etudiant_est_refusee(
        self, client: TestClient, etudiant: dict
    ) -> None:
        identifiant = creer_cours(client, etudiant)
        autre = client.post(
            "/api/auth/register",
            json={"email": "curieux@exemple.tn", "password": "motdepasse-solide"},
        ).json()
        entetes = {"Authorization": f"Bearer {autre['token']}"}

        for route in ("progress", "attempts"):
            reponse = client.get(f"/api/courses/{identifiant}/{route}", headers=entetes)
            assert reponse.status_code == 403, route


class TestFicheRevision:
    """La fiche de revision imprimable. Aucun appel au modele."""

    def test_un_cours_vierge_refuse_plutot_que_de_rendre_une_fiche_vide(
        self, client: TestClient, etudiant: dict
    ) -> None:
        identifiant = creer_cours(client, etudiant)
        reponse = client.get(f"/api/courses/{identifiant}/revision.pdf", headers=etudiant)
        assert reponse.status_code == 400
        assert reponse.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_la_fiche_est_un_vrai_pdf(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        identifiant = creer_cours(client, etudiant)
        client.post(f"/api/courses/{identifiant}/summary", headers=etudiant, json={})

        reponse = client.get(f"/api/courses/{identifiant}/revision.pdf", headers=etudiant)
        assert reponse.status_code == 200, reponse.text
        assert reponse.headers["content-type"] == "application/pdf"
        assert "attachment" in reponse.headers["content-disposition"]
        assert reponse.content.startswith(b"%PDF"), "en-tete PDF absent"
        assert reponse.content.rstrip().endswith(b"%%EOF"), "document tronque"
        assert len(reponse.content) > 1500

    def test_la_fiche_ne_contient_pas_les_bonnes_reponses(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        """
        Une fiche de revision qui donne les reponses ne sert pas a reviser.
        On verifie sur le PDF lui-meme, pas sur les donnees qui l'alimentent.
        """
        import pymupdf

        identifiant = creer_cours(client, etudiant)
        client.post(f"/api/courses/{identifiant}/summary", headers=etudiant, json={})
        quiz = client.post(
            f"/api/courses/{identifiant}/quiz", headers=etudiant, json={"questionCount": 3}
        ).json()["quiz"]
        for _ in range(2):
            client.post(
                f"/api/quizzes/{quiz['id']}/submit",
                headers=etudiant,
                json={"answers": [-1] * len(quiz["questions"])},
            )

        contenu = client.get(
            f"/api/courses/{identifiant}/revision.pdf", headers=etudiant
        ).content

        with pymupdf.open(stream=contenu, filetype="pdf") as doc:
            texte = chr(10).join(page.get_text() for page in doc)

        # Les questions ratees sont bien presentes...
        assert "A revoir en priorite" in texte
        assert "Question 0" in texte or "Question" in texte
        # ...mais aucune des options du QCM, donc aucune bonne reponse.
        assert "correcte" not in texte.lower()
        assert "Option A" not in texte

    def test_la_fiche_d_un_autre_etudiant_est_refusee(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        identifiant = creer_cours(client, etudiant)
        client.post(f"/api/courses/{identifiant}/summary", headers=etudiant, json={})

        autre = client.post(
            "/api/auth/register",
            json={"email": "voisin@exemple.tn", "password": "motdepasse-solide"},
        ).json()
        entetes = {"Authorization": f"Bearer {autre['token']}"}

        reponse = client.get(f"/api/courses/{identifiant}/revision.pdf", headers=entetes)
        assert reponse.status_code == 403


class TestErreursModele:
    def test_sortie_non_conforme_refusee_apres_une_relance(
        self, client: TestClient, etudiant: dict, monkeypatch
    ) -> None:
        """
        « Ce qui ne valide pas n'existe pas » : une sortie hors schema ne doit
        jamais etre stockee. Le modele est relance une fois, puis l'appel
        echoue proprement.
        """
        from app.llm import run_task
        from app.llm.client import ResultatBrut

        appels: list[str] = []

        def modele_defaillant(system, user, temperature, max_tokens=2048):
            appels.append(user)
            return ResultatBrut(
                text='{"abstract": "trop court"}',
                tokens_in=1,
                tokens_out=1,
                latence_ms=1,
                model="modele-de-test",
                provider="test",
            )

        monkeypatch.setattr(run_task, "appeler_modele", modele_defaillant)

        identifiant = creer_cours(client, etudiant)
        reponse = client.post(
            f"/api/courses/{identifiant}/summary", headers=etudiant, json={}
        )

        assert reponse.status_code == 502
        assert reponse.json()["error"]["code"] == "LLM_INVALID_OUTPUT"
        assert len(appels) == 2, "une relance, pas davantage"
        assert "rejetee" in appels[1], "la relance doit citer l'erreur de schema"

    def test_absence_de_clef(self, client: TestClient, etudiant: dict, monkeypatch) -> None:
        from app.llm import client as module_client

        monkeypatch.setattr(
            type(module_client.parametres), "cle_active", property(lambda self: "")
        )

        identifiant = creer_cours(client, etudiant)
        reponse = client.post(
            f"/api/courses/{identifiant}/summary", headers=etudiant, json={}
        )
        assert reponse.status_code == 503
        assert reponse.json()["error"]["code"] == "LLM_KEY_MISSING"


class TestService:
    def test_etat_du_service(self, client: TestClient) -> None:
        donnees = client.get("/api/health").json()
        assert donnees["status"] == "ok"
        assert "model" in donnees

    def test_route_inconnue_renvoie_la_forme_du_projet(self, client: TestClient) -> None:
        reponse = client.get("/api/nexiste-pas")
        assert reponse.status_code == 404
        assert reponse.json()["error"]["code"] == "NOT_FOUND"
