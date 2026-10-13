"""
Recherche transversale : chercher dans TOUS ses cours a la fois.

CE QUE CELA RESOUT. Un etudiant qui revise ne sait pas toujours dans quel
chapitre une notion a ete vue — c'est souvent la vraie question : « ou ai-je
vu l'execution symbolique ? ». Jusqu'ici StudyAI obligeait a ouvrir chaque
cours et a interroger son tuteur l'un apres l'autre.

AUCUN APPEL AU MODELE. La recherche reutilise le BM25 ecrit pour le tuteur,
qui est purement lexical et tourne en local. C'est instantane, gratuit, et
cela fonctionne meme sans clef d'API — donc meme pendant une panne du
fournisseur.

LE DECOUPAGE EST REFAIT A CHAQUE RECHERCHE, et ce n'est pas un oubli. Les
segments ne sont stockes nulle part : les conserver demanderait une table de
plus et une invalidation a chaque modification de cours, pour economiser un
decoupage qui est une suite d'expressions regulieres sur du texte deja en
memoire. Le cout est mesure dans docs/DECISIONS.md 019 ; il deviendra genant
bien au-dela du volume qu'un etudiant accumule en un semestre.

LA LIMITE EST LA MEME QUE CELLE DU TUTEUR, et elle est connue : la recherche
est **lexicale**. Une requete qui n'emploie aucun mot du cours ne trouvera
rien, meme si la notion y est. Une recherche par plongements ferait mieux ;
voir DECISIONS.md 005.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import parametres
from ..models import Cours
from .segmentation import decouper, scores_bm25

#: Au-dela, l'extrait cesse d'etre un apercu et devient un pave.
TAILLE_EXTRAIT = 320

#: Nombre de passages rendus par defaut.
LIMITE = 10


@dataclass(frozen=True)
class Passage:
    course_id: str
    course_title: str
    #: Rang du segment dans son cours, et nombre total de segments : « passage
    #: 3 sur 5 » dit a l'etudiant ou chercher dans son propre fichier.
    rang: int
    total: int
    texte: str
    extrait: str
    score: float


def _sans_accent(texte: str) -> str:
    return "".join(
        c
        for c in unicodedata.normalize("NFD", texte.lower())
        if unicodedata.category(c) != "Mn"
    )


def mots_de(requete: str) -> list[str]:
    """Les mots retenus de la requete. Le front s'en sert pour surligner."""
    return [m for m in re.findall(r"[a-z0-9]+", _sans_accent(requete)) if len(m) >= 3]


def elargir(requete: str) -> str:
    """
    Ajoute les variantes singulier/pluriel des mots cherches.

    POURQUOI. La comparaison est faite sur des jetons entiers, sans
    racinisation. Mesure : une recherche « binome » ne trouvait rien dans
    Atelier 3.docx, qui ecrit pourtant « le travail se fait en binomes ».
    C'est le ratage le plus frequent en francais, et le plus deroutant pour
    l'utilisateur, qui voit le mot de ses propres yeux dans le document.

    POURQUOI ICI ET PAS DANS scores_bm25. La fonction de score est partagee
    avec la selection des passages du tuteur d'un cours, dont les mesures du
    banc d'essai sont publiees (EVALUATION.md). Modifier la facon dont les
    termes s'apparient invaliderait ces chiffres. Elargir la REQUETE, en
    revanche, ne change rien pour l'appelant qui ne le demande pas.

    Ce n'est pas une racinisation : « tester » ne trouvera pas « test ». La
    limite reste, reduite a sa forme la plus genante.
    """
    termes = mots_de(requete)
    variantes: list[str] = []
    for terme in termes:
        variantes.append(terme)
        if terme.endswith(("s", "x")):
            variantes.append(terme[:-1])
        else:
            variantes.extend([terme + "s", terme + "x"])
    # `scores_bm25` dedoublonne, mais garder l'ordre rend le journal lisible.
    return " ".join(dict.fromkeys(variantes))


def _extrait(texte: str, termes: list[str]) -> str:
    """
    Fenetre de texte autour de la premiere occurrence d'un terme cherche.

    Rendre le debut du segment serait plus simple et beaucoup moins utile :
    sur un segment de huit mille caracteres, le mot cherche est rarement dans
    les trois cents premiers.
    """
    plat = _sans_accent(texte)
    position = -1
    for terme in termes:
        trouve = plat.find(terme)
        if trouve != -1 and (position == -1 or trouve < position):
            position = trouve

    if position == -1:
        fenetre = texte[:TAILLE_EXTRAIT]
        return fenetre + ("…" if len(texte) > TAILLE_EXTRAIT else "")

    debut = max(0, position - TAILLE_EXTRAIT // 3)
    fin = min(len(texte), debut + TAILLE_EXTRAIT)

    # Les bords sont ramenes sur une frontiere de mot : couper au milieu d'un
    # mot donne un extrait qui a l'air corrompu.
    if debut > 0:
        espace = texte.find(" ", debut)
        debut = espace + 1 if 0 <= espace < debut + 25 else debut
    if fin < len(texte):
        espace = texte.rfind(" ", fin - 25, fin)
        fin = espace if espace > debut else fin

    return ("…" if debut > 0 else "") + texte[debut:fin].strip() + (
        "…" if fin < len(texte) else ""
    )


def chercher(
    session: Session, owner_id: str, requete: str, limite: int = LIMITE
) -> list[Passage]:
    """
    Les passages les plus proches de la requete, tous cours confondus.

    L'IDF est calcule sur TOUTE la bibliotheque, pas cours par cours. C'est
    ce qui fait la difference : un mot banal dans un cours mais rare dans les
    autres pese alors correctement, ce qui est exactement le signal cherche
    quand on demande « dans lequel de mes cours ai-je vu ca ? ».
    """
    termes = mots_de(requete)
    if not termes:
        return []

    cours = list(
        session.scalars(
            select(Cours).where(Cours.owner_id == owner_id).order_by(Cours.created_at)
        )
    )

    plats: list[tuple[Cours, int, int, str]] = []
    for un_cours in cours:
        decoupage = decouper(un_cours.content, taille=parametres.SEGMENT_CHARS)
        for segment in decoupage.segments:
            plats.append(
                (un_cours, segment.index, decoupage.nombre, segment.texte)
            )

    if not plats:
        return []

    scores = scores_bm25([texte for _, _, _, texte in plats], elargir(requete))

    retenus = [
        (score, element)
        for score, element in zip(scores, plats)
        # Un score nul signifie « aucun mot commun ». Rendre ces passages
        # remplirait la page de bruit : mieux vaut un resultat vide, qui est
        # une information.
        if score > 0
    ]
    retenus.sort(key=lambda couple: couple[0], reverse=True)

    return [
        Passage(
            course_id=un_cours.id,
            course_title=un_cours.title,
            rang=index + 1,
            total=total,
            texte=texte,
            extrait=_extrait(texte, termes),
            score=round(score, 3),
        )
        for score, (un_cours, index, total, texte) in retenus[:limite]
    ]


#: Nombre de passages envoyes au tuteur de bibliotheque. Trois, comme pour le
#: tuteur d'un cours : au-dela, la charge grossit vite et l'attention du
#: modele se disperse sur des passages de moins en moins pertinents.
PASSAGES_TUTEUR = 3


def demander(session: Session, owner_id: str, question: str) -> dict:
    """
    Tuteur transversal : UN SEUL appel au modele, quel que soit le nombre de cours.

    Le travail de selection est fait avant, localement et gratuitement, par
    `chercher`. C'est ce qui rend la fonctionnalite tenable sur un palier
    gratuit : dix cours ne coutent pas dix fois plus cher qu'un seul.
    """
    from ..llm import pipeline

    passages = chercher(session, owner_id, question, limite=PASSAGES_TUTEUR)

    if not passages:
        # Aucun mot commun avec aucun cours : repondre « non couvert » sans
        # appeler le modele est a la fois plus rapide, gratuit, et PLUS JUSTE
        # — le modele n'aurait eu aucun passage a lire et aurait conclu la
        # meme chose, avec le risque de completer par ses connaissances.
        return {
            "answer": (
                "Aucun passage de vos cours ne correspond a cette question. "
                "La recherche est lexicale : essayez avec les mots employes "
                "dans le cours."
            ),
            "grounded": False,
            "sources": [],
            "courses": [],
            "appelLeModele": False,
        }

    sortie = pipeline.repondre_sur_la_bibliotheque(
        [(p.course_title, p.texte) for p in passages], question
    )

    # Les cours consultes sont rendus meme si la reponse n'est pas ancree :
    # savoir OU le tuteur a cherche fait partie de la reponse.
    vus: dict[str, str] = {}
    for passage in passages:
        vus.setdefault(passage.course_id, passage.course_title)

    return {
        **sortie.donnees,
        "courses": [{"id": i, "title": t} for i, t in vus.items()],
        "appelLeModele": True,
        "tokenTypes": sortie.types_masques,
        "latencyMs": sortie.telemetrie.latence_ms,
        "model": sortie.telemetrie.model,
    }
