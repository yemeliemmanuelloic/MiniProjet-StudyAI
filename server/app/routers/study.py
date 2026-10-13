"""Les trois modules IA : resume, quiz, tuteur ancre."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import obtenir_session
from ..errors import ErreurApplicative
from ..models import Message, Resume
from ..schemas.api import (
    ChargeUtileSortie,
    ChatEntree,
    CorrectionEntree,
    CorrectionSortie,
    MessageSortie,
    ModeleApi,
    ProgressionSortie,
    QuestionPoseeSortie,
    QuizEntree,
    QuizPoseSortie,
    ResumeEntree,
    ResumeSortie,
    TentativeResumeSortie,
)
from ..security import Authentifie
from ..services import fiche, revision, study

routeur = APIRouter(prefix="/api", tags=["Modules IA"])

BaseDeDonnees = Annotated[Session, Depends(obtenir_session)]


class UnResume(ModeleApi):
    summary: ResumeSortie


class ListeResumes(ModeleApi):
    summaries: list[ResumeSortie]


class UnQuiz(ModeleApi):
    quiz: QuizPoseSortie


class ListeMessages(ModeleApi):
    messages: list[MessageSortie]


class UnMessage(ModeleApi):
    message: MessageSortie


class ListeTentatives(ModeleApi):
    attempts: list[TentativeResumeSortie]


# --- Module 1 : resume --------------------------------------------------------


@routeur.post("/courses/{course_id}/summary", response_model=UnResume)
def resumer(
    course_id: str,
    entree: ResumeEntree,
    identifiant: Authentifie,
    session: BaseDeDonnees,
) -> UnResume:
    resume = study.resumer(session, course_id, identifiant, entree.level)
    return UnResume(summary=ResumeSortie.model_validate(resume))


@routeur.get("/courses/{course_id}/summaries", response_model=ListeResumes)
def lister_resumes(
    course_id: str, identifiant: Authentifie, session: BaseDeDonnees
) -> ListeResumes:
    study.cours_de(session, course_id, identifiant)
    resumes = session.scalars(
        select(Resume)
        .where(Resume.course_id == course_id)
        .order_by(Resume.created_at.desc())
    ).all()
    return ListeResumes(summaries=[ResumeSortie.model_validate(r) for r in resumes])


# --- Module 2 : quiz ----------------------------------------------------------


@routeur.post("/courses/{course_id}/quiz", response_model=UnQuiz)
def generer_quiz(
    course_id: str,
    entree: QuizEntree,
    identifiant: Authentifie,
    session: BaseDeDonnees,
) -> UnQuiz:
    quiz = study.generer_quiz(
        session, course_id, identifiant, entree.question_count, entree.difficulty
    )

    # La bonne reponse et l'explication ne descendent PAS au navigateur : sinon
    # l'auto-evaluation n'a plus aucun sens, il suffit de lire la reponse JSON
    # dans l'inspecteur reseau.
    questions = [
        QuestionPoseeSortie(question=q["question"], options=q["options"])
        for q in quiz.payload["questions"]
    ]
    return UnQuiz(
        quiz=QuizPoseSortie(
            id=quiz.id,
            question_count=quiz.question_count,
            segment_count=quiz.segment_count,
            questions=questions,
        )
    )


@routeur.post("/quizzes/{quiz_id}/submit", response_model=CorrectionSortie)
def corriger(
    quiz_id: str,
    entree: CorrectionEntree,
    identifiant: Authentifie,
    session: BaseDeDonnees,
) -> CorrectionSortie:
    return CorrectionSortie.model_validate(
        study.corriger_quiz(session, quiz_id, identifiant, entree.answers)
    )


# --- Module 3 : tuteur ancre --------------------------------------------------


@routeur.get("/courses/{course_id}/messages", response_model=ListeMessages)
def lister_messages(
    course_id: str, identifiant: Authentifie, session: BaseDeDonnees
) -> ListeMessages:
    study.cours_de(session, course_id, identifiant)
    messages = session.scalars(
        select(Message)
        .where(Message.course_id == course_id)
        .order_by(Message.created_at.asc())
    ).all()
    return ListeMessages(messages=[MessageSortie.model_validate(m) for m in messages])


@routeur.post("/courses/{course_id}/chat", response_model=UnMessage)
def repondre(
    course_id: str,
    entree: ChatEntree,
    identifiant: Authentifie,
    session: BaseDeDonnees,
) -> UnMessage:
    message = study.repondre(session, course_id, identifiant, entree.question)
    return UnMessage(message=MessageSortie.model_validate(message))


# --- Espace revision ----------------------------------------------------------
# Aucun appel au modele dans cette section : tout est deja en base.


@routeur.get("/courses/{course_id}/attempts", response_model=ListeTentatives)
def lister_tentatives(
    course_id: str, identifiant: Authentifie, session: BaseDeDonnees
) -> ListeTentatives:
    """Historique des tentatives de quiz sur un cours."""
    lignes = revision.tentatives(session, course_id, identifiant)
    return ListeTentatives(
        attempts=[TentativeResumeSortie.model_validate(l) for l in lignes]
    )


@routeur.get("/courses/{course_id}/progress", response_model=ProgressionSortie)
def progression(
    course_id: str, identifiant: Authentifie, session: BaseDeDonnees
) -> ProgressionSortie:
    """
    Progression de l'etudiant sur un cours.

    `weakQuestions` est le coeur de la fonctionnalite : les questions ratees
    plusieurs fois, avec l'extrait du cours correspondant. C'est ce qui dit a
    l'etudiant quoi reviser. La bonne reponse, elle, ne descend pas — meme
    regle que pour le quiz.
    """
    return ProgressionSortie.model_validate(
        revision.progression(session, course_id, identifiant)
    )


@routeur.get(
    "/courses/{course_id}/revision.pdf",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}, "description": "La fiche de revision"}},
)
def fiche_revision(
    course_id: str, identifiant: Authentifie, session: BaseDeDonnees
) -> Response:
    """
    Fiche de revision imprimable : le resume, les questions a revoir et la
    progression, en un PDF.

    Ne contient jamais les bonnes reponses du quiz — une fiche qui les donne
    ne sert pas a reviser.
    """
    contenu = fiche.construire(session, course_id, identifiant)
    return Response(
        content=contenu,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="revision-{course_id[:8]}.pdf"'
        },
    )


# --- Transparence : ce qui a ete transmis au modele ---------------------------


@routeur.get("/summaries/{summary_id}/payload", response_model=ChargeUtileSortie)
def charge_utile(
    summary_id: str, identifiant: Authentifie, session: BaseDeDonnees
) -> ChargeUtileSortie:
    """
    Rend la charge utile exacte envoyee au modele, jetons compris.

    C'est la seule preuve verifiable de l'anonymisation : affirmer que les
    donnees sont masquees ne vaut rien, le montrer se verifie a l'oeil nu.
    """
    resume = session.get(Resume, summary_id)
    if resume is None:
        raise ErreurApplicative("NOT_FOUND", "Resume introuvable.")
    if resume.cours.owner_id != identifiant:
        raise ErreurApplicative("FORBIDDEN", "Resume non accessible.")

    # Les types viennent de la table des jetons enregistree au moment de
    # l'appel, pas d'une recherche dans la charge : celle-ci contient le prompt
    # systeme, qui cite des jetons a titre d'exemple.
    return ChargeUtileSortie(
        payload=resume.sent_payload, token_map=list(resume.token_types or [])
    )
