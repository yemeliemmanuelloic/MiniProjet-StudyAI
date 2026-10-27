"""
Questions ouvertes corrigees par l'IA (decision 049).

Deux appels au modele, et deux seulement :
  - la GENERATION : des questions, leurs points attendus (cites dans le cours)
    et une reponse modele ;
  - la CORRECTION : pour toute la copie a la fois, un jugement par point
    attendu (acquis, partiel, absent), les erreurs relevees et un commentaire.

LA NOTE N'EST PAS DEMANDEE AU MODELE. Une note sur 20 tiree d'un modele
varie d'un appel a l'autre et ne s'explique pas. Elle est calculee ici :
un point acquis vaut 1, un point partiel 1/2, et chaque question pese autant
que les autres. La meme copie recoit donc la meme note, et l'etudiant voit
exactement d'ou elle vient.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..errors import ErreurApplicative
from ..llm import pipeline
from ..models import CopieOuverte, QuestionsOuvertes
from .activite import noter
from .study import cours_de

VALEUR = {"acquis": 1.0, "partiel": 0.5, "absent": 0.0}
LONGUEUR_MAX_REPONSE = 3000


def generer(session: Session, course_id: str, owner_id: str, nombre: int) -> QuestionsOuvertes:
    cours = cours_de(session, course_id, owner_id)
    sortie = pipeline.generer_questions_ouvertes(cours.content, nombre)
    serie = QuestionsOuvertes(
        course_id=course_id,
        payload=sortie.donnees,
        model=sortie.telemetrie.model,
        prompt_version=sortie.telemetrie.version_prompt,
        tokens_in=sortie.telemetrie.tokens_in,
        tokens_out=sortie.telemetrie.tokens_out,
        latency_ms=sortie.telemetrie.latence_ms,
        calls=sortie.telemetrie.appels,
        sent_payload=sortie.charge_envoyee,
    )
    session.add(serie)
    session.commit()
    session.refresh(serie)
    return serie


def derniere(session: Session, course_id: str, owner_id: str) -> QuestionsOuvertes | None:
    cours_de(session, course_id, owner_id)
    return session.scalars(
        select(QuestionsOuvertes)
        .where(QuestionsOuvertes.course_id == course_id)
        .order_by(QuestionsOuvertes.created_at.desc())
        .limit(1)
    ).first()


def serie_de(session: Session, serie_id: str, owner_id: str) -> QuestionsOuvertes:
    serie = session.get(QuestionsOuvertes, serie_id)
    if serie is None:
        raise ErreurApplicative("NOT_FOUND", "Questions introuvables.")
    cours_de(session, serie.course_id, owner_id)
    return serie


def _jugements(brut: list[str], attendus: int) -> list[str]:
    """Exactement un jugement par point attendu : complete par « absent »."""
    propres = [j if j in VALEUR else "absent" for j in brut][:attendus]
    return propres + ["absent"] * (attendus - len(propres))


def note_sur_20(corrections: list[dict]) -> float:
    """Moyenne des questions, chacune au prorata de ses points ; au demi-point."""
    if not corrections:
        return 0.0
    parts = [
        sum(VALEUR[a["etat"]] for a in c["attendus"]) / len(c["attendus"])
        for c in corrections
    ]
    return round(sum(parts) / len(parts) * 40) / 2


def corriger(session: Session, serie_id: str, owner_id: str, reponses: list[str]) -> CopieOuverte:
    serie = serie_de(session, serie_id, owner_id)
    questions = serie.payload["questions"]
    reponses = [(r or "").strip()[:LONGUEUR_MAX_REPONSE] for r in reponses][: len(questions)]
    reponses += [""] * (len(questions) - len(reponses))
    if not any(reponses):
        raise ErreurApplicative(
            "VALIDATION_ERROR", "Repondez a au moins une question avant de rendre la copie."
        )

    sortie = pipeline.corriger_reponses_ouvertes(questions, reponses)
    brutes = sortie.donnees.get("corrections", [])

    corrections = []
    for i, (q, reponse) in enumerate(zip(questions, reponses)):
        c = brutes[i] if i < len(brutes) else {}
        # Une reponse vide ne doit rien obtenir, quoi qu'en dise le modele.
        etats = ["absent"] * len(q["attendus"]) if not reponse else _jugements(c.get("attendus", []), len(q["attendus"]))
        corrections.append(
            {
                "question": q["question"],
                "reponse": reponse,
                "attendus": [
                    {"point": a["point"], "citation": a["citation"], "etat": e}
                    for a, e in zip(q["attendus"], etats)
                ],
                "erreurs": c.get("erreurs", []) if reponse else [],
                "commentaire": c.get("commentaire", "") if reponse else "Aucune reponse.",
                "reponseModele": q["reponseModele"],
            }
        )
    for c in corrections:
        c["note"] = note_sur_20([c])

    copie = CopieOuverte(
        open_quiz_id=serie.id,
        course_id=serie.course_id,
        answers=reponses,
        correction=corrections,
        score=note_sur_20(corrections),
        model=sortie.telemetrie.model,
        prompt_version=sortie.telemetrie.version_prompt,
        tokens_in=sortie.telemetrie.tokens_in,
        tokens_out=sortie.telemetrie.tokens_out,
        latency_ms=sortie.telemetrie.latence_ms,
        calls=sortie.telemetrie.appels,
        sent_payload=sortie.charge_envoyee,
    )
    session.add(copie)
    noter(session, owner_id, "ouvertes")
    session.commit()
    session.refresh(copie)
    return copie
