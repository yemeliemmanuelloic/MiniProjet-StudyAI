"""Les trois modules IA : resume, quiz, tuteur ancre."""

from __future__ import annotations

import json
import logging
from collections.abc import Iterator
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import obtenir_session
from ..debit import limiter_appels_modele
from ..errors import ErreurApplicative
from ..models import Message, Resume
from ..schemas.api import (
    PresentationSortie,
    UnePresentation,
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
    ConversationSortie,
    ListeConversations,
    UneConversation,
)
from ..security import Authentifie
from ..services import fiche, revision, study

routeur = APIRouter(prefix="/api", tags=["Modules IA"])

BaseDeDonnees = Annotated[Session, Depends(obtenir_session)]
# Porte uniquement par les routes qui appellent le modele. Consulter ses cours
# ou sa progression ne coute rien et n'est donc pas limite.
SousQuota = Annotated[str, Depends(limiter_appels_modele)]


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
    identifiant: SousQuota,
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
    identifiant: SousQuota,
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
    identifiant: SousQuota,
    session: BaseDeDonnees,
) -> UnMessage:
    message = study.repondre(
        session, course_id, identifiant, entree.question, entree.conversation_id
    )
    return UnMessage(message=MessageSortie.model_validate(message))


journal = logging.getLogger("studyai.tuteur")


def _ligne(evenement: dict) -> str:
    return json.dumps(evenement, ensure_ascii=False) + "\n"


@routeur.post("/courses/{course_id}/chat/stream")
def repondre_en_flux(
    course_id: str,
    entree: ChatEntree,
    identifiant: SousQuota,
    session: BaseDeDonnees,
) -> StreamingResponse:
    """
    La reponse du tuteur au fil de l'eau (23 octobre), en NDJSON : une ligne
    JSON par evenement.

      {"type": "conversation", "conversationId": "..."}  la question est enregistree
      {"type": "texte", "texte": "..."}                  un morceau de la reponse
      {"type": "fin", "message": {...}}                  la reponse validee, enregistree
      {"type": "erreur", "error": {...}}                 echec en cours de route

    Les droits, le quota et l'existence du cours sont verifies AVANT le flux :
    ces erreurs gardent leur statut HTTP et leur enveloppe habituelle. Une
    fois le flux ouvert, le statut est deja 200 : un echec du modele arrive
    donc comme evenement, dans la meme enveloppe { code, message, details }.
    """
    preparee = study.preparer_question(
        session, course_id, identifiant, entree.question, entree.conversation_id
    )

    def evenements() -> Iterator[str]:
        yield _ligne({"type": "conversation", "conversationId": preparee.conversation_id})
        try:
            flux = study.repondre_en_flux(session, preparee)
            while True:
                try:
                    morceau = next(flux)
                except StopIteration as fin:
                    message = fin.value
                    break
                yield _ligne({"type": "texte", "texte": morceau})
        except ErreurApplicative as erreur:
            yield _ligne(
                {"type": "erreur", "error": {"code": erreur.code, "message": str(erreur), "details": erreur.details}}
            )
            return
        except Exception:  # noqa: BLE001 - le flux ne doit jamais se couper en silence
            journal.exception("echec du flux du tuteur")
            yield _ligne(
                {"type": "erreur", "error": {"code": "INTERNAL", "message": "Erreur interne.", "details": {}}}
            )
            return
        sortie = MessageSortie.model_validate(message).model_dump(by_alias=True, mode="json")
        yield _ligne({"type": "fin", "message": sortie})

    return StreamingResponse(
        evenements(),
        media_type="application/x-ndjson",
        # Pas de mise en tampon par un mandataire : sinon tout arrive a la fin.
        headers={"cache-control": "no-cache", "x-accel-buffering": "no"},
    )


# --- Conversations du tuteur (20 octobre) : aucun appel au modele -----------


@routeur.get("/courses/{course_id}/conversations", response_model=ListeConversations)
def lister_conversations(
    course_id: str, identifiant: Authentifie, session: BaseDeDonnees
) -> ListeConversations:
    lignes = study.lister_conversations(session, course_id, identifiant)
    return ListeConversations(conversations=[ConversationSortie(**l) for l in lignes])


@routeur.post(
    "/courses/{course_id}/conversations", response_model=UneConversation, status_code=201
)
def nouvelle_conversation(
    course_id: str, identifiant: Authentifie, session: BaseDeDonnees
) -> UneConversation:
    c = study.nouvelle_conversation(session, course_id, identifiant)
    return UneConversation(
        conversation=ConversationSortie(
            id=c.id, title=c.title, created_at=c.created_at, updated_at=c.updated_at
        )
    )


@routeur.get("/conversations/{conversation_id}/messages", response_model=ListeMessages)
def messages_conversation(
    conversation_id: str, identifiant: Authentifie, session: BaseDeDonnees
) -> ListeMessages:
    messages = study.messages_de(session, conversation_id, identifiant)
    return ListeMessages(messages=[MessageSortie.model_validate(m) for m in messages])


@routeur.delete("/conversations/{conversation_id}", status_code=204)
def supprimer_conversation(
    conversation_id: str, identifiant: Authentifie, session: BaseDeDonnees
) -> Response:
    study.supprimer_conversation(session, conversation_id, identifiant)
    return Response(status_code=204)


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



# --- Presentation narree (decision 044) ------------------------------------------


@routeur.get("/courses/{course_id}/presentation", response_model=UnePresentation)
def lire_presentation(
    course_id: str, identifiant: Authentifie, session: BaseDeDonnees
) -> UnePresentation:
    """La derniere presentation du cours, ou `null`. Aucun appel au modele."""
    p = study.derniere_presentation(session, course_id, identifiant)
    return UnePresentation(presentation=PresentationSortie.model_validate(p) if p else None)


@routeur.post("/courses/{course_id}/presentation", response_model=UnePresentation, status_code=201)
def generer_presentation(
    course_id: str, identifiant: SousQuota, session: BaseDeDonnees
) -> UnePresentation:
    """Ecrit le script d'une nouvelle presentation narree. UN appel au modele."""
    p = study.generer_presentation(session, course_id, identifiant)
    return UnePresentation(presentation=PresentationSortie.model_validate(p))


@routeur.get("/courses/{course_id}/presentation/{presentation_id}/voice/{scene}")
def voix_de_scene(
    course_id: str, presentation_id: str, scene: int, identifiant: Authentifie, session: BaseDeDonnees
) -> Response:
    """
    Voix naturelle d'une scene, en MP3 (decision 045). Produite a la premiere
    ecoute — c'est alors seulement que le quota s'applique —, relue ensuite
    sans appel. 204 : la scene se lit avec la voix du navigateur.
    """
    presentation, voix = study.voix_enregistree(session, course_id, identifiant, presentation_id, scene)
    if voix is None:
        limiter_appels_modele(identifiant)
        voix = study.produire_voix(session, presentation, scene)
    if voix is None:
        return Response(status_code=204)
    return Response(
        content=voix.audio,
        media_type="audio/mpeg",
        headers={"Cache-Control": "private, max-age=86400"},
    )
