"""Inscription, connexion, session courante."""

from __future__ import annotations

from typing import Annotated

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import debit
from ..db import obtenir_session
from ..errors import ErreurApplicative
from ..models import Utilisateur
from ..schemas.api import (
    IdentifiantsEntree,
    ModeleApi,
    MotDePasseEntree,
    SessionSortie,
    SuppressionCompteEntree,
    UtilisateurSortie,
)
from ..services import compte
from ..security import Authentifie, creer_jeton, hacher, verifier

routeur = APIRouter(prefix="/api/auth", tags=["Authentification"])

BaseDeDonnees = Annotated[Session, Depends(obtenir_session)]


class EnveloppeUtilisateur(ModeleApi):
    user: UtilisateurSortie


@routeur.post("/register", response_model=SessionSortie, status_code=201)
def inscrire(
    entree: IdentifiantsEntree, requete: Request, session: BaseDeDonnees
) -> SessionSortie:
    # Avant toute lecture : la creation de comptes en serie est le seul moyen
    # de contourner le plafond d'appels par etudiant (voir debit.py).
    debit.limiter_inscriptions(requete)
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
    email = entree.email.lower()
    # Le blocage est verifie AVANT le mot de passe : sinon la tentative de trop
    # serait quand meme evaluee, et la devinette continuerait.
    debit.verifier_connexion_autorisee(email)
    utilisateur = session.scalars(
        select(Utilisateur).where(Utilisateur.email == email)
    ).first()

    # Message identique que l'adresse soit inconnue ou le mot de passe faux :
    # distinguer les deux revient a publier la liste des comptes existants.
    if utilisateur is None or not verifier(entree.password, utilisateur.password_hash):
        # Compte aussi pour une adresse inconnue : sans cela, le blocage
        # revelerait quelles adresses ont un compte.
        debit.noter_echec_connexion(email)
        raise ErreurApplicative("UNAUTHORIZED", "Adresse ou mot de passe incorrect.")

    debit.oublier_echecs_connexion(email)

    # La connexion en cours devient la « precedente » de la suivante.
    utilisateur.connexion_precedente = utilisateur.derniere_connexion
    utilisateur.derniere_connexion = datetime.now(timezone.utc)
    session.commit()
    session.refresh(utilisateur)

    return SessionSortie(
        user=UtilisateurSortie.model_validate(utilisateur),
        token=creer_jeton(utilisateur.id, utilisateur.version_session or 0),
    )


@routeur.get("/me", response_model=EnveloppeUtilisateur)
def session_courante(
    identifiant: Authentifie, session: BaseDeDonnees
) -> EnveloppeUtilisateur:
    utilisateur = session.get(Utilisateur, identifiant)
    if utilisateur is None:
        raise ErreurApplicative("UNAUTHORIZED", "Compte introuvable.")
    return EnveloppeUtilisateur(user=UtilisateurSortie.model_validate(utilisateur))


def _verifier_mot_de_passe(utilisateur: Utilisateur, mot_de_passe: str) -> None:
    """
    Confirmation des actions sensibles par le mot de passe. Partage le
    compteur d'echecs de la connexion : sinon ces routes offriraient une
    seconde porte, non freinee, pour deviner le mot de passe d'une session
    volee.
    """
    debit.verifier_connexion_autorisee(utilisateur.email)
    if not verifier(mot_de_passe, utilisateur.password_hash):
        debit.noter_echec_connexion(utilisateur.email)
        raise ErreurApplicative(
            "VALIDATION_ERROR",
            "Mot de passe incorrect.",
            {"password": ["Mot de passe incorrect."]},
        )
    debit.oublier_echecs_connexion(utilisateur.email)


@routeur.post("/password", response_model=SessionSortie)
def changer_mot_de_passe(
    entree: MotDePasseEntree, identifiant: Authentifie, session: BaseDeDonnees
) -> SessionSortie:
    """
    Change le mot de passe et DECONNECTE LES AUTRES APPAREILS : la version de
    session est incrementee, ce qui invalide tous les jetons emis avant. Un
    jeton neuf est rendu, pour que l'appareil en cours reste connecte.
    """
    utilisateur = session.get(Utilisateur, identifiant)
    if utilisateur is None:
        raise ErreurApplicative("UNAUTHORIZED", "Compte introuvable.")
    _verifier_mot_de_passe(utilisateur, entree.current_password)

    utilisateur.password_hash = hacher(entree.new_password)
    utilisateur.version_session = (utilisateur.version_session or 0) + 1
    session.commit()
    session.refresh(utilisateur)
    debit.journal.warning("compte: mot de passe change (utilisateur %s)", identifiant)

    return SessionSortie(
        user=UtilisateurSortie.model_validate(utilisateur),
        token=creer_jeton(utilisateur.id, utilisateur.version_session),
    )


@routeur.delete("/me", status_code=204)
def supprimer_compte(
    entree: SuppressionCompteEntree, identifiant: Authentifie, session: BaseDeDonnees
) -> Response:
    """
    Supprime le compte et TOUTES ses donnees : cours, resumes, quiz,
    tentatives, messages, cartes, examens. Irreversible ; le mot de passe est
    redemande. Les jetons du compte deviennent caducs (security.py).
    """
    utilisateur = session.get(Utilisateur, identifiant)
    if utilisateur is None:
        raise ErreurApplicative("UNAUTHORIZED", "Compte introuvable.")
    _verifier_mot_de_passe(utilisateur, entree.password)

    session.delete(utilisateur)
    session.commit()
    debit.journal.warning("compte: supprime (utilisateur %s)", identifiant)
    return Response(status_code=204)


@routeur.get("/me/export")
def exporter_donnees(identifiant: Authentifie, session: BaseDeDonnees) -> JSONResponse:
    """Toutes les donnees de l'etudiant, en un fichier JSON a telecharger."""
    donnees = compte.exporter(session, identifiant)
    jour = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return JSONResponse(
        content=donnees,
        headers={"Content-Disposition": f'attachment; filename="studyai-mes-donnees-{jour}.json"'},
    )
