"""
Export des donnees d'un etudiant (« telecharger mes donnees »).

POURQUOI. StudyAI met en avant la protection des donnees ; l'etudiant doit
pouvoir recuperer tout ce que l'application conserve sur lui, dans un format
lisible et reutilisable. C'est le droit a la portabilite, au sens du RGPD.

CE QUI EST EXPORTE : le profil, chaque cours avec son texte, ses resumes, ses
quiz et leurs tentatives, la conversation avec le tuteur, les cartes et leur
etat de revision, et les examens blancs.

CE QUI NE L'EST PAS, et pourquoi :
  - l'empreinte du mot de passe : elle ne sert qu'a verifier, et sa fuite
    faciliterait une attaque hors ligne ;
  - `sentPayload`, le texte exact transmis au modele : c'est le cours deja
    exporte, pseudonymise. Le joindre doublerait la taille du fichier sans
    rien apprendre a l'etudiant ;
  - la telemetrie (jetons, latence) : elle decrit le fournisseur, pas
    l'etudiant. Le modele et la version de prompt sont gardes, eux, parce
    qu'ils disent d'ou vient chaque resume.

Aucun appel au modele : une lecture de la base, rien de plus.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..errors import ErreurApplicative
from ..models import Cours, Examen, Utilisateur

FORMAT = "studyai-export-v1"


def _date(valeur: datetime | None) -> str | None:
    return valeur.isoformat() if valeur else None


def exporter(session: Session, owner_id: str) -> dict[str, Any]:
    utilisateur = session.get(Utilisateur, owner_id)
    if utilisateur is None:
        raise ErreurApplicative("UNAUTHORIZED", "Compte introuvable.")

    cours = session.scalars(
        select(Cours).where(Cours.owner_id == owner_id).order_by(Cours.created_at)
    ).all()
    examens = session.scalars(
        select(Examen).where(Examen.owner_id == owner_id).order_by(Examen.created_at)
    ).all()

    return {
        "format": FORMAT,
        "account": {
            "email": utilisateur.email,
            "createdAt": _date(utilisateur.created_at),
            "lastLoginAt": _date(utilisateur.derniere_connexion),
        },
        "courses": [
            {
                "title": c.title,
                "subject": c.subject,
                "createdAt": _date(c.created_at),
                "content": c.content,
                "summaries": [
                    {
                        "level": r.level,
                        "createdAt": _date(r.created_at),
                        "model": r.model,
                        "promptVersion": r.prompt_version,
                        "summary": r.payload,
                    }
                    for r in c.resumes
                ],
                "quizzes": [
                    {
                        "difficulty": q.difficulty,
                        "createdAt": _date(q.created_at),
                        "model": q.model,
                        "promptVersion": q.prompt_version,
                        "questions": q.payload.get("questions", []),
                        "attempts": [
                            {
                                "createdAt": _date(t.created_at),
                                "score": t.score,
                                "total": t.total,
                                "answers": t.answers,
                            }
                            for t in q.tentatives
                        ],
                    }
                    for q in c.quiz
                ],
                "tutorConversation": [
                    {
                        "role": m.role,
                        "createdAt": _date(m.created_at),
                        "content": m.content,
                        "sources": m.sources,
                        "grounded": m.grounded,
                    }
                    for m in sorted(c.messages, key=lambda m: m.created_at)
                ],
                "flashcards": [
                    {
                        "front": k.recto,
                        "back": k.verso,
                        "explanation": k.explication,
                        "quote": k.citation,
                        "dueOn": _date(k.due_le),
                        "intervalDays": k.intervalle,
                        "repetitions": k.repetitions,
                        "reviews": k.revisions,
                    }
                    for k in c.cartes
                ],
            }
            for c in cours
        ],
        "mockExams": [
            {
                "createdAt": _date(e.created_at),
                "submittedAt": _date(e.submitted_at),
                "courses": e.courses,
                "score": e.score,
                "total": e.total,
                "answers": e.answers,
            }
            for e in examens
        ],
    }
