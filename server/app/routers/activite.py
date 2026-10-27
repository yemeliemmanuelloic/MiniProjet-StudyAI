"""
Journal d'activite et objectif hebdomadaire (decision 050). Aucun appel au
modele : pas de plafond de debit.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..db import obtenir_session
from ..schemas.api import JournalSortie, ObjectifEntree
from ..security import Authentifie
from ..services import activite as service

routeur = APIRouter(prefix="/api/activity", tags=["Activite"])

BaseDeDonnees = Annotated[Session, Depends(obtenir_session)]


@routeur.get("", response_model=JournalSortie)
def lire(
    identifiant: Authentifie, session: BaseDeDonnees, days: Annotated[int, Query(ge=1, le=400)] = 120
) -> dict:
    return service.journal(session, identifiant, days)


@routeur.put("/goal", response_model=ObjectifEntree)
def fixer(entree: ObjectifEntree, identifiant: Authentifie, session: BaseDeDonnees) -> ObjectifEntree:
    return ObjectifEntree(weekly_goal=service.fixer_objectif(session, identifiant, entree.weekly_goal))
