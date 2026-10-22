"""
Repetition espacee : l'algorithme FSRS (Free Spaced Repetition Scheduler).

POURQUOI IL REMPLACE SM-2 (22 octobre, decision 040). SM-2 (1987) applique a
chaque carte la meme regle multiplicative, quelle que soit la duree reelle
ecoulee depuis la derniere revision. FSRS modelise la MEMOIRE de chaque
carte par deux grandeurs :
  - la STABILITE S : le nombre de jours au bout duquel la probabilite de
    s'en souvenir tombe a 90 % ;
  - la DIFFICULTE D, de 1 a 10 : a quel point la carte resiste.
Sa probabilite de rappel R decroit avec le temps ecoule ; chaque revision
met S et D a jour en fonction de R au moment ou l'on revise. Une carte revue
en retard, et pourtant sue, gagne donc PLUS de stabilite qu'une carte revue
a l'heure : SM-2 l'ignorait.

Ses 17 parametres ont ete ajustes par apprentissage automatique sur un
tres grand volume de revisions reelles d'utilisateurs d'Anki (FSRS-4.5,
projet open-spaced-repetition). Anki l'a integre en 2023. Les valeurs par
defaut ci-dessous sont celles publiees : nous n'avons pas assez de revisions
pour les reajuster par etudiant — ce sera possible plus tard.

AUCUN APPEL AU MODELE. Arithmetique pure : ni base, ni horloge. Le temps
ecoule est un argument, ce qui rend chaque cas testable.

LES QUATRE BOUTONS correspondent aux quatre notes de FSRS :
oublie = 1 (Again), difficile = 2 (Hard), correct = 3 (Good), facile = 4 (Easy).
"""

from __future__ import annotations

import math
from dataclasses import dataclass

#: Parametres par defaut de FSRS-4.5.
W = (
    0.4072, 1.1829, 3.1262, 15.4722,  # stabilite initiale selon la note 1..4
    7.2102, 0.5316,                   # difficulte initiale
    1.0651, 0.0234,                   # evolution et retour a la moyenne de D
    1.616, 0.1544, 1.0824,            # stabilite apres un rappel reussi
    1.9813, 0.0953, 0.2975, 2.2042,   # stabilite apres un oubli
    0.2407, 2.9466,                   # malus « difficile », bonus « facile »
)

#: Courbe d'oubli de FSRS-4.5 : R(t, S) = (1 + FACTEUR * t / S) ** DECROISSANCE.
DECROISSANCE = -0.5
FACTEUR = 19 / 81

#: Probabilite de rappel visee au moment ou la carte revient. 90 % est la
#: valeur par defaut d'Anki : au-dessus, les revisions se multiplient pour un
#: gain faible ; en dessous, l'etudiant oublie trop.
RETENTION_VISEE = 0.9

#: Plafond de l'intervalle, en jours : StudyAI sert a reviser un cours de
#: semestre. Une carte reportee a plus de six mois reviendrait apres l'examen.
INTERVALLE_MAXIMAL = 180

#: Les quatre boutons montres a l'etudiant, et leur note FSRS.
NOTES = {"oublie": 1, "difficile": 2, "correct": 3, "facile": 4}


@dataclass(frozen=True)
class Memoire:
    """L'etat de memoire d'une carte deja revue au moins une fois."""

    stabilite: float
    difficulte: float


def _borner_difficulte(d: float) -> float:
    return min(10.0, max(1.0, d))


def retrouvabilite(jours_ecoules: float, stabilite: float) -> float:
    """Probabilite de se souvenir apres `jours_ecoules` jours."""
    return (1 + FACTEUR * max(0.0, jours_ecoules) / stabilite) ** DECROISSANCE


def intervalle(stabilite: float, retention: float = RETENTION_VISEE) -> int:
    """Jours avant que la probabilite de rappel ne tombe a `retention`."""
    jours = stabilite / FACTEUR * (retention ** (1 / DECROISSANCE) - 1)
    return min(INTERVALLE_MAXIMAL, max(1, round(jours)))


def _difficulte_initiale(note: int) -> float:
    return _borner_difficulte(W[4] - (note - 3) * W[5])


def premiere_revision(note: int) -> Memoire:
    """Memoire d'une carte neuve apres sa toute premiere revision."""
    return Memoire(stabilite=W[note - 1], difficulte=_difficulte_initiale(note))


def revision(memoire: Memoire, note: int, jours_ecoules: float) -> Memoire:
    """
    Memoire apres une revision, `jours_ecoules` jours apres la precedente.

    Fonction PURE : le temps ecoule est fourni, jamais lu sur une horloge.
    """
    s, d = memoire.stabilite, memoire.difficulte
    r = retrouvabilite(jours_ecoules, s)

    # Difficulte : monte si la carte a ete ratee ou jugee difficile, baisse si
    # elle etait facile, avec un leger retour vers la difficulte d'une carte
    # « facile » pour qu'une serie d'echecs anciens ne la condamne pas a vie.
    d_brute = d - W[6] * (note - 3)
    nouvelle_d = _borner_difficulte(W[7] * _difficulte_initiale(4) + (1 - W[7]) * d_brute)

    if note == 1:
        # Oubli : la stabilite repart de bas, mais pas de zero — ce qui a ete
        # appris laisse une trace. Jamais plus haute qu'avant l'oubli.
        oubli = W[11] * d ** -W[12] * ((s + 1) ** W[13] - 1) * math.exp(W[14] * (1 - r))
        return Memoire(stabilite=min(oubli, s), difficulte=nouvelle_d)

    malus = W[15] if note == 2 else 1.0
    bonus = W[16] if note == 4 else 1.0
    gain = math.exp(W[8]) * (11 - d) * s ** -W[9] * (math.exp(W[10] * (1 - r)) - 1)
    return Memoire(stabilite=s * (1 + gain * malus * bonus), difficulte=nouvelle_d)


def depuis_sm2(facilite: float, intervalle_sm2: int, repetitions: int) -> Memoire | None:
    """
    Conversion d'une carte suivie par SM-2 (migration 0008).

    `None` pour une carte jamais reussie : elle repartira comme une neuve.
    Sinon, la stabilite reprend l'intervalle SM-2 — par construction, la
    carte revenait quand on pensait qu'elle allait etre oubliee, ce qui est la
    definition de S a 90 %. La difficulte suit le facteur de facilite : 2,5
    (valeur de depart de SM-2) donne 5, le plancher 1,3 donne 10.
    """
    if repetitions == 0 or intervalle_sm2 <= 0:
        return None
    difficulte = _borner_difficulte(10 - (facilite - 1.3) * (5 / 1.2))
    return Memoire(stabilite=float(intervalle_sm2), difficulte=round(difficulte, 4))
