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


def sac_de_mots(question: str) -> frozenset[str]:
    """Les mots de l'enonce, sans ordre ni repetition."""
    return frozenset(cle_enonce(question).split())


def similarite(a: frozenset[str], b: frozenset[str]) -> float:
    """Jaccard sur les mots. Lexical, comme le reste du projet."""
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


#: Au-dela de ce seuil, deux enonces disent la meme chose.
#:
#: MESURE DEUX FOIS, sur deux jeux de donnees reels et a trois jours
#: d'intervalle. Sur les 18 questions de quiz en base : 5 paires au-dessus,
#: toutes de vrais doublons. Sur les 13 cartes derivees de trois quiz d'un
#: meme cours : 5 paires au-dessus — trois formulations du prix d'une chambre,
#: deux du message d'erreur de connexion, deux de Gherkin — et la paire
#: suivante tombe a 0,29. L'ecart entre les deux groupes est large : le seuil
#: n'est pas pose au milieu d'un continuum.
#:
#: CE QUE LE SEUIL AUTORISE DEPEND DE QUI L'EMPLOIE, et les deux usages ne se
#: valent pas :
#:   - l'examen blanc DEPRIORISE. Rien n'est perdu : si toutes les questions
#:     restantes sont proches, la moins mauvaise est prise quand meme ;
#:   - les cartes NE CREENT PAS la seconde carte. C'est plus fort, et ce n'est
#:     acceptable que parce que les deux cartes porteraient le meme verso :
#:     l'etudiant ne perd aucune connaissance, il evite de reviser trois fois
#:     le meme fait dans la meme session.
#:
#: C'est aussi pourquoi DECISIONS 018 avait ecarte un filtre de doublons sur
#: les quiz : la ou le contenu differe, supprimer coute quelque chose
#: d'invisible.
SEUIL_REDITE = 0.55
