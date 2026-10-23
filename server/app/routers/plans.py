"""
Plan de revision jusqu'a l'examen (decision 046).

Aucune route n'appelle le modele : pas de plafond de debit.
"""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..db import obtenir_session
from ..schemas.api import CalendrierSortie, CocheEntree, ModeleApi, PlanEntree, PlanSortie
from ..security import Authentifie
from ..services import plan as service

routeur = APIRouter(prefix="/api/plans", tags=["Plan de revision"])

BaseDeDonnees = Annotated[Session, Depends(obtenir_session)]
#: Date du jour de l'etudiant, dans son fuseau.
DuJour = Annotated[date | None, Query()]


class ListePlans(ModeleApi):
    plans: list[PlanSortie]


@routeur.post("", response_model=CalendrierSortie, status_code=201)
def creer(entree: PlanEntree, identifiant: Authentifie, session: BaseDeDonnees) -> dict:
    plan = service.creer(
        session,
        identifiant,
        entree.title,
        entree.exam_date,
        entree.course_ids,
        entree.minutes_per_day,
        entree.today,
    )
    return service.calendrier(session, plan, entree.today)


@routeur.get("", response_model=ListePlans)
def lister(identifiant: Authentifie, session: BaseDeDonnees) -> ListePlans:
    return ListePlans(plans=[PlanSortie.model_validate(p) for p in service.lister(session, identifiant)])


@routeur.get("/{plan_id}", response_model=CalendrierSortie)
def lire(plan_id: str, identifiant: Authentifie, session: BaseDeDonnees, today: DuJour = None) -> dict:
    return service.calendrier(session, service.plan_de(session, plan_id, identifiant), today)


@routeur.post("/{plan_id}/tasks", response_model=CalendrierSortie)
def cocher(
    plan_id: str, entree: CocheEntree, identifiant: Authentifie, session: BaseDeDonnees, today: DuJour = None
) -> dict:
    plan = service.cocher(session, plan_id, identifiant, entree.cle, entree.fait)
    return service.calendrier(session, plan, today)


@routeur.delete("/{plan_id}", status_code=204)
def supprimer(plan_id: str, identifiant: Authentifie, session: BaseDeDonnees) -> Response:
    service.supprimer(session, plan_id, identifiant)
    return Response(status_code=204)
