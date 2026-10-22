"""
FSRS, sans base ni horloge (decision 040).

On ne reteste pas les chiffres publies par les auteurs : on verifie les
proprietes qui rendent l'algorithme utile ou dangereux a l'usage.
"""

from __future__ import annotations

import pytest

from app.services import fsrs
from app.services.fsrs import Memoire


def test_a_retention_visee_l_intervalle_vaut_la_stabilite() -> None:
    # Definition de la stabilite : 90 % de rappel au bout de S jours.
    assert fsrs.intervalle(10.0) == 10
    assert fsrs.retrouvabilite(10.0, 10.0) == pytest.approx(0.9, abs=1e-9)


def test_la_retrouvabilite_decroit_avec_le_temps() -> None:
    valeurs = [fsrs.retrouvabilite(t, 5.0) for t in (0, 1, 5, 20, 100)]
    assert valeurs[0] == 1.0
    assert valeurs == sorted(valeurs, reverse=True)


class TestPremiereRevision:
    def test_mieux_on_repond_plus_on_attend(self) -> None:
        intervalles = [fsrs.intervalle(fsrs.premiere_revision(n).stabilite) for n in (1, 2, 3, 4)]
        assert intervalles == sorted(intervalles)
        assert intervalles[0] == 1  # un oubli revient des le lendemain
        assert intervalles[3] > intervalles[2]

    def test_la_difficulte_initiale_suit_la_note(self) -> None:
        d = [fsrs.premiere_revision(n).difficulte for n in (1, 2, 3, 4)]
        assert d == sorted(d, reverse=True)
        assert all(1 <= x <= 10 for x in d)


class TestRevision:
    base = Memoire(stabilite=10.0, difficulte=5.0)

    def test_une_reussite_augmente_la_stabilite(self) -> None:
        assert fsrs.revision(self.base, 3, 10).stabilite > self.base.stabilite

    def test_un_oubli_la_reduit_sans_la_remettre_a_zero(self) -> None:
        apres = fsrs.revision(self.base, 1, 10)
        assert 0 < apres.stabilite < self.base.stabilite

    def test_facile_espace_plus_que_correct_qui_espace_plus_que_difficile(self) -> None:
        s = [fsrs.revision(self.base, n, 10).stabilite for n in (2, 3, 4)]
        assert s[0] < s[1] < s[2]

    def test_reussir_en_retard_rapporte_plus_que_reussir_a_l_heure(self) -> None:
        # Ce que SM-2 ignorait : une carte sue malgre un long delai est mieux
        # ancree qu'on ne le croyait.
        a_l_heure = fsrs.revision(self.base, 3, 10).stabilite
        en_retard = fsrs.revision(self.base, 3, 30).stabilite
        assert en_retard > a_l_heure

    def test_les_echecs_rendent_la_carte_plus_difficile(self) -> None:
        m = self.base
        for _ in range(5):
            m = fsrs.revision(m, 1, 1)
        assert m.difficulte > self.base.difficulte
        assert m.difficulte <= 10

    @pytest.mark.parametrize("note", [1, 2, 3, 4])
    @pytest.mark.parametrize("jours", [0, 1, 7, 90, 400])
    def test_aucun_etat_absurde(self, note: int, jours: int) -> None:
        apres = fsrs.revision(self.base, note, jours)
        assert apres.stabilite > 0
        assert 1 <= apres.difficulte <= 10
        assert 1 <= fsrs.intervalle(apres.stabilite) <= fsrs.INTERVALLE_MAXIMAL

    def test_une_longue_serie_de_reussites_reste_plafonnee(self) -> None:
        m = fsrs.premiere_revision(4)
        for _ in range(30):
            m = fsrs.revision(m, 4, fsrs.intervalle(m.stabilite))
        assert fsrs.intervalle(m.stabilite) == fsrs.INTERVALLE_MAXIMAL


class TestConversionSM2:
    def test_une_carte_jamais_reussie_repart_comme_neuve(self) -> None:
        assert fsrs.depuis_sm2(2.5, 1, 0) is None
        assert fsrs.depuis_sm2(2.5, 0, 3) is None

    def test_la_stabilite_reprend_l_intervalle(self) -> None:
        m = fsrs.depuis_sm2(2.5, 15, 3)
        assert m is not None and m.stabilite == 15.0
        assert fsrs.intervalle(m.stabilite) == 15

    def test_la_difficulte_suit_le_facteur_de_facilite(self) -> None:
        assert fsrs.depuis_sm2(2.5, 6, 2).difficulte == pytest.approx(5.0)
        assert fsrs.depuis_sm2(1.3, 6, 2).difficulte == pytest.approx(10.0)
        assert fsrs.depuis_sm2(3.0, 6, 2).difficulte < 5.0


def test_les_quatre_boutons() -> None:
    assert fsrs.NOTES == {"oublie": 1, "difficile": 2, "correct": 3, "facile": 4}
