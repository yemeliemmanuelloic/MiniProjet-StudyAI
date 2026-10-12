"""
Tests du decoupage.

Le test le plus important est `test_la_fin_du_cours_est_atteinte` : c'est
exactement ce que l'ancienne implementation ne faisait pas. Elle coupait a
20 000 caracteres et le reste du cours disparaissait sans un mot. Un test qui
echoue sur l'ancien code et passe sur le nouveau est la seule preuve serieuse
qu'un defaut est corrige.
"""

import pytest

from app.services.segmentation import (
    decouper,
    echelonner,
    repartir,
    selectionner,
)


def cours_long(parties: int = 12, marque_finale: str = "ZZCONCLUSIONZZ") -> str:
    """Fabrique un cours de plusieurs milliers de caracteres, en paragraphes."""
    blocs = [
        f"Chapitre {i}. "
        + f"Notion numero {i} expliquee en detail pour occuper de la place. " * 20
        for i in range(1, parties + 1)
    ]
    blocs.append(f"{marque_finale} : derniere notion du cours, a ne pas perdre.")
    return "\n\n".join(blocs)


class TestDecoupage:
    def test_un_cours_court_reste_entier(self) -> None:
        texte = "Un cours bref mais complet. " * 10
        resultat = decouper(texte, taille=8000)
        assert resultat.nombre == 1
        assert resultat.est_court
        assert resultat.segments[0].texte == texte.strip()
        assert not resultat.tronque

    def test_un_cours_long_est_decoupe(self) -> None:
        resultat = decouper(cours_long(), taille=2000, recouvrement=100)
        assert resultat.nombre > 1
        assert not resultat.est_court

    def test_la_fin_du_cours_est_atteinte(self) -> None:
        """Regression : l'ancienne troncature perdait la fin du cours."""
        texte = cours_long(parties=40)
        resultat = decouper(texte, taille=2000, recouvrement=100, maximum=100)

        assemble = "".join(s.texte for s in resultat.segments)
        assert "ZZCONCLUSIONZZ" in assemble, "la derniere notion du cours a disparu"
        assert not resultat.tronque

    def test_aucun_chapitre_n_est_perdu(self) -> None:
        """
        Atteindre la fin ne suffit pas : rien ne doit disparaitre au milieu.
        Un decoupage qui saute un paragraphe serait aussi grave que l'ancienne
        troncature, et bien plus difficile a reperer.
        """
        texte = cours_long(parties=40)
        resultat = decouper(texte, taille=2000, recouvrement=100, maximum=100)

        assemble = "".join(s.texte for s in resultat.segments)
        perdus = [i for i in range(1, 41) if f"Chapitre {i}." not in assemble]
        assert perdus == [], f"chapitres absents du decoupage : {perdus}"

    def test_aucun_mot_n_est_coupe_en_deux(self) -> None:
        texte = cours_long(parties=20)
        resultat = decouper(texte, taille=2000, recouvrement=0)
        for segment in resultat.segments:
            # Chaque segment commence et finit sur un mot entier : il ne doit
            # jamais commencer par un fragment du type « tion numero ».
            assert not segment.texte.startswith("tion ")

    def test_le_recouvrement_relie_les_segments(self) -> None:
        resultat = decouper(cours_long(parties=20), taille=2000, recouvrement=200)
        assert resultat.nombre >= 2
        # Le segment suivant reprend la fin du precedent, suivie d'un marqueur.
        assert "[…]" in resultat.segments[1].texte

    def test_le_depassement_du_maximum_est_signale(self) -> None:
        resultat = decouper(cours_long(parties=40), taille=1000, maximum=3)
        assert resultat.nombre == 3
        assert resultat.tronque, "une troncature doit toujours etre signalee"

    def test_un_bloc_sans_ponctuation_est_coupe_de_force(self) -> None:
        # Cas limite reel : une table ou un listing colle sans espace.
        texte = "A" * 5000
        resultat = decouper(texte, taille=1000, recouvrement=0)
        assert resultat.nombre >= 5

    def test_texte_vide(self) -> None:
        resultat = decouper("   \n\n  ", taille=1000)
        assert resultat.segments == []
        assert resultat.nombre == 0


class TestSelection:
    def test_retient_le_segment_qui_parle_du_sujet(self) -> None:
        texte = "\n\n".join(
            [
                "Chapitre 1. " + "Les systemes de fichiers stockent les donnees. " * 30,
                "Chapitre 2. " + "La pagination memoire traduit les adresses. " * 30,
                "Chapitre 3. " + "Les sockets reseau transportent les paquets. " * 30,
            ]
        )
        segments = decouper(texte, taille=1200, recouvrement=0).segments
        retenus = selectionner(segments, "Comment fonctionne la pagination ?", nombre=1)
        assert "pagination" in retenus[0].texte.lower()

    def test_sans_mot_commun_renvoie_le_debut(self) -> None:
        segments = decouper(cours_long(parties=20), taille=1500, recouvrement=0).segments
        retenus = selectionner(segments, "xyzzy plugh frobnicate", nombre=2)
        assert [s.index for s in retenus] == [0, 1]

    def test_les_segments_restent_dans_l_ordre_du_cours(self) -> None:
        segments = decouper(cours_long(parties=20), taille=1500, recouvrement=0).segments
        retenus = selectionner(segments, "Notion numero 12 et notion numero 3", nombre=3)
        assert [s.index for s in retenus] == sorted(s.index for s in retenus)

    def test_moins_de_segments_que_demande(self) -> None:
        segments = decouper("Court. " * 50, taille=8000).segments
        assert selectionner(segments, "question", nombre=5) == segments


class TestRepartition:
    def test_echelonner_couvre_tout_le_cours(self) -> None:
        segments = decouper(cours_long(parties=30), taille=1000, recouvrement=0).segments
        retenus = echelonner(segments, 4)
        assert len(retenus) == 4
        assert retenus[0].index == 0
        # Le dernier choisi doit venir de la seconde moitie du cours, sinon le
        # quiz ne porterait que sur le debut.
        assert retenus[-1].index > len(segments) // 2

    def test_echelonner_ne_depasse_pas_le_disponible(self) -> None:
        segments = decouper(cours_long(parties=6), taille=4000, recouvrement=0).segments
        assert len(echelonner(segments, 10)) == len(segments)

    @pytest.mark.parametrize(
        ("total", "parts", "attendu"),
        [(5, 2, [3, 2]), (6, 3, [2, 2, 2]), (3, 4, [1, 1, 1, 0]), (10, 1, [10])],
    )
    def test_repartir(self, total: int, parts: int, attendu: list[int]) -> None:
        assert repartir(total, parts) == attendu
        assert sum(repartir(total, parts)) == total
