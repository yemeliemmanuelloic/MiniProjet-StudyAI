"""
Questions ouvertes corrigees par l'IA (decision 049).

Les points attendus et la reponse modele ne descendent qu'avec la correction.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import obtenir_session
from ..debit import limiter_appels_modele
from ..schemas.api import (
    CopieEntree,
    CopieSortie,
    QuestionsOuvertesEntree,
    QuestionsOuvertesPoseesSortie,
    UneSerieOuverte,
)
from ..security import Authentifie
from ..services import ouvertes as service

routeur = APIRouter(prefix="/api", tags=["Questions ouvertes"])

BaseDeDonnees = Annotated[Session, Depends(obtenir_session)]
SousQuota = Annotated[str, Depends(limiter_appels_modele)]


def _posees(serie) -> QuestionsOuvertesPoseesSortie:
    return QuestionsOuvertesPoseesSortie(
        id=serie.id,
        questions=[q["question"] for q in serie.payload["questions"]],
        created_at=serie.created_at,
    )


@routeur.get("/courses/{course_id}/open-quiz", response_model=UneSerieOuverte)
def lire(course_id: str, identifiant: Authentifie, session: BaseDeDonnees) -> UneSerieOuverte:
    """La derniere serie du cours, ou `null`. Aucun appel au modele."""
    serie = service.derniere(session, course_id, identifiant)
    return UneSerieOuverte(open_quiz=_posees(serie) if serie else None)


@routeur.post("/courses/{course_id}/open-quiz", response_model=UneSerieOuverte, status_code=201)
def generer(
    course_id: str, entree: QuestionsOuvertesEntree, identifiant: SousQuota, session: BaseDeDonnees
) -> UneSerieOuverte:
    """Redige une nouvelle serie de questions ouvertes. UN appel au modele."""
    serie = service.generer(session, course_id, identifiant, entree.question_count)
    return UneSerieOuverte(open_quiz=_posees(serie))


@routeur.post("/open-quizzes/{serie_id}/submit", response_model=CopieSortie)
def corriger(
    serie_id: str, entree: CopieEntree, identifiant: SousQuota, session: BaseDeDonnees
) -> CopieSortie:
    """Corrige la copie. UN appel au modele pour toutes les questions."""
    return CopieSortie.model_validate(service.corriger(session, serie_id, identifiant, entree.answers))
