"""
L'empreinte souple d'un enonce de question.

POURQUOI CETTE FONCTION VIT SEULE ICI. Deux modules s'en servent, et pour des
raisons differentes :

  - l'examen blanc DEDOUBLONNE : deux quiz successifs sur le meme cours
    reposent souvent la meme question a la virgule pres, et comparer les
    chaines brutes les laisserait entrer toutes les deux ;
  - les cartes de revision IDENTIFIENT : la cle porte la contrainte d'unicite
    (cours, cle) en base, pour qu'une regeneration de quiz ne duplique pas une
    carte deja revisee depuis trois semaines.

Si les deux modules en gardaient chacun une copie, « la meme question »
finirait par vouloir dire deux choses differentes selon l'endroit — et le jour
ou l'une des deux definitions evoluerait, l'incoherence ne produirait aucune
erreur, seulement des doublons silencieux.
"""

from __future__ import annotations

import re
import unicodedata

#: Longueur de la colonne `flashcards.cle`. Tronquer est sans danger : la cle
#: n'a pas besoin d'etre injective sur l'univers des phrases, seulement de
#: separer des enonces reellement distincts d'un meme cours.
LONGUEUR_MAXIMALE = 300

_MOTS = re.compile(r"[a-z0-9]+")


def cle_enonce(question: str) -> str:
    """
    Minuscules, accents retires, ponctuation retiree, espaces normalises.

    « Qu'est-ce que l'ordonnancement  Round-Robin ? » et
    « Qu est ce que l ordonnancement round robin » rendent la meme cle.
    """
    sans_accent = "".join(
        c
        for c in unicodedata.normalize("NFD", question.lower())
        if unicodedata.category(c) != "Mn"
    )
    return " ".join(_MOTS.findall(sans_accent))[:LONGUEUR_MAXIMALE]
