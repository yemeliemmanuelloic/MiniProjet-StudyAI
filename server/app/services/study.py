"""
Logique metier des trois modules.

Ce service ignore comment l'anonymisation et le decoupage fonctionnent : il
appelle les trois fonctions de app/llm/pipeline.py, qui s'en chargent. C'est ce
qui garantit qu'aucun chemin ne contourne le masquage.
"""

from __future__ import annotations

import hashlib

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..errors import ErreurApplicative
from ..llm import pipeline
from ..llm.tasks import TACHE_RESUME
from ..models import Conversation, Cours, Message, Quiz, Resume, Tentative


def empreinte(texte: str) -> str:
    """Cle de cache : un cours inchange n'est pas reanalyse."""
    return hashlib.sha256(texte.encode("utf-8")).hexdigest()[:32]


def cours_de(session: Session, course_id: str, owner_id: str) -> Cours:
    cours = session.get(Cours, course_id)
    if cours is None:
        raise ErreurApplicative("NOT_FOUND", "Cours introuvable.")
    if cours.owner_id != owner_id:
        raise ErreurApplicative("FORBIDDEN", "Ce cours ne vous appartient pas.")
    return cours


# --- Module 1 : resume --------------------------------------------------------


def resumer(
    session: Session, course_id: str, owner_id: str, niveau: str = "standard"
) -> Resume:
    cours = cours_de(session, course_id, owner_id)

    # Cache : meme cours, meme niveau, MEME VERSION DE PROMPT => pas de nouvel
    # appel. Reduit le cout et stabilise la demonstration ; sur un cours long,
    # l'economie n'est pas marginale, un resume pouvant representer une
    # vingtaine d'appels.
    #
    # La version du prompt fait partie de la cle, et c'est le point important :
    # sans elle, une amelioration des consignes resterait invisible tant qu'un
    # ancien resume dormirait en cache. C'est exactement ce qui s'est produit
    # le 13 octobre avec la correction des accents — les resumes deja produits
    # continuaient a s'afficher sans accents.
    existant = session.scalars(
        select(Resume)
        .where(
            Resume.course_id == course_id,
            Resume.level == niveau,
            Resume.prompt_version == TACHE_RESUME.version_prompt,
        )
        .order_by(Resume.created_at.desc())
        .limit(1)
    ).first()
    if existant is not None:
        return existant

    sortie = pipeline.resumer_cours(cours.content, niveau)

    resume = Resume(
        course_id=course_id,
        level=niveau,
        payload=sortie.donnees,
        sent_payload=sortie.charge_envoyee,
        model=sortie.telemetrie.model,
        prompt_version=sortie.telemetrie.version_prompt,
        temperature=sortie.telemetrie.temperature,
        tokens_in=sortie.telemetrie.tokens_in,
        tokens_out=sortie.telemetrie.tokens_out,
        latency_ms=sortie.telemetrie.latence_ms,
        calls=sortie.telemetrie.appels,
        segment_count=sortie.segments,
        token_types=sortie.types_masques,
    )
    session.add(resume)
    session.commit()
    session.refresh(resume)
    return resume


# --- Module 2 : quiz ----------------------------------------------------------


def generer_quiz(
    session: Session,
    course_id: str,
    owner_id: str,
    nombre: int = 5,
    difficulte: str = "standard",
) -> Quiz:
    cours = cours_de(session, course_id, owner_id)
    sortie = pipeline.generer_quiz(cours.content, nombre, difficulte)
    questions = sortie.donnees["questions"]

    quiz = Quiz(
        course_id=course_id,
        difficulty=difficulte,
        question_count=len(questions),
        payload={"questions": questions},
        sent_payload=sortie.charge_envoyee,
        model=sortie.telemetrie.model,
        prompt_version=sortie.telemetrie.version_prompt,
        temperature=sortie.telemetrie.temperature,
        tokens_in=sortie.telemetrie.tokens_in,
        tokens_out=sortie.telemetrie.tokens_out,
        latency_ms=sortie.telemetrie.latence_ms,
        calls=sortie.telemetrie.appels,
        segment_count=sortie.segments,
    )
    session.add(quiz)
    session.commit()
    session.refresh(quiz)
    return quiz


def corriger_quiz(
    session: Session, quiz_id: str, owner_id: str, reponses: list[int]
) -> dict:
    """Correction cote serveur : la bonne reponse ne descend jamais au navigateur."""
    quiz = session.get(Quiz, quiz_id)
    if quiz is None:
        raise ErreurApplicative("NOT_FOUND", "Quiz introuvable.")
    if quiz.cours.owner_id != owner_id:
        raise ErreurApplicative("FORBIDDEN", "Quiz non accessible.")

    questions = quiz.payload["questions"]

    def choix(index: int) -> int | None:
        return reponses[index] if index < len(reponses) else None

    score = sum(
        1 for i, q in enumerate(questions) if choix(i) == q["correctIndex"]
    )

    tentative = Tentative(
        quiz_id=quiz_id, answers=reponses, score=score, total=len(questions)
    )
    session.add(tentative)
    session.commit()
    session.refresh(tentative)

    return {
        "attempt": tentative,
        "correction": [
            {
                "question": q["question"],
                "chosen": choix(i),
                "correctIndex": q["correctIndex"],
                "correct": choix(i) == q["correctIndex"],
                "explanation": q["explanation"],
                "sourceQuote": q["sourceQuote"],
            }
            for i, q in enumerate(questions)
        ],
    }


# --- Module 3 : tuteur ancre --------------------------------------------------


def _maintenant_utc() -> datetime:
    return datetime.now(timezone.utc)


# --- Conversations du tuteur (20 octobre) ------------------------------------

TITRE_MAX = 80


def _titre(question: str) -> str:
    """La premiere question, sur une ligne, tronquee proprement."""
    une_ligne = " ".join(question.split())
    if len(une_ligne) <= TITRE_MAX:
        return une_ligne
    return une_ligne[: TITRE_MAX - 1].rstrip() + "…"


def _rattacher_orphelins(session: Session, course_id: str) -> None:
    """Regroupe les messages sans conversation dans une conversation sans titre.

    La migration 0007 le fait pour l'existant. Ce garde couvre le cas restant :
    un message ecrit par l'ANCIENNE version de l'API entre la migration et le
    deploiement du nouveau code. Sans lui, ce message ne serait visible dans
    aucune conversation.
    """
    orphelins = session.scalars(
        select(Message)
        .where(Message.course_id == course_id, Message.conversation_id.is_(None))
        .order_by(Message.created_at.asc())
    ).all()
    if not orphelins:
        return
    conversation = Conversation(
        course_id=course_id,
        title=None,
        created_at=orphelins[0].created_at,
        updated_at=orphelins[-1].created_at,
    )
    session.add(conversation)
    session.flush()
    for m in orphelins:
        m.conversation_id = conversation.id
    session.commit()


def conversation_de(session: Session, conversation_id: str, owner_id: str) -> Conversation:
    """La conversation, si elle appartient a un cours de l'etudiant."""
    conversation = session.get(Conversation, conversation_id)
    if conversation is None:
        raise ErreurApplicative("NOT_FOUND", "Conversation introuvable.")
    cours_de(session, conversation.course_id, owner_id)
    return conversation


def lister_conversations(session: Session, course_id: str, owner_id: str) -> list[dict]:
    cours_de(session, course_id, owner_id)
    _rattacher_orphelins(session, course_id)
    lignes = session.execute(
        select(Conversation, func.count(Message.id))
        .outerjoin(Message, Message.conversation_id == Conversation.id)
        .where(Conversation.course_id == course_id)
        .group_by(Conversation.id)
        .order_by(Conversation.updated_at.desc())
    ).all()
    return [
        {
            "id": c.id,
            "title": c.title,
            "created_at": c.created_at,
            "updated_at": c.updated_at,
            "message_count": n,
        }
        for c, n in lignes
    ]


def nouvelle_conversation(session: Session, course_id: str, owner_id: str) -> Conversation:
    cours_de(session, course_id, owner_id)
    conversation = Conversation(course_id=course_id)
    session.add(conversation)
    session.commit()
    session.refresh(conversation)
    return conversation


def messages_de(session: Session, conversation_id: str, owner_id: str) -> list[Message]:
    conversation_de(session, conversation_id, owner_id)
    return list(
        session.scalars(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.asc())
        ).all()
    )


def supprimer_conversation(session: Session, conversation_id: str, owner_id: str) -> None:
    conversation = conversation_de(session, conversation_id, owner_id)
    session.delete(conversation)
    session.commit()


def repondre(
    session: Session,
    course_id: str,
    owner_id: str,
    question: str,
    conversation_id: str | None = None,
) -> Message:
    cours = cours_de(session, course_id, owner_id)

    # Sans conversation designee, la question en ouvre une : un client qui ne
    # connait pas encore les conversations continue de fonctionner.
    if conversation_id is None:
        conversation = Conversation(course_id=course_id)
        session.add(conversation)
        session.flush()
    else:
        conversation = conversation_de(session, conversation_id, owner_id)
        if conversation.course_id != course_id:
            raise ErreurApplicative(
                "VALIDATION_ERROR", "Cette conversation appartient a un autre cours."
            )

    # Contexte conversationnel borne, et desormais limite a CETTE conversation :
    # une question d'une autre conversation ne doit plus orienter la reponse.
    recents = session.scalars(
        select(Message)
        .where(Message.conversation_id == conversation.id)
        .order_by(Message.created_at.desc())
        .limit(6)
    ).all()
    historique = "\n".join(
        f"{'Etudiant' if m.role == 'user' else 'Tuteur'} : {m.content}"
        for m in reversed(recents)
    )

    # La question de l'etudiant est enregistree avant l'appel : si le modele
    # echoue, l'etudiant retrouve son fil intact et peut relancer.
    if not conversation.title:
        conversation.title = _titre(question)
    conversation.updated_at = _maintenant_utc()
    session.add(
        Message(course_id=course_id, conversation_id=conversation.id, role="user", content=question)
    )
    session.commit()

    sortie = pipeline.repondre_question(cours.content, question, historique)
    reponse = sortie.donnees

    message = Message(
        course_id=course_id,
        conversation_id=conversation.id,
        role="assistant",
        content=reponse["answer"],
        sources=reponse["sources"],
        grounded=reponse["grounded"],
        model=sortie.telemetrie.model,
        prompt_version=sortie.telemetrie.version_prompt,
        tokens_in=sortie.telemetrie.tokens_in,
        tokens_out=sortie.telemetrie.tokens_out,
        latency_ms=sortie.telemetrie.latence_ms,
        calls=sortie.telemetrie.appels,
    )
    session.add(message)
    conversation.updated_at = _maintenant_utc()
    session.commit()
    session.refresh(message)
    return message
