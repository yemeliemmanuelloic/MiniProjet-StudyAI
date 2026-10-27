"""
Journal des gestes de revision et objectif hebdomadaire (decision 050).

Aucun appel au modele. `noter` est appele par chaque service qui enregistre
un geste de revision, AVANT son propre commit : le geste et sa trace partent
ensemble ou pas du tout.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..errors import ErreurApplicative
from ..models import Activite, Utilisateur

TYPES = {"quiz", "cartes", "examen", "ouvertes", "plan"}
JOURS_MAX = 400


def noter(session: Session, owner_id: str, type_geste: str) -> None:
    session.add(Activite(owner_id=owner_id, type=type_geste))


def journal(session: Session, owner_id: str, jours: int) -> dict:
    """
    Les gestes des `jours` derniers jours, reduits a un par type et par
    demi-heure : vingt cartes revisees d'affilee ne disent rien de plus
    qu'une seule pour compter les jours, et la reponse reste legere.
    """
    depuis = datetime.now(timezone.utc) - timedelta(days=min(max(jours, 1), JOURS_MAX))
    vus: set[tuple[str, datetime]] = set()
    gestes = []
    for type_geste, at in session.execute(
        select(Activite.type, Activite.at)
        .where(Activite.owner_id == owner_id, Activite.at >= depuis)
        .order_by(Activite.at)
    ):
        if at.tzinfo is None:  # SQLite rend des dates sans fuseau
            at = at.replace(tzinfo=timezone.utc)
        cle = (type_geste, at.replace(minute=at.minute - at.minute % 30, second=0, microsecond=0))
        if cle in vus:
            continue
        vus.add(cle)
        gestes.append({"type": type_geste, "at": at})
    utilisateur = session.get(Utilisateur, owner_id)
    return {"events": gestes, "weeklyGoal": utilisateur.objectif_hebdo if utilisateur else 5}


def fixer_objectif(session: Session, owner_id: str, objectif: int) -> int:
    if not 1 <= objectif <= 7:
        raise ErreurApplicative("VALIDATION_ERROR", "L'objectif va de 1 a 7 jours par semaine.")
    utilisateur = session.get(Utilisateur, owner_id)
    if utilisateur is None:
        raise ErreurApplicative("NOT_FOUND", "Compte introuvable.")
    utilisateur.objectif_hebdo = objectif
    session.commit()
    return objectif
