"""
Les formats de question, et le seul endroit ou l'on juge une reponse
(decision 053).

Trois formats :
  - « qcm »       : quatre options, une seule correcte (`correctIndex`) ;
  - « vrai_faux » : deux options, « Vrai » et « Faux » (`correctIndex` 0 ou 1).
                    C'est un QCM a deux options : il passe partout ou le QCM
                    passe, sans rien changer ;
  - « trous »     : une phrase du cours avec un blanc (« ____ »), et la
                    reponse attendue (`reponse`, `variantes`). L'etudiant la
                    TAPE.

POURQUOI UN SEUL MODULE. Avant, cinq fichiers comparaient chacun un indice a
`correctIndex` (quiz, examen, progression, cartes). Un format de plus aurait
demande cinq corrections, et la premiere oubliee aurait compte une bonne
reponse tapee comme fausse. Toute decision « juste ou faux » passe ici.

LA TOLERANCE DU TEXTE A TROUS. Un etudiant qui ecrit « preemption » pour
« préemption », « La famine » pour « famine », ou « ordonanceur » pour
« ordonnanceur » a compris le cours. On ignore donc la casse, les accents,
la ponctuation des bords et un article en tete ; on admet UNE faute de frappe
a partir de six lettres. Au-dela, c'est une autre reponse.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

#: Petits mots ignores en tete de reponse : « d'arrivee » et « arrivee »
#: disent la meme chose (constate a l'essai reel du 29 octobre). « de la »
#: avant « de » : le plus long d'abord.
ARTICLES = ("de la ", "le ", "la ", "les ", "l'", "un ", "une ", "des ", "du ", "d'", "de ", "the ", "a ", "an ")


def type_de(question: dict[str, Any]) -> str:
    """Les questions enregistrees avant la decision 053 sont des QCM."""
    return question.get("type") or "qcm"


def normaliser(texte: str) -> str:
    # L'apostrophe typographique d'abord : la conversion en ASCII l'effacerait.
    texte = (texte or "").replace("’", "'")
    texte = unicodedata.normalize("NFKD", texte).encode("ascii", "ignore").decode().lower()
    texte = re.sub(r"\s+", " ", texte).strip(" .,;:!?\"'«»()-")
    for article in ARTICLES:
        if texte.startswith(article) and len(texte) > len(article):
            texte = texte[len(article):]
            break
    return texte.strip()


def _distance(a: str, b: str) -> int:
    """Distance d'edition (Levenshtein), arretee des qu'elle depasse 1."""
    if abs(len(a) - len(b)) > 1:
        return 2
    precedente = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        courante = [i]
        for j, cb in enumerate(b, 1):
            courante.append(min(precedente[j] + 1, courante[j - 1] + 1, precedente[j - 1] + (ca != cb)))
        if min(courante) > 1:
            return 2
        precedente = courante
    return precedente[-1]


def reponse_tapee_juste(tapee: str, attendues: list[str]) -> bool:
    donnee = normaliser(tapee)
    if not donnee:
        return False
    for attendue in attendues:
        cible = normaliser(attendue)
        if not cible:
            continue
        if donnee == cible:
            return True
        if len(cible) >= 6 and _distance(donnee, cible) <= 1:
            return True
    return False


def est_juste(question: dict[str, Any], reponse: Any) -> bool:
    """La reponse donnee (indice, ou texte tape) est-elle juste ?"""
    if type_de(question) == "trous":
        if not isinstance(reponse, str):
            return False
        return reponse_tapee_juste(reponse, [question.get("reponse", ""), *question.get("variantes", [])])
    # bool est un int en Python : True ne doit pas valoir l'option 1.
    return isinstance(reponse, int) and not isinstance(reponse, bool) and reponse == question.get("correctIndex")


def bonne_reponse(question: dict[str, Any]) -> str | None:
    """Le texte de la bonne reponse ; None si la question est mal formee."""
    if type_de(question) == "trous":
        return (question.get("reponse") or "").strip() or None
    options = question.get("options") or []
    index = question.get("correctIndex")
    if isinstance(index, int) and 0 <= index < len(options):
        return options[index]
    return None
