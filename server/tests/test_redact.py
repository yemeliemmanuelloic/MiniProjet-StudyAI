"""
Ce sont les tests les plus importants du projet : ils portent la regle centrale
(« jamais de donnees personnelles brutes envoyees telles quelles au LLM »).

Les cas difficiles sont volontaires — un jeu de tests qui ne contient que des
cas faciles ne prouve rien.
"""

import pytest

from app.llm.redact import masquer, restaurer, taux_de_fuite

CONNUES = {"fullName": "Amine Ben Salah", "phone": "+216 55 123 456", "city": "Tunis"}


class TestMasquage:
    def test_masque_le_nom_meme_en_minuscules(self) -> None:
        masque, _ = masquer("Cours annote par amine ben salah.", CONNUES)
        assert "amine" not in masque.lower()
        assert "ben salah" not in masque.lower()

    def test_masque_un_email(self) -> None:
        masque, _ = masquer("...\n\nContact : a.bensalah@example.com", CONNUES)
        assert "@example.com" not in masque
        assert "[EMAIL_1]" in masque

    def test_masque_un_telephone_international(self) -> None:
        masque, _ = masquer("Tel : +216 55 123 456", CONNUES)
        assert "55 123 456" not in masque

    @pytest.mark.parametrize(
        "numero",
        [
            "+216 55 123 456",  # Tunisie, groupes 2-3-3
            "55 123 456",
            "06 12 34 56 78",  # France, groupes de deux
            "0123456789",
            "(216) 55 123 456",
        ],
    )
    def test_masque_un_numero_sans_profil_connu(self, numero: str) -> None:
        """
        Regression du 12 octobre. L'ancien motif n'acceptait que des groupes de
        DEUX chiffres : « +216 55 123 456 » passait donc en clair des lors que
        le numero n'etait pas connu d'avance. Sur StudyAI il n'y a aucun profil
        connu — le motif generique est la seule protection.
        """
        masque, _ = masquer(f"Pour toute question : {numero}")
        assert numero not in masque
        assert "[TEL_1]" in masque

    def test_masque_les_profils_en_ligne(self) -> None:
        masque, _ = masquer("linkedin.com/in/abensalah", CONNUES)
        assert "abensalah" not in masque

    def test_masque_l_etablissement(self) -> None:
        masque, _ = masquer("Support distribue a ESPRIT en 2026", CONNUES)
        assert "ESPRIT" not in masque

    def test_l_etablissement_n_avale_pas_les_jetons_voisins(self) -> None:
        # Trouve le 20 octobre sur le cours de demonstration : la suite
        # capturee apres « ESPRIT » englobait le telephone et le courriel deja
        # masques, et la vue de transparence ne montrait qu'un seul jeton.
        texte = (
            "Support redige pour le module — ESPRIT — +216 55 123 456 — "
            "amine.bensalah@exemple.tn — cle de test AKIAIOSFODNN7EXAMPLE."
        )
        masque, carte = masquer(texte, CONNUES)
        for jeton in ("[ETABLISSEMENT_1]", "[TEL_1]", "[EMAIL_1]", "[SECRET_1]"):
            assert jeton in masque
        assert carte["[ETABLISSEMENT_1]"] == "ESPRIT"
        assert "cle de test" in masque

    def test_jeton_stable_pour_une_valeur_repetee(self) -> None:
        masque, _ = masquer("a@b.com puis a@b.com", CONNUES)
        assert masque.count("[EMAIL_1]") == 2
        assert "[EMAIL_2]" not in masque

    def test_laisse_intact_le_contenu_pedagogique(self) -> None:
        masque, _ = masquer(
            "L'ordonnanceur arbitre l'acces au processeur.", CONNUES
        )
        assert "ordonnanceur" in masque
        assert "processeur" in masque


class TestRestauration:
    def test_restaure_dans_une_structure_imbriquee(self) -> None:
        masque, carte = masquer("Contact : a@b.com", CONNUES)
        restaure = restaurer({"items": [{"note": masque}]}, carte)
        assert "a@b.com" in restaure["items"][0]["note"]


class TestTauxDeFuite:
    def test_vaut_zero_sur_une_charge_correctement_masquee(self) -> None:
        masque, _ = masquer("Amine Ben Salah, Tunis, +216 55 123 456", CONNUES)
        assert taux_de_fuite(masque, CONNUES) == 0

    def test_detecte_une_fuite(self) -> None:
        assert taux_de_fuite("Auteur : Amine Ben Salah", CONNUES) > 0


class TestSecrets:
    """
    Defaut constate le 1er octobre sur SkillMatch lors de la premiere
    verification reelle : une fausse clef AWS laissee dans une note partait
    vers le fournisseur.
    """

    def test_masque_une_clef_aws(self) -> None:
        masque, _ = masquer("cle de test : AKIAIOSFODNN7EXAMPLE", CONNUES)
        assert "AKIAIOSFODNN7EXAMPLE" not in masque
        assert "[SECRET_1]" in masque

    def test_masque_une_chaine_de_connexion(self) -> None:
        masque, _ = masquer(
            "base : postgresql://user:motdepasse@host:5432/db", CONNUES
        )
        assert "motdepasse" not in masque

    def test_masque_une_ligne_de_mot_de_passe(self) -> None:
        masque, _ = masquer("password: Tr0ub4dour&3", CONNUES)
        assert "Tr0ub4dour" not in masque

    def test_masque_un_jeton_hugging_face(self) -> None:
        # Cas tire du module : la correction de l'atelier 4 contenait une clef
        # en clair. Un etudiant qui colle ce fichier comme cours ne doit pas la
        # transmettre au fournisseur.
        masque, _ = masquer("TOKEN = hf_abcdefghijklmnopqrstuvwxyz0123", CONNUES)
        assert "hf_abcdefghijklmnopqrstuvwxyz0123" not in masque


class TestFauxPositifs:
    @pytest.mark.parametrize(
        "suite", ["2022-2026", "2024 2025 2026", "1998/2002"]
    )
    def test_ne_masque_pas_une_suite_d_annees(self, suite: str) -> None:
        # Une annee est une information pedagogique utile : la masquer comme un
        # numero de telephone detruirait du contenu. Le motif elargi aux
        # groupes de 2 a 4 chiffres rend ce garde-fou indispensable.
        masque, _ = masquer(f"Periode etudiee : {suite}", CONNUES)
        assert suite in masque

    def test_ne_masque_pas_une_suite_trop_courte(self) -> None:
        masque, _ = masquer("Exercice 12 34 56", CONNUES)
        assert "12 34 56" in masque
