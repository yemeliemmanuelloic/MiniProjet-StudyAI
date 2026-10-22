"""
Point d'entree de l'API StudyAI.

Forme d'erreur unique pour toute l'API : { "error": { code, message, details } }.
Le front lit `error.code` et compose lui-meme le message affiche — c'est ce qui
garantit que les cinq cas LLM_* s'affichent de la meme facon partout, et qu'ils
sont demontrables en soutenance.

La documentation interactive est publiee sur /docs : elle est generee a partir
des modeles de app/schemas/api.py, donc toujours a jour avec le code.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import parametres
from .errors import ErreurApplicative
from .routers import auth, courses, exams, flashcards, library, study, usage

logging.basicConfig(level=logging.INFO, format="[%(name)s] %(message)s")
journal = logging.getLogger("studyai")

application = FastAPI(
    title="StudyAI",
    version="1.0.0",
    summary="Assistant de revision : resume, quiz et tuteur ancre sur le cours de l'etudiant.",
    description=(
        "Mini-projet du module IA for Software Engineering.\n\n"
        "Trois modules IA appuyes sur un meme pipeline : anonymisation du cours, "
        "decoupage en segments, appel au modele, validation stricte de la sortie, "
        "rehydratation. Aucune sortie non conforme au schema n'est stockee ni affichee."
    ),
)

application.add_middleware(
    CORSMiddleware,
    allow_origins=[parametres.CLIENT_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@application.exception_handler(ErreurApplicative)
def _erreur_applicative(_requete: Request, erreur: ErreurApplicative) -> JSONResponse:
    if erreur.code.startswith("LLM_"):
        journal.error("%s %s", erreur.code, erreur.details)
    return JSONResponse(
        status_code=erreur.statut,
        content={
            "error": {
                "code": erreur.code,
                "message": erreur.message,
                "details": erreur.details,
            }
        },
    )


@application.exception_handler(RequestValidationError)
def _erreur_validation(
    _requete: Request, erreur: RequestValidationError
) -> JSONResponse:
    champs: dict[str, list[str]] = {}
    for probleme in erreur.errors():
        # On retire le premier element ("body", "query"...) : le front n'a que
        # faire de savoir ou se trouvait le champ.
        chemin = ".".join(str(p) for p in probleme["loc"][1:]) or "requete"
        champs.setdefault(chemin, []).append(probleme["msg"])

    return JSONResponse(
        status_code=400,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Donnees invalides.",
                "details": champs,
            }
        },
    )


@application.exception_handler(StarletteHTTPException)
def _erreur_http(_requete: Request, erreur: StarletteHTTPException) -> JSONResponse:
    """
    Reecrit les erreurs levees par le cadriciel lui-meme (404 sur une route
    inconnue, 405 sur une methode non autorisee) dans la forme du projet.
    Sans cela, le front recevrait deux formes d'erreur differentes selon que
    l'echec vienne de notre code ou de Starlette.
    """
    code = {404: "NOT_FOUND", 405: "NOT_FOUND", 401: "UNAUTHORIZED", 403: "FORBIDDEN"}.get(
        erreur.status_code, "INTERNAL"
    )
    return JSONResponse(
        status_code=erreur.status_code,
        content={
            "error": {"code": code, "message": str(erreur.detail), "details": {}}
        },
    )


@application.exception_handler(Exception)
def _erreur_interne(_requete: Request, erreur: Exception) -> JSONResponse:
    journal.exception("erreur interne", exc_info=erreur)
    return JSONResponse(
        status_code=500,
        content={
            "error": {"code": "INTERNAL", "message": "Erreur interne.", "details": {}}
        },
    )


@application.get("/api/health", tags=["Service"])
def sante() -> dict[str, object]:
    """Etat du service, sans secret : utile en demonstration et au deploiement."""
    return {
        "status": "ok",
        "provider": parametres.LLM_PROVIDER,
        "model": parametres.LLM_MODEL,
        "cle_presente": bool(parametres.cle_active),
        # Relais ACTIFS : configures ET munis de leur clef (noms seulement,
        # jamais les clefs). Lu dans la configuration : app/llm/client.py ne
        # s'importe pas hors de app/llm.
        "relais": [
            nom
            for nom in (e.split(":", 1)[0].strip() for e in parametres.LLM_RELAIS.split(",") if ":" in e)
            if nom == "groq" and parametres.GROQ_API_KEY
        ],
    }


application.include_router(auth.routeur)
application.include_router(courses.routeur)
application.include_router(study.routeur)
application.include_router(exams.routeur)
application.include_router(flashcards.routeur)
application.include_router(library.routeur)
application.include_router(usage.routeur)


if not parametres.cle_active:
    journal.warning(
        "Clef absente pour le fournisseur « %s » — les routes d'analyse "
        "repondront LLM_KEY_MISSING.",
        parametres.LLM_PROVIDER,
    )
else:
    journal.info(
        "Fournisseur actif : %s (%s)", parametres.LLM_PROVIDER, parametres.LLM_MODEL
    )
