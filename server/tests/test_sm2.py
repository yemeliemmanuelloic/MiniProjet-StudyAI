"""
L'algorithme de repetition espacee.

`suivant` est une fonction pure de trois nombres : elle se teste donc
exhaustivement, sans base ni horloge. C'est tout l'interet de l'avoir
separee du calcul de la date.

Ce qui est verifie en priorite n'est pas la formule — on peut la recopier —
mais ses PROPRIETES : un echec ramene la carte le lendemain, une suite de
reussites espace les revisions, et le facteur de facilite ne peut pas
s'effondrer.
"""

from __future__ import annotations

from datetime import date

import pytest

from app.services.sm2 import (
    FACILITE_MINIMALE,
    INTERVALLE_MAXIMAL,
    NOTES,
    Etat,
    etat_initial,
    prochaine_date,
    suivant,
)


class TestEchec:
    @pytest.mark.parametrize("note", [0, 1, 2])
    def test_un_echec_ramene_la_carte_des_le_lendemain(self, note: int) -> None:
        avance = Etat(facilite=2.6, intervalle=40, repetitions=7)
        apres = suivant(avance, note)
        assert apres.intervalle == 1
        assert apres.repetitions == 0

    def test_un_echec_ne_detruit_pas_le_facteur_de_facilite(self) -> None:
        """
        L'etudiant n'a pas oublie ce qu'il savait de la DIFFICULTE de la
        carte, il a rate ce rappel-ci. Remettre le facteur a zero ferait
        repartir une carte facile comme une carte dure.
        """
        avance = Etat(facilite=2.6, intervalle=40, repetitions=7)
        assert suivant(avance, NOTES["oublie"]).facilite == 2.6


class TestProgression:
    def test_les_deux_premiers_intervalles_sont_fixes(self) -> None:
        """1 jour puis 6 : ce sont les valeurs de SM-2, pas un reglage."""
        un = suivant(etat_initial(), NOTES["correct"])
        assert (un.intervalle, un.repetitions) == (1, 1)
        deux = suivant(un, NOTES["correct"])
        assert (deux.intervalle, deux.repetitions) == (6, 2)

    def test_ensuite_l_intervalle_est_multiplie_par_la_facilite(self) -> None:
        etat = Etat(facilite=2.5, intervalle=6, repetitions=2)
        assert suivant(etat, NOTES["correct"]).intervalle == 15  # 6 x 2.5

    def test_une_suite_de_reussites_espace_les_revisions(self) -> None:
        etat = etat_initial()
        intervalles = []
        for _ in range(6):
            etat = suivant(etat, NOTES["correct"])
            intervalles.append(etat.intervalle)
        assert intervalles == sorted(intervalles)
        assert intervalles[-1] > 30, f"progression trop lente : {intervalles}"

    def test_facile_espace_plus_vite_que_correct(self) -> None:
        depart = Etat(facilite=2.5, intervalle=10, repetitions=3)
        assert suivant(depart, NOTES["facile"]).facilite > suivant(depart, NOTES["correct"]).facilite

    def test_difficile_rapproche_les_revisions_sans_les_remettre_a_zero(self) -> None:
        depart = Etat(facilite=2.5, intervalle=10, repetitions=3)
        apres = suivant(depart, NOTES["difficile"])
        assert apres.repetitions == 4, "difficile reste une reussite"
        assert apres.facilite < depart.facilite


class TestRobustesse:
    def test_le_facteur_de_facilite_ne_s_effondre_pas(self) -> None:
        """
        SANS PLANCHER, une carte systematiquement notee « difficile » verrait
        son facteur tendre vers zero, donc son intervalle aussi : elle
        reviendrait indefiniment le meme jour et bloquerait la session.
        """
        etat = etat_initial()
        for _ in range(60):
            etat = suivant(etat, NOTES["difficile"])
        assert etat.facilite >= FACILITE_MINIMALE

    def test_l_intervalle_ne_descend_jamais_sous_un_jour(self) -> None:
        etat = Etat(facilite=FACILITE_MINIMALE, intervalle=1, repetitions=5)
        for _ in range(30):
            etat = suivant(etat, NOTES["difficile"])
            assert etat.intervalle >= 1

    @pytest.mark.parametrize("note", sorted(set(NOTES.values())))
    def test_aucune_note_ne_produit_d_etat_absurde(self, note: int) -> None:
        etat = etat_initial()
        for _ in range(40):
            etat = suivant(etat, note)
            assert etat.intervalle >= 1
            assert etat.intervalle <= INTERVALLE_MAXIMAL
            assert etat.repetitions >= 0
            assert etat.facilite >= FACILITE_MINIMALE

    def test_l_intervalle_est_plafonne_a_l_horizon_d_un_semestre(self) -> None:
        """
        SM-2 d'origine n'a pas de borne superieure : une suite de « facile »
        envoie la carte a 390 jours, puis au-dela. Correct pour une base de
        connaissances a vie, absurde pour reviser un cours de semestre — la
        carte reviendrait apres l'examen.
        """
        etat = etat_initial()
        for _ in range(30):
            etat = suivant(etat, NOTES["facile"])
        assert etat.intervalle == INTERVALLE_MAXIMAL

    def test_les_quatre_boutons_couvrent_les_deux_cotes_du_seuil(self) -> None:
        """Un jeu de notes qui ne contiendrait que des reussites serait inutile."""
        assert min(NOTES.values()) < 3 <= max(NOTES.values())


class TestDate:
    def test_la_date_suit_l_intervalle(self) -> None:
        etat = Etat(facilite=2.5, intervalle=6, repetitions=2)
        assert prochaine_date(etat, date(2026, 10, 16)) == date(2026, 10, 22)

    def test_un_echec_reporte_au_lendemain(self) -> None:
        apres = suivant(Etat(facilite=2.5, intervalle=30, repetitions=5), NOTES["oublie"])
        assert prochaine_date(apres, date(2026, 10, 16)) == date(2026, 10, 17)
