"""
Logique metier des trois modules.

Ce service ignore comment l'anonymisation et le decoupage fonctionnent : il
appelle les trois fonctions de app/llm/pipeline.py, qui s'en chargent. C'est ce
qui garantit qu'aucun chemin ne contourne le masquage.
"""

from __future__ import annotations

import hashlib

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..errors import ErreurApplicative
from ..llm import pipeline
from ..models import Cours, Message, Quiz, Resume, Tentative


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

    # Cache : meme cours, meme niveau => pas de nouvel appel. Reduit le cout et
    # stabilise la demonstration. Sur un cours long, l'economie n'est plus
    # marginale : un resume peut representer une vingtaine d'appels.
    existant = session.scalars(
        select(Resume)
        .where(Resume.course_id == course_id, Resume.level == niveau)
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


def repondre(session: Session, course_id: str, owner_id: str, question: str) -> Message:
    cours = cours_de(session, course_id, owner_id)

    # Contexte conversationnel borne : les six derniers messages suffisent et
    # evitent de faire grossir la charge utile a chaque echange.
    recents = session.scalars(
        select(Message)
        .where(Message.course_id == course_id)
        .order_by(Message.created_at.desc())
        .limit(6)
    ).all()
    historique = "\n".join(
        f"{'Etudiant' if m.role == 'user' else 'Tuteur'} : {m.content}"
        for m in reversed(recents)
    )

    # La question de l'etudiant est enregistree avant l'appel : si le modele
    # echoue, l'etudiant retrouve son fil intact et peut relancer.
    session.add(Message(course_id=course_id, role="user", content=question))
    session.commit()

    sortie = pipeline.repondre_question(cours.content, question, historique)
    reponse = sortie.donnees

    message = Message(
        course_id=course_id,
        role="assistant",
        content=reponse["answer"],
        sources=reponse["sources"],
        grounded=reponse["grounded"],
        model=sortie.telemetrie.model,
        prompt_version=sortie.telemetrie.version_prompt,
        tokens_in=sortie.telemetrie.tokens_in,
        tokens_out=sortie.telemetrie.tokens_out,
        latency_ms=sortie.telemetrie.latence_ms,
    )
    session.add(message)
    session.commit()
    session.refresh(message)
    return message
