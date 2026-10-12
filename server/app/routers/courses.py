"""
Bibliotheque de cours.

Aucun appel au modele dans ce fichier : importer un cours, c'est enregistrer du
texte. Les trois modules IA vivent dans routers/study.py. Cette separation est
volontaire — elle rend visible, a la lecture, ce qui coute un appel et ce qui
n'en coute pas.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import parametres
from ..db import obtenir_session
from ..errors import ErreurApplicative
from ..models import Cours, Message, Quiz, Resume
from ..schemas.api import (
    ComptesSortie,
    CoursEntree,
    CoursResumeSortie,
    CoursSortie,
    ModeleApi,
)
from ..security import Authentifie
from ..services.pdf import extraire_texte
from ..services.study import cours_de, empreinte

routeur = APIRouter(prefix="/api/courses", tags=["Cours"])

BaseDeDonnees = Annotated[Session, Depends(obtenir_session)]

TAILLE_MAX_PDF = 8 * 1024 * 1024


class ListeCours(ModeleApi):
    courses: list[CoursResumeSortie]


class UnCours(ModeleApi):
    course: CoursSortie


@routeur.get("", response_model=ListeCours)
def lister(identifiant: Authentifie, session: BaseDeDonnees) -> ListeCours:
    """Liste des cours de l'etudiant, sans le contenu : inutile et volumineux."""
    def compteur(modele: type) -> object:
        # Les colonnes sont nommees explicitement : sans `label`, SQLAlchemy
        # expose la sous-requete sous le nom de l'attribut Python et non sous
        # celui de la colonne, ce qui casse la jointure a l'execution.
        return (
            select(
                modele.course_id.label("cours"), func.count().label("total")
            )
            .group_by(modele.course_id)
            .subquery()
        )

    sous_resumes = compteur(Resume)
    sous_quiz = compteur(Quiz)
    sous_messages = compteur(Message)

    lignes = session.execute(
        select(
            Cours,
            func.coalesce(sous_resumes.c.total, 0),
            func.coalesce(sous_quiz.c.total, 0),
            func.coalesce(sous_messages.c.total, 0),
        )
        .outerjoin(sous_resumes, sous_resumes.c.cours == Cours.id)
        .outerjoin(sous_quiz, sous_quiz.c.cours == Cours.id)
        .outerjoin(sous_messages, sous_messages.c.cours == Cours.id)
        .where(Cours.owner_id == identifiant)
        .order_by(Cours.created_at.desc())
    ).all()

    return ListeCours(
        courses=[
            CoursResumeSortie(
                id=cours.id,
                title=cours.title,
                subject=cours.subject,
                char_count=cours.char_count,
                created_at=cours.created_at,
                compte=ComptesSortie(summaries=nr, quizzes=nq, messages=nm),
            )
            for cours, nr, nq, nm in lignes
        ]
    )


@routeur.get("/{course_id}", response_model=UnCours)
def detail(course_id: str, identifiant: Authentifie, session: BaseDeDonnees) -> UnCours:
    return UnCours(course=CoursSortie.model_validate(cours_de(session, course_id, identifiant)))


@routeur.post("", response_model=UnCours, status_code=201)
def creer(entree: CoursEntree, identifiant: Authentifie, session: BaseDeDonnees) -> UnCours:
    contenu = entree.content.strip()[: parametres.MAX_COURSE_CHARS]

    cours = Cours(
        owner_id=identifiant,
        title=entree.title,
        subject=entree.subject,
        content=contenu,
        char_count=len(contenu),
        hash=empreinte(contenu),
    )
    session.add(cours)
    session.commit()
    session.refresh(cours)
    return UnCours(course=CoursSortie.model_validate(cours))


@routeur.post("/import", response_model=UnCours, status_code=201)
def importer(
    identifiant: Authentifie,
    session: BaseDeDonnees,
    file: Annotated[UploadFile, File()],
    title: Annotated[str | None, Form()] = None,
    subject: Annotated[str | None, Form()] = None,
) -> UnCours:
    """Import d'un PDF a couche texte. L'extraction n'appelle PAS le modele."""
    if file.content_type != "application/pdf":
        raise ErreurApplicative(
            "VALIDATION_ERROR", "Seuls les PDF a couche texte sont acceptes."
        )

    contenu = file.file.read()
    if len(contenu) > TAILLE_MAX_PDF:
        raise ErreurApplicative(
            "VALIDATION_ERROR", "Fichier trop volumineux (8 Mo maximum)."
        )

    texte = extraire_texte(contenu)[: parametres.MAX_COURSE_CHARS]
    nom = (title or "").strip() or (file.filename or "Cours").removesuffix(".pdf")

    cours = Cours(
        owner_id=identifiant,
        title=nom[:300],
        subject=(subject or "").strip() or None,
        content=texte,
        char_count=len(texte),
        hash=empreinte(texte),
    )
    session.add(cours)
    session.commit()
    session.refresh(cours)
    return UnCours(course=CoursSortie.model_validate(cours))


@routeur.delete("/{course_id}", status_code=204)
def supprimer(course_id: str, identifiant: Authentifie, session: BaseDeDonnees) -> None:
    cours = cours_de(session, course_id, identifiant)
    session.delete(cours)
    session.commit()
