"""
Entree publique du module LLM.

Le reste de l'application n'appelle QUE les trois fonctions de ce fichier.
Elles prennent le texte brut du cours et rendent une sortie validee : tout ce
qui se passe entre les deux — anonymisation, decoupage, appels, validation,
agregation, rehydratation — est interne au paquet app/llm/.

C'est ce qui rend la regle de confidentialite structurelle et non
disciplinaire : aucun chemin ne permet d'envoyer un cours au modele sans
passer par le masquage, parce qu'aucun autre chemin n'existe.

UN MASQUAGE, UNE SEULE FOIS
---------------------------
L'anonymisation est appliquee au cours ENTIER avant le decoupage, jamais
segment par segment. Masquer chaque segment separement produirait des jetons
numerotes independamment ([NOM_1] designant Alice dans un segment et Bob dans
le suivant) et l'agregation melangerait les identites.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from ..config import parametres
from ..services.segmentation import (
    Decoupage,
    Segment,
    decouper,
    echelonner,
    repartir,
    selectionner,
)
from .redact import ValeursConnues, masquer, restaurer
from .run_task import Resultat, Tache, Telemetrie, executer_tache, valeurs
from .tasks import (
    TACHE_CHAT,
    TACHE_FUSION,
    TACHE_QUIZ,
    TACHE_RESUME,
    prompt_chat,
    prompt_fusion,
    prompt_quiz,
    prompt_quiz_segment,
    prompt_resume,
    prompt_resume_segment,
)

# Separateur de decoupe pour masquer plusieurs textes en un seul passage, afin
# qu'ils partagent la meme table de jetons. Choisi pour n'activer aucun motif
# d'anonymisation et n'apparaitre dans aucun cours.
_CLOISON = "\n<<<@@STUDYAI@@>>>\n"

_PREFIXE_JETON = re.compile(r"\[([A-Z_]+)_\d+\]")


def _types(carte: dict[str, str]) -> list[str]:
    """
    Types de donnees personnelles effectivement remplaces, deduits de la table
    des jetons.

    Surtout pas en cherchant les jetons dans la charge envoyee : celle-ci
    contient le prompt systeme, qui cite [NOM_1], [EMAIL_1], [TEL_1] et
    [ETABLISSEMENT_1] a titre d'exemple. La vue de transparence affichait donc
    ces quatre types sur n'importe quel cours, y compris un cours sans la
    moindre donnee personnelle. Defaut constate le 12 octobre au premier appel
    reel.
    """
    trouves = {m.group(1) for cle in carte if (m := _PREFIXE_JETON.match(cle))}
    return sorted(trouves)


@dataclass(frozen=True)
class SortieModule:
    """Ce qu'un module IA rend au service : donnees pretes a stocker et a afficher."""

    donnees: dict[str, Any]
    telemetrie: Telemetrie
    charge_envoyee: str
    segments: int
    tronque: bool
    # Types de donnees personnelles REELLEMENT masquees dans ce cours.
    # Deduits de la table des jetons, et non recherches dans la charge
    # envoyee : celle-ci contient le prompt systeme, qui cite [NOM_1],
    # [EMAIL_1]... a titre d'exemple. Les compter revenait a afficher
    # « NOM masque » sur un cours qui n'en contient aucun.
    types_masques: list[str] = field(default_factory=list)


def _preparer(texte: str, *autres: str, connues: ValeursConnues | None = None):
    """Masque plusieurs textes en un seul passage, avec une table de jetons commune."""
    assemble = _CLOISON.join([texte, *autres])
    masque, carte = masquer(assemble, connues)
    return masque.split(_CLOISON), carte


def _decouper(masque: str) -> Decoupage:
    return decouper(
        masque,
        taille=parametres.SEGMENT_CHARS,
        recouvrement=parametres.SEGMENT_OVERLAP,
        maximum=parametres.MAX_SEGMENTS,
    )


def _lancer(tache: Tache, prompt: tuple[str, str]) -> Resultat:
    return executer_tache(tache, prompt[0], prompt[1])


def _avertir_troncature(donnees: dict[str, Any], decoupage: Decoupage) -> None:
    """
    Signale a l'etudiant qu'une partie du cours n'a pas ete traitee.

    L'ancienne version coupait a 20 000 caracteres sans rien dire. Si une
    limite doit subsister, elle doit au moins etre visible : un resume
    incomplet qui s'annonce complet est pire qu'un resume incomplet.
    """
    if not decoupage.tronque:
        return
    traites = parametres.MAX_SEGMENTS * parametres.SEGMENT_CHARS
    donnees.setdefault("warnings", []).append(
        f"Cours tres long ({decoupage.total_caracteres} caracteres) : "
        f"seuls les {traites} premiers caracteres environ ont ete analyses."
    )


# --- Module 1 : resume --------------------------------------------------------


def resumer_cours(texte: str, niveau: str = "standard") -> SortieModule:
    """
    Resume un cours, quelle que soit sa longueur.

    Cours court  : un appel.
    Cours long   : un appel par segment, puis un appel d'agregation qui fusionne
                   les resumes partiels. Le modele ne voit jamais le cours
                   entier d'un coup — c'est ce qui evite la perte de contenu au
                   milieu des contextes tres longs.
    """
    (masque,), carte = _preparer(texte)
    decoupage = _decouper(masque)

    if decoupage.est_court:
        segment = decoupage.segments[0]
        resultat = _lancer(TACHE_RESUME, prompt_resume(segment.texte, niveau))
        donnees = valeurs(resultat.donnees)
        telemetrie = resultat.telemetrie
        charge = resultat.charge_envoyee
    else:
        partiels: list[dict[str, Any]] = []
        telemetrie: Telemetrie | None = None
        charges: list[str] = []

        for segment in decoupage.segments:
            etape = _lancer(
                TACHE_RESUME,
                prompt_resume_segment(segment, decoupage.nombre, niveau),
            )
            partiels.append(valeurs(etape.donnees))
            charges.append(etape.charge_envoyee)
            telemetrie = etape.telemetrie if telemetrie is None else telemetrie + etape.telemetrie

        fusion = _lancer(TACHE_FUSION, prompt_fusion(partiels, niveau))
        charges.append(fusion.charge_envoyee)
        donnees = valeurs(fusion.donnees)
        assert telemetrie is not None
        telemetrie = telemetrie + fusion.telemetrie
        charge = "\n\n========\n\n".join(charges)

    _avertir_troncature(donnees, decoupage)

    return SortieModule(
        donnees=restaurer(donnees, carte),
        telemetrie=telemetrie,
        charge_envoyee=charge,
        segments=decoupage.nombre,
        tronque=decoupage.tronque,
        types_masques=_types(carte),
    )


# --- Module 2 : quiz ----------------------------------------------------------


def generer_quiz(texte: str, nombre: int = 5, difficulte: str = "standard") -> SortieModule:
    """
    Genere un quiz couvrant tout le cours.

    Sur un cours long, les questions sont reparties sur des segments echelonnes
    plutot que tirees du debut : un quiz portant uniquement sur l'introduction
    ne reviserait rien.
    """
    (masque,), carte = _preparer(texte)
    decoupage = _decouper(masque)

    if decoupage.est_court:
        resultat = _lancer(
            TACHE_QUIZ, prompt_quiz(decoupage.segments[0].texte, nombre, difficulte)
        )
        questions = valeurs(resultat.donnees)["questions"]
        telemetrie = resultat.telemetrie
        charge = resultat.charge_envoyee
    else:
        retenus = echelonner(
            decoupage.segments, min(parametres.SEGMENTS_QUIZ, decoupage.nombre, nombre)
        )
        quotas = repartir(nombre, len(retenus))

        questions = []
        telemetrie: Telemetrie | None = None
        charges: list[str] = []

        for segment, quota in zip(retenus, quotas):
            if quota <= 0:
                continue
            etape = _lancer(
                TACHE_QUIZ,
                prompt_quiz_segment(segment, decoupage.nombre, quota, difficulte),
            )
            questions.extend(valeurs(etape.donnees)["questions"])
            charges.append(etape.charge_envoyee)
            telemetrie = etape.telemetrie if telemetrie is None else telemetrie + etape.telemetrie

        assert telemetrie is not None
        charge = "\n\n========\n\n".join(charges)

    # Garde-fou applicatif : le modele annonce parfois un nombre de questions
    # different de celui demande. On ne rejette pas, on tronque.
    donnees = {"questions": questions[:nombre]}

    return SortieModule(
        donnees=restaurer(donnees, carte),
        telemetrie=telemetrie,
        charge_envoyee=charge,
        segments=decoupage.nombre,
        tronque=decoupage.tronque,
        types_masques=_types(carte),
    )


# --- Module 3 : tuteur ancre --------------------------------------------------


def repondre_question(texte: str, question: str, historique: str = "") -> SortieModule:
    """
    Repond a une question en s'appuyant sur les passages pertinents du cours.

    Sur un cours court, « pertinent » veut dire tout le cours. Sur un cours
    long, les segments sont classes par proximite lexicale avec la question
    (BM25) et seuls les meilleurs sont envoyes. Cela borne la charge utile et
    concentre l'attention du modele.
    """
    (masque, question_masquee, historique_masque), carte = _preparer(
        texte, question, historique
    )
    decoupage = _decouper(masque)

    retenus: list[Segment] = (
        decoupage.segments
        if decoupage.est_court
        else selectionner(decoupage.segments, question_masquee, parametres.SEGMENTS_CHAT)
    )

    resultat = _lancer(
        TACHE_CHAT,
        prompt_chat(retenus, question_masquee, historique_masque, decoupage.nombre),
    )

    return SortieModule(
        donnees=restaurer(valeurs(resultat.donnees), carte),
        telemetrie=resultat.telemetrie,
        charge_envoyee=resultat.charge_envoyee,
        segments=len(retenus),
        tronque=decoupage.tronque,
        types_masques=_types(carte),
    )
