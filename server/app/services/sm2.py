"""
Repetition espacee : l'algorithme SM-2.

CE QU'IL FAIT. A chaque revision, l'etudiant dit s'il se souvenait. SM-2 en
deduit dans combien de jours reposer la carte : court apres un echec, de plus
en plus long apres des succes. Une carte sue depuis longtemps ne revient
presque plus ; une carte qui resiste revient le lendemain.

POURQUOI SM-2 ET PAS AUTRE CHOSE. C'est l'algorithme de SuperMemo 2 (1987),
celui d'Anki a ses debuts. Il tient en vingt lignes, ne demande aucune
donnee d'entrainement, et son comportement se raconte en une phrase — ce qui
compte autant que sa justesse quand il faut l'expliquer en soutenance. Les
successeurs (FSRS) ajustent leurs parametres sur des millions de revisions ;
nous n'en avons aucune.

AUCUN APPEL AU MODELE. C'est de l'arithmetique sur trois nombres.

LES NOTES, et pourquoi quatre et non six. SM-2 d'origine prend une note de 0
a 5. Six nuances sur « me suis-je souvenu ? » demandent a l'etudiant une
precision qu'il n'a pas, et la litterature comme la pratique d'Anki ont
converge vers quatre boutons. Nous exposons donc quatre choix, traduits vers
l'echelle d'origine.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

#: Les quatre boutons montres a l'etudiant, et leur note SM-2.
NOTES = {
    "oublie": 0,
    "difficile": 3,
    "correct": 4,
    "facile": 5,
}

#: En deca de 3, la reponse compte comme un echec : la carte repart a zero.
SEUIL_REUSSITE = 3

#: Plancher du facteur de facilite. Sans lui, une carte systematiquement
#: ratee verrait son facteur tendre vers zero et son intervalle avec : elle
#: reviendrait indefiniment le meme jour, ce qui bloque la session.
FACILITE_MINIMALE = 1.3

FACILITE_INITIALE = 2.5

#: Plafond de l'intervalle, en jours. SM-2 d'origine n'en a pas : une suite
#: de « facile » envoie la carte a 390 jours, puis au-dela. C'est correct
#: pour une base de connaissances a vie, absurde ici — StudyAI sert a reviser
#: un cours de semestre, et une carte reportee a plus de six mois revient
#: apres l'examen. Le plafond ne corrige pas l'algorithme : il l'adapte a
#: l'horizon de l'usage.
INTERVALLE_MAXIMAL = 180


@dataclass(frozen=True)
class Etat:
    """L'etat d'une carte. Trois nombres suffisent."""

    facilite: float
    intervalle: int
    repetitions: int


def suivant(etat: Etat, note: int) -> Etat:
    """
    Calcule l'etat suivant d'une carte apres une revision.

    Fonction PURE : pas de date, pas de base, pas d'horloge. C'est ce qui
    rend l'algorithme testable exhaustivement, et c'est pour cela que le
    calcul de la date de revision vit ailleurs.
    """
    if note < SEUIL_REUSSITE:
        # Echec : on repart du debut. Le facteur de facilite, lui, est
        # conserve — l'etudiant n'a pas oublie ce qu'il savait de la
        # difficulte de la carte, il a juste rate ce rappel-ci.
        return Etat(facilite=etat.facilite, intervalle=1, repetitions=0)

    repetitions = etat.repetitions + 1
    if repetitions == 1:
        intervalle = 1
    elif repetitions == 2:
        intervalle = 6
    else:
        intervalle = round(etat.intervalle * etat.facilite)

    # Formule d'origine de SM-2. Une note de 4 laisse le facteur inchange ;
    # 5 l'augmente, 3 le diminue.
    facilite = etat.facilite + (0.1 - (5 - note) * (0.08 + (5 - note) * 0.02))
    return Etat(
        facilite=max(FACILITE_MINIMALE, round(facilite, 4)),
        intervalle=min(INTERVALLE_MAXIMAL, max(1, intervalle)),
        repetitions=repetitions,
    )


def prochaine_date(etat: Etat, aujourd_hui: date) -> date:
    """La date a laquelle la carte doit revenir. Separee pour rester testable."""
    return aujourd_hui + timedelta(days=etat.intervalle)


def etat_initial() -> Etat:
    return Etat(facilite=FACILITE_INITIALE, intervalle=0, repetitions=0)
