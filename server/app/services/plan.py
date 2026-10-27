"""
Plan de revision jusqu'a l'examen (decision 046).

L'etudiant donne une date d'examen, les cours concernes et le temps dont il
dispose chaque jour. Le plan repartit, jour par jour, les seances utiles :
relire le resume, faire un quiz, reviser ses cartes, passer un examen blanc.

AUCUN APPEL AU MODELE. Le plan est un calcul sur ce que la base sait deja :
les scores de quiz, l'existence d'un resume, les cartes dues. Il est donc
gratuit et RECALCULE A CHAQUE LECTURE : un cours rate revient plus souvent,
un cours maitrise s'espace, sans que l'etudiant ait rien a refaire.

L'algorithme (`construire`) est une fonction pure, sans base ni horloge :
c'est ce qui le rend testable jour par jour.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..errors import ErreurApplicative
from ..models import Carte, Cours, PlanRevision, Quiz, Resume, Tentative
from .activite import noter
from .revision import progression

#: Duree estimee de chaque seance, en minutes.
DUREES = {"resume": 15, "quiz": 15, "cartes": 10, "examen": 30}

#: Ecarts de base entre deux seances d'un meme cours, en jours. Ils
#: s'allongent comme une repetition espacee, et se resserrent pour un cours
#: faible (voir _ecart).
ECARTS = [1, 2, 3, 5, 8]

#: Horizon maximal d'un plan : au-dela, un calendrier jour par jour n'a plus
#: de sens.
JOURS_MAX = 180


@dataclass(frozen=True)
class EtatCours:
    id: str
    titre: str
    #: Score moyen aux quiz, en pourcentage ; `None` si jamais interroge.
    maitrise: int | None
    a_des_cartes: bool


def _poids(c: EtatCours) -> float:
    """De 1 (cours maitrise) a 3 (jamais interroge, ou rate)."""
    if c.maitrise is None:
        return 3.0
    return 1.0 + 2.0 * (1.0 - min(max(c.maitrise, 0), 100) / 100)


def _ecart(etape: int, poids: float) -> int:
    base = ECARTS[min(etape, len(ECARTS) - 1)]
    return max(1, round(base * 2 / poids))


def _tache(jour: date, type_tache: str, cours: EtatCours | None) -> dict:
    return {
        "cle": f"{jour.isoformat()}:{type_tache}:{cours.id if cours else 'tous'}",
        "type": type_tache,
        "courseId": cours.id if cours else None,
        "courseTitle": cours.titre if cours else None,
        "minutes": DUREES[type_tache],
    }


def construire(
    aujourd_hui: date, examen: date, cours: list[EtatCours], minutes_par_jour: int
) -> list[dict]:
    """
    Le calendrier, d'aujourd'hui a la veille de l'examen.

    Chaque jour : les cartes d'abord (courtes, et c'est la repetition espacee
    qui les rend dues), puis les cours dont la prochaine seance est arrivee,
    les plus faibles en premier, tant que le temps du jour le permet. Un
    cours jamais interroge commence par son resume ; ensuite viennent les
    quiz. Trois jours avant, un examen blanc ; la veille, des cartes et le
    resume du cours le plus fragile, sans rien de nouveau.
    """
    jours = [aujourd_hui + timedelta(days=i) for i in range((examen - aujourd_hui).days)]
    if not jours or not cours:
        return []

    poids = {c.id: _poids(c) for c in cours}
    etape = {c.id: 0 if c.maitrise is None else 1 for c in cours}
    prochaine = {c.id: 0 for c in cours}
    avec_cartes = any(c.a_des_cartes for c in cours)
    fragile = max(cours, key=lambda c: (poids[c.id], c.titre))
    n = len(jours)

    calendrier = []
    for i, jour in enumerate(jours):
        taches: list[dict] = []
        reste = minutes_par_jour

        def ajouter(type_tache: str, c: EtatCours | None) -> None:
            nonlocal reste
            taches.append(_tache(jour, type_tache, c))
            reste -= DUREES[type_tache]

        veille = n >= 2 and i == n - 1
        if avec_cartes:
            ajouter("cartes", None)
        if veille:
            ajouter("resume", fragile)
        else:
            if n >= 4 and i == n - 3:
                ajouter("examen", None)
            a_jour = sorted(
                (c for c in cours if prochaine[c.id] <= i),
                key=lambda c: (prochaine[c.id], -poids[c.id], c.titre),
            )
            # Personne n'est du ce jour-la, mais il reste du temps : on avance
            # la seance la plus proche plutot que de laisser une journee vide.
            if not a_jour and not taches:
                a_jour = [min(cours, key=lambda c: (prochaine[c.id], -poids[c.id], c.titre))]
            for c in a_jour:
                if reste < DUREES["quiz"] and taches:
                    break
                ajouter("resume" if etape[c.id] == 0 else "quiz", c)
                prochaine[c.id] = i + _ecart(etape[c.id], poids[c.id])
                etape[c.id] += 1

        calendrier.append(
            {
                "date": jour.isoformat(),
                "taches": taches,
                "minutes": sum(t["minutes"] for t in taches),
            }
        )
    return calendrier


# --- Acces a la base ------------------------------------------------------------


def _date_du_jour(proposee: date | None) -> date:
    """
    La date du jour de l'ETUDIANT. Le navigateur l'envoie, car minuit ne tombe
    pas au meme moment a Tunis et sur le serveur ; un ecart de plus d'un jour
    avec l'horloge du serveur est refuse au profit de cette derniere.
    """
    serveur = datetime.now(timezone.utc).date()
    if proposee and abs((proposee - serveur).days) <= 1:
        return proposee
    return serveur


def _cours_du_plan(session: Session, plan: PlanRevision) -> list[Cours]:
    """Les cours du plan qui existent encore, dans l'ordre du plan."""
    existants = {
        c.id: c
        for c in session.scalars(
            select(Cours).where(Cours.id.in_(plan.course_ids), Cours.owner_id == plan.owner_id)
        )
    }
    return [existants[i] for i in plan.course_ids if i in existants]


def creer(
    session: Session,
    owner_id: str,
    titre: str,
    examen: date,
    course_ids: list[str],
    minutes_par_jour: int,
    aujourd_hui: date | None = None,
) -> PlanRevision:
    jour = _date_du_jour(aujourd_hui)
    if examen <= jour:
        raise ErreurApplicative("VALIDATION_ERROR", "La date de l'examen doit etre a venir.")
    if (examen - jour).days > JOURS_MAX:
        raise ErreurApplicative(
            "VALIDATION_ERROR", f"Un plan couvre au plus {JOURS_MAX} jours."
        )
    uniques = list(dict.fromkeys(course_ids))
    for course_id in uniques:
        cours = session.get(Cours, course_id)
        if cours is None:
            raise ErreurApplicative("NOT_FOUND", "Cours introuvable.")
        if cours.owner_id != owner_id:
            raise ErreurApplicative("FORBIDDEN", "Ce cours ne vous appartient pas.")
    plan = PlanRevision(
        owner_id=owner_id,
        title=titre.strip(),
        exam_date=examen,
        course_ids=uniques,
        minutes_per_day=minutes_par_jour,
        done=[],
    )
    session.add(plan)
    session.commit()
    session.refresh(plan)
    return plan


def plan_de(session: Session, plan_id: str, owner_id: str) -> PlanRevision:
    plan = session.get(PlanRevision, plan_id)
    if plan is None:
        raise ErreurApplicative("NOT_FOUND", "Plan introuvable.")
    if plan.owner_id != owner_id:
        raise ErreurApplicative("FORBIDDEN", "Ce plan ne vous appartient pas.")
    return plan


def lister(session: Session, owner_id: str) -> list[PlanRevision]:
    return list(
        session.scalars(
            select(PlanRevision)
            .where(PlanRevision.owner_id == owner_id)
            .order_by(PlanRevision.exam_date)
        )
    )


def supprimer(session: Session, plan_id: str, owner_id: str) -> None:
    session.delete(plan_de(session, plan_id, owner_id))
    session.commit()


def cocher(session: Session, plan_id: str, owner_id: str, cle: str, fait: bool) -> PlanRevision:
    plan = plan_de(session, plan_id, owner_id)
    faits = [c for c in (plan.done or []) if c != cle]
    if fait:
        faits.append(cle)
    # Les cles des jours passes ne servent plus : on ne garde que les 300
    # dernieres, pour que la ligne ne grossisse pas sans fin.
    plan.done = faits[-300:]
    if fait:
        noter(session, owner_id, "plan")
    session.commit()
    session.refresh(plan)
    return plan


def calendrier(session: Session, plan: PlanRevision, aujourd_hui: date | None = None) -> dict:
    """Le plan, son calendrier recalcule, et ce qui est deja fait aujourd'hui."""
    jour = _date_du_jour(aujourd_hui)
    cours = _cours_du_plan(session, plan)
    etats = []
    for c in cours:
        p = progression(session, c.id, plan.owner_id)
        cartes = session.scalar(select(func.count()).select_from(Carte).where(Carte.course_id == c.id)) or 0
        etats.append(
            EtatCours(
                id=c.id,
                titre=c.title,
                maitrise=p["averageScore"] if p["attemptCount"] else None,
                a_des_cartes=cartes > 0,
            )
        )
    jours = construire(jour, plan.exam_date, etats, plan.minutes_per_day)

    # Coche automatique : un quiz rendu aujourd'hui sur ce cours vaut seance
    # faite, une revision de cartes aussi. L'etudiant n'a pas a cocher ce
    # que la base sait deja.
    debut = datetime.combine(jour, datetime.min.time(), tzinfo=timezone.utc)
    quiz_du_jour = set(
        session.scalars(
            select(Quiz.course_id)
            .join(Tentative, Tentative.quiz_id == Quiz.id)
            .where(Quiz.course_id.in_([c.id for c in cours]), Tentative.created_at >= debut)
        )
    )
    cartes_du_jour = bool(
        session.scalar(
            select(func.count())
            .select_from(Carte)
            .where(
                Carte.course_id.in_([c.id for c in cours]),
                Carte.derniere_revision >= debut,
            )
        )
    )
    faits = set(plan.done or [])
    for j in jours:
        for t in j["taches"]:
            t["fait"] = t["cle"] in faits or (
                j["date"] == jour.isoformat()
                and (
                    (t["type"] == "quiz" and t["courseId"] in quiz_du_jour)
                    or (t["type"] == "cartes" and cartes_du_jour)
                )
            )

    resumes = set(
        session.scalars(select(Resume.course_id).where(Resume.course_id.in_([c.id for c in cours])))
    )
    return {
        "plan": plan,
        "today": jour.isoformat(),
        "daysLeft": (plan.exam_date - jour).days,
        "courses": [
            {
                "id": e.id,
                "title": e.titre,
                "mastery": e.maitrise,
                "hasSummary": e.id in resumes,
                "hasCards": e.a_des_cartes,
            }
            for e in etats
        ],
        "days": jours,
    }
