"""
Examen blanc multi-cours.

PARTICULARITE DE CE ROUTEUR : il n'appelle le modele que si on le lui demande.
Composer un examen puise dans les quiz deja generes, ce qui ne coute rien. Le
plafond de debit n'est donc PAS pose en dependance sur la route — il serait
consomme par des requetes gratuites — mais applique dans la seule branche qui
genere, `completer=true`.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import obtenir_session
from ..debit import limiter_appels_modele
from ..schemas.api import (
    CorrectionExamenSortie,
    ExamenEntree,
    ExamenPoseSortie,
    ExamenResumeSortie,
    ModeleApi,
    QuestionPoseeSortie,
    ReponsesExamenEntree,
)
from ..security import Authentifie
from ..services import examen as service

routeur = APIRouter(prefix="/api/exams", tags=["Examen blanc"])

BaseDeDonnees = Annotated[Session, Depends(obtenir_session)]


class ListeExamens(ModeleApi):
    exams: list[ExamenResumeSortie]


def _pose(examen) -> ExamenPoseSortie:
    """Projette un examen vers ce que le navigateur a le droit de voir."""
    return ExamenPoseSortie(
        id=examen.id,
        courses=examen.courses,
        questions=[
            QuestionPoseeSortie(question=q["question"], options=q.get("options", []), type=q.get("type", "qcm"))
            for q in examen.questions
        ],
        warnings=examen.warnings,
        total=examen.total,
        duration_s=examen.duration_s,
        remaining_s=service.restant_s(examen),
        started_at=examen.started_at,
        submitted_at=examen.submitted_at,
    )


@routeur.post("", response_model=ExamenPoseSortie, status_code=201)
def composer(
    entree: ExamenEntree, identifiant: Authentifie, session: BaseDeDonnees
) -> ExamenPoseSortie:
    if entree.completer:
        # Seule branche qui peut appeler le modele : seule a etre plafonnee.
        limiter_appels_modele(identifiant)

    examen = service.composer(
        session,
        identifiant,
        entree.course_ids,
        entree.question_count,
        duree_s=entree.duration_min * 60 if entree.duration_min else None,
        completer=entree.completer,
    )
    return _pose(examen)


@routeur.get("", response_model=ListeExamens)
def lister(identifiant: Authentifie, session: BaseDeDonnees) -> ListeExamens:
    return ListeExamens(
        exams=[
            ExamenResumeSortie.model_validate(e)
            for e in service.historique(session, identifiant)
        ]
    )


@routeur.get("/{exam_id}", response_model=ExamenPoseSortie)
def detail(
    exam_id: str, identifiant: Authentifie, session: BaseDeDonnees
) -> ExamenPoseSortie:
    """Reprendre un examen en cours : le temps restant est recalcule ici."""
    return _pose(service.examen_de(session, exam_id, identifiant))


@routeur.post("/{exam_id}/submit", response_model=CorrectionExamenSortie)
def rendre(
    exam_id: str,
    entree: ReponsesExamenEntree,
    identifiant: Authentifie,
    session: BaseDeDonnees,
) -> CorrectionExamenSortie:
    """La correction est le SEUL endroit ou les bonnes reponses descendent."""
    resultat = service.rendre(session, exam_id, identifiant, entree.answers)
    return CorrectionExamenSortie(
        exam=ExamenResumeSortie.model_validate(resultat["exam"]),
        correction=resultat["correction"],
        par_cours=resultat["parCours"],
        cards_queued=resultat["cardsQueued"],
    )
