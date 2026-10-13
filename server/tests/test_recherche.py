"""
Recherche et tuteur transversaux.

La propriete qui compte le plus ici est un COUT : la recherche ne doit
appeler le modele sous aucun pretexte, et le tuteur transversal ne doit
l'appeler qu'une fois, quel que soit le nombre de cours. C'est ce qui rend
la fonctionnalite tenable sur un palier gratuit, et c'est donc ce qui est
teste en premier.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

ORDONNANCEMENT = (
    "L'ordonnanceur arbitre l'acces au processeur entre les processus prets. "
    "Lorsque le quantum expire, il reprend la main et choisit un autre "
    "processus. Ce mecanisme s'appelle la preemption. " * 3
)

FUZZING = (
    "L'execution symbolique explore les chemins du programme en raisonnant "
    "sur des valeurs abstraites. Le fuzzing, lui, genere des entrees "
    "aleatoires pour provoquer des defaillances inattendues. " * 3
)

CUISINE = (
    "La bechamel se prepare avec un roux blanc, du lait et une pincee de "
    "muscade. Il faut remuer sans arret pour eviter les grumeaux. " * 3
)


def deposer(client: TestClient, entetes: dict, titre: str, contenu: str) -> str:
    reponse = client.post(
        "/api/courses", headers=entetes, json={"title": titre, "content": contenu}
    )
    assert reponse.status_code == 201, reponse.text
    return reponse.json()["course"]["id"]


def bibliotheque(client: TestClient, entetes: dict) -> dict[str, str]:
    return {
        "systemes": deposer(client, entetes, "Systemes d'exploitation", ORDONNANCEMENT),
        "tests": deposer(client, entetes, "Tests et IA", FUZZING),
        "cuisine": deposer(client, entetes, "Cuisine", CUISINE),
    }


class TestRecherche:
    def test_la_recherche_n_appelle_jamais_le_modele(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        """L'argument central : la recherche est locale, gratuite, instantanee."""
        bibliotheque(client, etudiant)

        avant = len(faux_modele.appels)
        reponse = client.get("/api/search?q=preemption", headers=etudiant)
        assert reponse.status_code == 200, reponse.text
        assert len(faux_modele.appels) == avant

    def test_elle_trouve_le_bon_cours(self, client: TestClient, etudiant: dict) -> None:
        cours = bibliotheque(client, etudiant)

        donnees = client.get("/api/search?q=fuzzing", headers=etudiant).json()
        assert donnees["passages"], "aucun passage trouve"
        assert donnees["passages"][0]["courseId"] == cours["tests"]
        assert donnees["passages"][0]["courseTitle"] == "Tests et IA"

    def test_l_extrait_est_une_fenetre_autour_du_mot_cherche(
        self, client: TestClient, etudiant: dict
    ) -> None:
        """
        Rendre le debut du segment serait plus simple et inutile : sur un
        segment long, le mot cherche n'est presque jamais dans les 300
        premiers caracteres.

        Le mot est donc place DELIBEREMENT loin du debut. Une premiere version
        de ce test cherchait « muscade » dans un cours ou il apparaissait des
        la deuxieme phrase : elle passait aussi bien avec un extrait naif, et
        ne prouvait donc rien.
        """
        remplissage = (
            "Cette phrase de remplissage ne contient aucun terme recherche. " * 60
        )
        deposer(
            client,
            etudiant,
            "Cours long",
            remplissage + " Le theoreme de Rice est indecidable. " + remplissage,
        )

        extrait = client.get("/api/search?q=theoreme Rice", headers=etudiant).json()[
            "passages"
        ][0]["extrait"]

        assert "Rice" in extrait
        assert extrait.startswith("…"), "la fenetre devrait commencer en cours de texte"

    def test_un_mot_absent_de_tous_les_cours_ne_rend_rien(
        self, client: TestClient, etudiant: dict
    ) -> None:
        """
        Un resultat vide est une information. Rendre les passages de score nul
        remplirait la page de bruit et ferait croire a une correspondance.
        """
        bibliotheque(client, etudiant)

        donnees = client.get("/api/search?q=photosynthese", headers=etudiant).json()
        assert donnees["passages"] == []

    def test_elle_ignore_les_cours_des_autres(
        self, client: TestClient, etudiant: dict
    ) -> None:
        bibliotheque(client, etudiant)

        autre = client.post(
            "/api/auth/register",
            json={"email": "intrus@exemple.tn", "password": "motdepasse-solide"},
        )
        entetes = {"Authorization": f"Bearer {autre.json()['token']}"}

        assert client.get("/api/search?q=fuzzing", headers=entetes).json()["passages"] == []

    def test_les_mots_cherches_sont_rendus_au_navigateur(
        self, client: TestClient, etudiant: dict
    ) -> None:
        """
        Pour que le surlignage applique EXACTEMENT les memes regles que le
        classement. Redecouper la requete cote navigateur ferait diverger les
        deux a la premiere evolution.
        """
        bibliotheque(client, etudiant)

        donnees = client.get(
            "/api/search?q=le fuzzing et la preemption", headers=etudiant
        ).json()
        # « le » et « la » font moins de trois lettres : ecartes.
        assert donnees["terms"] == ["fuzzing", "preemption"]


class TestSingulierPluriel:
    """
    Le ratage le plus frequent d'une recherche lexicale en francais, et le
    plus deroutant : l'utilisateur voit le mot dans son document.
    """

    def test_le_singulier_trouve_le_pluriel(
        self, client: TestClient, etudiant: dict
    ) -> None:
        """Mesure d'origine : « binome » ne trouvait pas « en binomes »."""
        deposer(
            client,
            etudiant,
            "Atelier",
            "Le travail de cet atelier se fait en binomes. " * 8,
        )
        donnees = client.get("/api/search?q=binome", headers=etudiant).json()
        assert donnees["passages"], "« binome » devrait trouver « binomes »"

    def test_le_pluriel_trouve_le_singulier(
        self, client: TestClient, etudiant: dict
    ) -> None:
        deposer(
            client, etudiant, "Depot", "Chaque equipe rend un depot distinct. " * 8
        )
        assert client.get("/api/search?q=depots", headers=etudiant).json()["passages"]

    def test_l_elargissement_ne_racinise_pas(self) -> None:
        """
        Honnetete sur ce que cela ne fait pas : « tester » ne trouvera pas
        « test ». La limite est reduite, pas supprimee.
        """
        from app.services.recherche import elargir

        assert set(elargir("binome").split()) == {"binome", "binomes", "binomex"}
        assert set(elargir("depots").split()) == {"depots", "depot"}
        assert "test" not in elargir("tester").split()

    def test_les_mots_surlignes_restent_ceux_de_la_requete(
        self, client: TestClient, etudiant: dict
    ) -> None:
        """
        L'elargissement sert au CLASSEMENT, pas a l'affichage. Surligner
        « binomex » dans un extrait n'aurait aucun sens.
        """
        deposer(client, etudiant, "Atelier", "Le travail se fait en binomes. " * 8)
        donnees = client.get("/api/search?q=binome", headers=etudiant).json()
        assert donnees["terms"] == ["binome"]


class TestTuteurTransversal:
    def test_un_seul_appel_quel_que_soit_le_nombre_de_cours(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        """
        La selection des passages etant locale, dix cours ne coutent pas dix
        fois plus cher qu'un seul.
        """
        bibliotheque(client, etudiant)

        avant = len(faux_modele.appels)
        reponse = client.post(
            "/api/ask", headers=etudiant, json={"question": "Qu'est-ce que le fuzzing ?"}
        )
        assert reponse.status_code == 200, reponse.text
        assert len(faux_modele.appels) - avant == 1

    def test_il_nomme_les_cours_consultes(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        bibliotheque(client, etudiant)

        donnees = client.post(
            "/api/ask", headers=etudiant, json={"question": "Parle-moi du fuzzing"}
        ).json()
        assert donnees["appeleLeModele"] is True
        assert any(c["title"] == "Tests et IA" for c in donnees["courses"])

    def test_une_question_sans_correspondance_ne_coute_rien(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        """
        Sans passage a lire, le modele aurait conclu la meme chose — avec le
        risque de completer par ses connaissances generales. Refuser en local
        est plus rapide, gratuit, et PLUS juste.
        """
        bibliotheque(client, etudiant)

        avant = len(faux_modele.appels)
        donnees = client.post(
            "/api/ask", headers=etudiant, json={"question": "photosynthese chlorophylle"}
        ).json()

        assert len(faux_modele.appels) == avant
        assert donnees["appeleLeModele"] is False
        assert donnees["grounded"] is False

    def test_les_titres_de_cours_passent_par_l_anonymisation(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        """
        Un titre de cours peut contenir un nom ou un courriel. Il part au
        modele comme le reste du contenu, donc il doit etre masque comme lui.
        """
        deposer(
            client,
            etudiant,
            "Atelier de contact.prive@exemple.tn",
            FUZZING,
        )

        client.post("/api/ask", headers=etudiant, json={"question": "Le fuzzing ?"})

        envoye = "\n".join(a["user"] for a in faux_modele.appels)
        assert "contact.prive@exemple.tn" not in envoye
        assert "[EMAIL_1]" in envoye

    def test_le_tuteur_transversal_est_plafonne(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        """Il appelle le modele : il doit compter dans le quota, comme les autres."""
        bibliotheque(client, etudiant)

        codes = [
            client.post(
                "/api/ask", headers=etudiant, json={"question": "Le fuzzing ?"}
            ).status_code
            for _ in range(12)
        ]
        assert 429 in codes


class TestBM25Partage:
    def test_la_recherche_et_le_tuteur_partagent_la_meme_formule(self) -> None:
        """
        Deux implementations de BM25 auraient fini par diverger, et la seconde
        n'aurait ete testee par personne. Ce test echoue si quelqu'un en
        reintroduit une.
        """
        import inspect

        from app.services import recherche, segmentation

        assert "scores_bm25" in inspect.getsource(segmentation.selectionner)
        assert "scores_bm25" in inspect.getsource(recherche.chercher)

    def test_un_mot_rare_pese_plus_qu_un_mot_frequent(self) -> None:
        from app.services.segmentation import scores_bm25

        textes = [
            "le processus et le processeur et le quantum",
            "le processus et le processeur et la preemption",
            "le processus et le processeur et le quantum",
        ]
        # « preemption » n'apparait que dans le second ; « processus » partout.
        rares = scores_bm25(textes, "preemption")
        frequents = scores_bm25(textes, "processus")

        assert rares[1] > rares[0] == rares[2] == 0.0
        assert max(rares) > max(frequents)
