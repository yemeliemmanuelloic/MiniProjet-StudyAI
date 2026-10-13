"""
Decoupage d'un cours en segments, et selection des segments pertinents.

LE DEFAUT QUE CE MODULE CORRIGE
-------------------------------
La version precedente coupait le cours a 20 000 caracteres et envoyait le
debut au modele. Un cours de soixante pages etait donc resume a partir de son
premier tiers — **sans que rien ne le signale**, ni a l'ecran ni dans les
donnees. C'est le pire genre de defaut : le resultat a l'air correct.

CE QUI LE REMPLACE
------------------
Le cours est decoupe en segments qui respectent les frontieres naturelles du
texte (paragraphes, puis phrases), avec un recouvrement entre segments voisins.
Chaque module s'en sert differemment :

  - resume : chaque segment est resume, puis les resumes partiels sont
    fusionnes en un seul (synthese par agregation) ;
  - quiz   : les questions sont reparties sur des segments echelonnes, pour
    qu'un quiz ne porte pas uniquement sur l'introduction ;
  - tuteur : seuls les segments pertinents pour la question sont envoyes.

POURQUOI UN RECOUVREMENT
------------------------
Une notion expliquee a cheval sur deux segments serait sinon coupee en deux
moities incomprehensibles. Le recouvrement reprend la fin du segment
precedent, au mot pres.

LIMITE ASSUMEE
--------------
La selection pour le tuteur est **lexicale** (BM25), pas semantique : elle
repose sur les mots en commun entre la question et le segment. Une question
qui n'emploie aucun mot du cours sera mal servie. Une recherche par plongements
ferait mieux ; elle demanderait un appel d'API supplementaire et un stockage
vectoriel. Le compromis est documente, pas dissimule.
"""

from __future__ import annotations

import math
import re
import unicodedata
from dataclasses import dataclass

# Frontieres de decoupage, de la plus souhaitable a la moins souhaitable.
SEPARATEUR_PARAGRAPHE = re.compile(r"\n[ \t]*\n+")
FIN_DE_PHRASE = re.compile(r"(?<=[.!?…:])\s+")

# Mots vides : trop frequents pour discriminer quoi que ce soit. Liste courte
# et bilingue, les supports de cours melangeant souvent les deux langues.
MOTS_VIDES = frozenset(
    """
    alors aussi avec avoir avons cela celle celles celui ces cet cette ceux chaque
    comme dans des deux donc dont elle elles encore entre est etait etre eux fait
    faire ils leur leurs mais meme mes moins nos notre nous ont par parce pas peut
    peuvent plus pour pres quand que quel quelle quels qui sans ses son sont sous
    sur tous tout toute toutes une vers voir vos votre vous
    about above after against also and any are because been before being between
    both but can cannot could does doing during each from had has have her here
    him his how into its more most not now only other our out over own same she
    should some such than that the their them then there these they this those
    through too under until very was were what when where which while who why will
    with would you your
    """.split()
)


@dataclass(frozen=True)
class Segment:
    """
    Un morceau de cours pret a etre envoye au modele.

    `texte` est ce qui part reellement : il inclut le recouvrement repris du
    segment precedent. `debut` et `fin` delimitent en revanche la portion
    *propre* au segment dans le texte source, sans ce recouvrement — c'est ce
    qu'il faut pour situer un extrait dans le cours.
    """

    index: int
    texte: str
    debut: int
    fin: int

    @property
    def taille(self) -> int:
        return len(self.texte)


@dataclass(frozen=True)
class Decoupage:
    segments: list[Segment]
    total_caracteres: int
    # Vrai si le cours depassait le nombre maximal de segments et a quand meme
    # du etre ampute. Contrairement a l'ancienne troncature, celle-ci est
    # remontee jusqu'a l'ecran de l'etudiant.
    tronque: bool

    @property
    def nombre(self) -> int:
        return len(self.segments)

    @property
    def est_court(self) -> bool:
        """Un seul segment : le cours tient en un appel, pas d'agregation."""
        return len(self.segments) <= 1


def _morceaux_elementaires(texte: str) -> list[tuple[int, str]]:
    """
    Reduit le texte en morceaux insecables, avec leur position d'origine.

    On descend par paliers : paragraphes, puis phrases si un paragraphe est
    deja trop gros a lui seul. La coupe brutale au milieu d'un mot n'arrive
    qu'en dernier recours, sur un bloc sans aucune ponctuation.
    """
    morceaux: list[tuple[int, str]] = []
    position = 0

    for bloc in SEPARATEUR_PARAGRAPHE.split(texte):
        debut_bloc = texte.find(bloc, position)
        if debut_bloc == -1:  # pragma: no cover - securite, ne devrait pas arriver
            debut_bloc = position
        position = debut_bloc + len(bloc)

        if not bloc.strip():
            continue
        morceaux.append((debut_bloc, bloc))

    return morceaux


def _eclater(debut: int, bloc: str, taille: int) -> list[tuple[int, str]]:
    """Coupe un bloc trop long en phrases, puis de force si besoin."""
    if len(bloc) <= taille:
        return [(debut, bloc)]

    sortie: list[tuple[int, str]] = []
    decalage = 0
    for phrase in FIN_DE_PHRASE.split(bloc):
        if not phrase:
            continue
        position = bloc.find(phrase, decalage)
        decalage = position + len(phrase)

        if len(phrase) <= taille:
            sortie.append((debut + position, phrase))
            continue

        # Bloc sans ponctuation exploitable : coupe reguliere, assumee.
        for i in range(0, len(phrase), taille):
            sortie.append((debut + position + i, phrase[i : i + taille]))

    return sortie


def _queue(texte: str, longueur: int) -> str:
    """Fin de texte d'au plus `longueur` caracteres, coupee sur un mot entier."""
    if longueur <= 0 or len(texte) <= longueur:
        return texte
    extrait = texte[-longueur:]
    espace = extrait.find(" ")
    return extrait[espace + 1 :] if espace != -1 else extrait


def decouper(
    texte: str,
    taille: int = 8_000,
    recouvrement: int = 400,
    maximum: int = 24,
) -> Decoupage:
    """Decoupe un cours en segments de `taille` caracteres au plus."""
    texte = texte.replace("\r\n", "\n").strip()
    if not texte:
        return Decoupage(segments=[], total_caracteres=0, tronque=False)

    # Cas courant : le cours tient en un seul appel, on ne le decoupe pas.
    if len(texte) <= taille:
        return Decoupage(
            segments=[Segment(index=0, texte=texte, debut=0, fin=len(texte))],
            total_caracteres=len(texte),
            tronque=False,
        )

    morceaux: list[tuple[int, str]] = []
    for debut, bloc in _morceaux_elementaires(texte):
        morceaux.extend(_eclater(debut, bloc, taille))

    segments: list[Segment] = []
    courant: list[str] = []
    debut_courant = morceaux[0][0] if morceaux else 0
    fin_courante = debut_courant
    longueur = 0

    def fermer() -> None:
        nonlocal courant, longueur
        if not courant:
            return
        propre = "\n\n".join(courant)
        prefixe = ""
        if segments and recouvrement > 0:
            prefixe = _queue(segments[-1].texte, recouvrement)
            if prefixe:
                prefixe += "\n\n[…]\n\n"
        segments.append(
            Segment(
                index=len(segments),
                texte=prefixe + propre,
                debut=debut_courant,
                fin=fin_courante,
            )
        )
        courant = []
        longueur = 0

    for debut, bloc in morceaux:
        if courant and longueur + len(bloc) > taille:
            fermer()
            debut_courant = debut
        if not courant:
            debut_courant = debut
        courant.append(bloc)
        longueur += len(bloc) + 2
        fin_courante = debut + len(bloc)

    fermer()

    tronque = len(segments) > maximum
    if tronque:
        segments = segments[:maximum]

    return Decoupage(segments=segments, total_caracteres=len(texte), tronque=tronque)


# --- Selection par pertinence -------------------------------------------------


def _normaliser(texte: str) -> list[str]:
    """Minuscules, accents retires, mots vides et mots trop courts ecartes."""
    sans_accent = "".join(
        c
        for c in unicodedata.normalize("NFD", texte.lower())
        if unicodedata.category(c) != "Mn"
    )
    mots = re.findall(r"[a-z0-9]+", sans_accent)
    return [m for m in mots if len(m) >= 3 and m not in MOTS_VIDES]


def scores_bm25(textes: list[str], requete: str) -> list[float]:
    """
    Score BM25 de chaque texte pour la requete. Un score nul = aucun mot commun.

    Extrait de `selectionner` pour etre partage avec la recherche
    transversale (services/recherche.py). Deux implementations de la meme
    formule auraient fini par diverger, et la seconde n'aurait ete testee par
    personne.

    Ponderation BM25 : un mot rare dans l'ensemble du corpus pese plus qu'un
    mot present partout, et un texte long n'est pas avantage par sa seule
    longueur.
    """
    termes = set(_normaliser(requete))
    if not termes or not textes:
        return [0.0] * len(textes)

    sacs = [_normaliser(t) for t in textes]
    longueurs = [len(sac) for sac in sacs]
    longueur_moyenne = (sum(longueurs) / len(longueurs)) or 1.0
    total = len(textes)

    k1, b = 1.5, 0.75
    # Le nombre de documents contenant chaque terme est calcule UNE fois :
    # dans la version precedente il l'etait pour chaque segment, ce qui
    # rendait le cout quadratique. Invisible sur trois segments d'un cours,
    # sensible sur les segments de toute une bibliotheque.
    documents = {t: sum(1 for sac in sacs if t in sac) for t in termes}

    scores: list[float] = []
    for sac, longueur in zip(sacs, longueurs):
        score = 0.0
        for terme in termes:
            frequence = sac.count(terme)
            if frequence == 0:
                continue
            idf = math.log(1 + (total - documents[terme] + 0.5) / (documents[terme] + 0.5))
            norme = 1 - b + b * (longueur / longueur_moyenne)
            score += idf * (frequence * (k1 + 1)) / (frequence + k1 * norme)
        scores.append(score)
    return scores


def selectionner(
    segments: list[Segment], question: str, nombre: int = 3
) -> list[Segment]:
    """
    Retourne les `nombre` segments les plus pertinents pour la question.

    Les segments retenus sont remis dans l'ordre du cours, pour que le modele
    les lise dans le sens de lecture.
    """
    if len(segments) <= nombre:
        return segments

    scores = scores_bm25([s.texte for s in segments], question)

    # Aucun mot de la question dans le cours : plutot que de renvoyer n'importe
    # quoi, on donne le debut du cours. Le modele repondra « hors du cours »,
    # ce qui est la bonne reponse.
    if max(scores) == 0:
        return segments[:nombre]

    meilleurs = sorted(range(len(segments)), key=lambda i: scores[i], reverse=True)[
        :nombre
    ]
    return [segments[i] for i in sorted(meilleurs)]


def echelonner(segments: list[Segment], nombre: int) -> list[Segment]:
    """
    Choisit `nombre` segments repartis regulierement sur tout le cours.

    Sert au quiz : interroger seulement les premiers segments reviendrait a
    n'interroger que l'introduction.
    """
    if nombre >= len(segments):
        return list(segments)
    if nombre <= 0:
        return []
    pas = len(segments) / nombre
    return [segments[min(len(segments) - 1, int(i * pas))] for i in range(nombre)]


def repartir(total: int, parts: int) -> list[int]:
    """Repartit `total` questions sur `parts` segments, au plus juste."""
    if parts <= 0:
        return []
    base, reste = divmod(total, parts)
    return [base + (1 if i < reste else 0) for i in range(parts)]
