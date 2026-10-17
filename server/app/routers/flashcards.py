"""
Cartes de revision espacee.

AUCUNE ROUTE DE CE FICHIER N'EST PLAFONNEE, et c'est delibere : le plafond de
debit protege le quota d'appels au modele, or aucune de ces routes n'en emet
un seul. Fabriquer un jeu puise dans les quiz deja en base, et reviser une
carte est de l'arithmetique. Poser `limiter_appels_modele` ici consommerait un
quota au profit de requetes gratuites — le meme raisonnement que pour
l'examen blanc, a ceci pres qu'ici il n'existe meme pas de branche qui genere.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import obtenir_session
from ..schemas.api import (
    CarteSortie,
    EtatJeuSortie,
    JeuSortie,
    MaterialisationSortie,
    RevisionEntree,
    RevisionSortie,
)
from ..security import Authentifie
from ..services import cartes as service

routeur = APIRouter(prefix="/api", tags=["Cartes de revision"])

BaseDeDonnees = Annotated[Session, Depends(obtenir_session)]


@routeur.post(
    "/courses/{course_id}/flashcards",
    response_model=MaterialisationSortie,
    status_code=201,
)
def materialiser(
    course_id: str, identifiant: Authentifie, session: BaseDeDonnees
) -> MaterialisationSortie:
    """
    Derive les cartes manquantes des quiz du cours. Zero appel au modele.

    Idempotent : un second appel ne cree rien et ne touche a aucune
    progression. Le front peut donc le declencher sans se demander si c'est
    la premiere fois.
    """
    resultat = service.materialiser(session, course_id, identifiant)
    return MaterialisationSortie(
        creees=resultat["creees"],
        ignorees=resultat["ignorees"],
        appels=resultat["appels"],
        etat=EtatJeuSortie(**service.etat_du_jeu(session, course_id, identifiant)),
    )


@routeur.get("/courses/{course_id}/flashcards", response_model=JeuSortie)
def session_du_jour(
    course_id: str, identifiant: Authentifie, session: BaseDeDonnees
) -> JeuSortie:
    """
    Les cartes dues aujourd'hui, et le compte du jeu entier.

    Les deux voyagent ensemble parce que l'ecran a besoin des deux : une liste
    vide ne dit pas si le jeu n'existe pas ou si tout est deja revise, et ce
    sont deux ecrans differents.
    """
    return JeuSortie(
        cards=[
            CarteSortie.model_validate(c)
            for c in service.a_reviser(session, course_id, identifiant)
        ],
        etat=EtatJeuSortie(**service.etat_du_jeu(session, course_id, identifiant)),
    )


@routeur.post("/flashcards/{carte_id}/review", response_model=RevisionSortie)
def reviser(
    carte_id: str,
    entree: RevisionEntree,
    identifiant: Authentifie,
    session: BaseDeDonnees,
) -> RevisionSortie:
    """
    La carte revient avec sa nouvelle echeance, et le compte du jeu avec elle.

    Sans ce second champ, les compteurs du haut de l'ecran resteraient figes
    pendant toute la session : l'etudiant noterait dix cartes en lisant
    toujours « 13 a revoir ». Les recalculer dans le navigateur reviendrait a
    y recopier le seuil « acquise ».
    """
    carte = service.reviser(session, carte_id, identifiant, entree.bouton)
    return RevisionSortie(
        card=CarteSortie.model_validate(carte),
        etat=EtatJeuSortie(
            **service.etat_du_jeu(session, carte.course_id, identifiant)
        ),
    )


@routeur.post("/courses/{course_id}/flashcards/reset", response_model=EtatJeuSortie)
def reinitialiser(
    course_id: str, identifiant: Authentifie, session: BaseDeDonnees
) -> EtatJeuSortie:
    """
    Remet l'avancement du jeu a zero, sans supprimer les cartes.

    POST et non DELETE : rien n'est supprime, et une route qui remet des
    compteurs a zero n'est pas une suppression de ressource.
    """
    service.reinitialiser(session, course_id, identifiant)
    return EtatJeuSortie(**service.etat_du_jeu(session, course_id, identifiant))
