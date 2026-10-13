"""
Tableau de consommation : ce que l'IA a coute.

Une seule route, en lecture. AUCUN appel au modele — tout est deja en base,
enregistre a chaque operation depuis le premier jour et jusqu'ici invisible.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import obtenir_session
from ..schemas.api import ConsommationSortie
from ..security import Authentifie
from ..services import consommation

routeur = APIRouter(prefix="/api", tags=["Consommation"])

BaseDeDonnees = Annotated[Session, Depends(obtenir_session)]


@routeur.get("/usage", response_model=ConsommationSortie)
def tableau(identifiant: Authentifie, session: BaseDeDonnees) -> ConsommationSortie:
    """Consommation de l'etudiant : par module, par cours, par modele."""
    return ConsommationSortie.model_validate(
        consommation.tableau(session, identifiant)
    )
