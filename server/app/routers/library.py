"""
Recherche et tuteur transversaux : toute la bibliotheque de l'etudiant.

Deux routes, deux couts radicalement differents, et c'est volontaire :

  GET  /api/search  — purement lexical, AUCUN appel au modele. Fonctionne
                      meme sans clef d'API, donc meme pendant une panne du
                      fournisseur. Pas de plafond de debit : rien a proteger.
  POST /api/ask     — un appel, quel que soit le nombre de cours, parce que
                      la selection des passages a deja ete faite en local.
                      Plafonne, comme les trois autres routes qui appellent.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..db import obtenir_session
from ..debit import AppelModele
from ..schemas.api import (
    CoursDeLExamenSortie,
    ModeleApi,
    PassageSortie,
    QuestionBibliothequeEntree,
    ReponseBibliothequeSortie,
)
from ..security import Authentifie
from ..services import recherche

routeur = APIRouter(prefix="/api", tags=["Bibliotheque"])

BaseDeDonnees = Annotated[Session, Depends(obtenir_session)]


class ResultatsRecherche(ModeleApi):
    query: str
    #: Les mots effectivement cherches, apres retrait des mots trop courts.
    #: Le navigateur s'en sert pour surligner, au lieu de redecouper la
    #: requete de son cote avec des regles qui finiraient par differer.
    terms: list[str]
    passages: list[PassageSortie]


@routeur.get("/search", response_model=ResultatsRecherche)
def chercher(
    identifiant: Authentifie,
    session: BaseDeDonnees,
    q: Annotated[str, Query(min_length=2, max_length=200)],
    limit: Annotated[int, Query(ge=1, le=30)] = recherche.LIMITE,
) -> ResultatsRecherche:
    """Cherche dans tous les cours de l'etudiant. N'appelle PAS le modele."""
    passages = recherche.chercher(session, identifiant, q, limite=limit)
    return ResultatsRecherche(
        query=q,
        terms=recherche.mots_de(q),
        passages=[PassageSortie.model_validate(p) for p in passages],
    )


@routeur.post("/ask", response_model=ReponseBibliothequeSortie)
def demander(
    entree: QuestionBibliothequeEntree,
    identifiant: Authentifie,
    session: BaseDeDonnees,
    _quota: Annotated[str, AppelModele],
) -> ReponseBibliothequeSortie:
    """
    Pose une question sans dire de quel cours il s'agit : le tuteur trouve.

    La reponse n'est PAS enregistree, et c'est un choix. Un echange qui
    traverse plusieurs cours ne se rattache a aucun ; l'accrocher au cours
    le plus represente serait une approximation visible dans l'historique.
    Les sources nommant leur cours, l'etudiant peut poursuivre dans le tuteur
    du bon cours, ou l'echange sera conserve. Voir DECISIONS.md 019.
    """
    donnees = recherche.demander(session, identifiant, entree.question)
    return ReponseBibliothequeSortie(
        answer=donnees["answer"],
        grounded=donnees["grounded"],
        sources=donnees.get("sources") or [],
        courses=[CoursDeLExamenSortie(**c) for c in donnees["courses"]],
        appele_le_modele=donnees["appelLeModele"],
        token_types=donnees.get("tokenTypes", []),
        latency_ms=donnees.get("latencyMs"),
        model=donnees.get("model"),
    )
