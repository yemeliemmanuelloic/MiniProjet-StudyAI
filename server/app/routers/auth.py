"""Inscription, connexion, session courante."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import obtenir_session
from ..errors import ErreurApplicative
from ..models import Utilisateur
from ..schemas.api import (
    IdentifiantsEntree,
    ModeleApi,
    SessionSortie,
    UtilisateurSortie,
)
from ..security import Authentifie, creer_jeton, hacher, verifier

routeur = APIRouter(prefix="/api/auth", tags=["Authentification"])

BaseDeDonnees = Annotated[Session, Depends(obtenir_session)]


class EnveloppeUtilisateur(ModeleApi):
    user: UtilisateurSortie


@routeur.post("/register", response_model=SessionSortie, status_code=201)
def inscrire(entree: IdentifiantsEntree, session: BaseDeDonnees) -> SessionSortie:
    email = entree.email.lower()

    deja = session.scalars(
        select(Utilisateur).where(Utilisateur.email == email)
    ).first()
    if deja is not None:
        raise ErreurApplicative(
            "VALIDATION_ERROR", "Cette adresse est deja utilisee."
        )

    utilisateur = Utilisateur(email=email, password_hash=hacher(entree.password))
    session.add(utilisateur)
    session.commit()
    session.refresh(utilisateur)

    return SessionSortie(
        user=UtilisateurSortie.model_validate(utilisateur),
        token=creer_jeton(utilisateur.id),
    )


@routeur.post("/login", response_model=SessionSortie)
def connecter(entree: IdentifiantsEntree, session: BaseDeDonnees) -> SessionSortie:
    utilisateur = session.scalars(
        select(Utilisateur).where(Utilisateur.email == entree.email.lower())
    ).first()

    # Message identique que l'adresse soit inconnue ou le mot de passe faux :
    # distinguer les deux revient a publier la liste des comptes existants.
    if utilisateur is None or not verifier(entree.password, utilisateur.password_hash):
        raise ErreurApplicative("UNAUTHORIZED", "Adresse ou mot de passe incorrect.")

    return SessionSortie(
        user=UtilisateurSortie.model_validate(utilisateur),
        token=creer_jeton(utilisateur.id),
    )


@routeur.get("/me", response_model=EnveloppeUtilisateur)
def session_courante(
    identifiant: Authentifie, session: BaseDeDonnees
) -> EnveloppeUtilisateur:
    utilisateur = session.get(Utilisateur, identifiant)
    if utilisateur is None:
        raise ErreurApplicative("UNAUTHORIZED", "Compte introuvable.")
    return EnveloppeUtilisateur(user=UtilisateurSortie.model_validate(utilisateur))
