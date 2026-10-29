"""
Espace revision : historique des tentatives et progression.

Ce module n'appelle JAMAIS le modele. Tout ce qu'il calcule existe deja en
base : la table `quiz_attempts` enregistre depuis le debut le score, le total,
la date et les reponses donnees — personne ne les affichait.

Consequence pratique : pas de quota consomme, pas de dependance au reseau, et
un developpement qu'on peut eprouver autant qu'on veut.
"""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..models import Quiz
from .questions import est_juste
from .study import cours_de

# Une question ratee une seule fois peut l'etre par inattention. A partir de
# deux, c'est une notion a revoir — c'est le seuil qui rend la liste utile
# plutot que bavarde.
SEUIL_FAIBLESSE = 2

# Au-dela, la courbe devient illisible et l'ancien n'apprend plus rien.
POINTS_COURBE = 12


def _pourcentage(score: int, total: int) -> int:
    return round(score / total * 100) if total else 0


def _quizzes_du_cours(session: Session, course_id: str) -> list[Quiz]:
    """Les quiz du cours, avec leurs tentatives, en une seule requete."""
    return list(
        session.scalars(
            select(Quiz)
            .where(Quiz.course_id == course_id)
            .options(selectinload(Quiz.tentatives))
            .order_by(Quiz.created_at.asc())
        ).all()
    )


def tentatives(session: Session, course_id: str, owner_id: str) -> list[dict]:
    """Historique des tentatives d'un cours, de la plus recente a la plus ancienne."""
    cours_de(session, course_id, owner_id)

    lignes = [
        {
            "id": t.id,
            "quizId": q.id,
            "score": t.score,
            "total": t.total,
            "difficulty": q.difficulty,
            "createdAt": t.created_at,
        }
        for q in _quizzes_du_cours(session, course_id)
        for t in q.tentatives
    ]
    lignes.sort(key=lambda l: l["createdAt"], reverse=True)
    return lignes


def progression(session: Session, course_id: str, owner_id: str) -> dict:
    """
    Synthese de la progression sur un cours.

    Les scores sont ramenes en pourcentage : un quiz de trois questions et un
    quiz de quinze ne se comparent pas autrement.
    """
    cours_de(session, course_id, owner_id)
    quizzes = _quizzes_du_cours(session, course_id)

    # --- Scores, dans l'ordre chronologique ---
    couples = sorted(
        ((t.created_at, _pourcentage(t.score, t.total)) for q in quizzes for t in q.tentatives),
        key=lambda c: c[0],
    )
    scores = [p for _, p in couples]

    # --- Questions ratees plusieurs fois ---
    # On croise les reponses donnees avec la bonne reponse du quiz
    # correspondant. Le regroupement se fait sur l'enonce : la meme notion
    # reformulee d'un quiz a l'autre ne se cumule pas, et c'est assume —
    # regrouper par similarite demanderait un appel au modele.
    echecs: dict[str, int] = defaultdict(int)
    citations: dict[str, str] = {}

    for quiz in quizzes:
        questions = quiz.payload.get("questions", [])
        for tentative in quiz.tentatives:
            reponses = tentative.answers or []
            for i, question in enumerate(questions):
                choisi = reponses[i] if i < len(reponses) else None
                if est_juste(question, choisi):
                    continue
                enonce = question["question"]
                echecs[enonce] += 1
                citations.setdefault(enonce, question.get("sourceQuote", ""))

    faibles = [
        {"question": enonce, "wrongCount": n, "sourceQuote": citations.get(enonce, "")}
        for enonce, n in echecs.items()
        if n >= SEUIL_FAIBLESSE
    ]
    faibles.sort(key=lambda f: (-f["wrongCount"], f["question"]))

    return {
        "attemptCount": len(scores),
        "averageScore": round(sum(scores) / len(scores)) if scores else 0,
        "bestScore": max(scores) if scores else 0,
        "lastScore": scores[-1] if scores else 0,
        "trend": scores[-POINTS_COURBE:],
        "weakQuestions": faibles,
    }
