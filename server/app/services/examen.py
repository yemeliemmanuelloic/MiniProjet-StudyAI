"""
Examen blanc : des questions tirees de plusieurs cours, sous contrainte de temps.

CE QUE CE MODULE AJOUTE AU PRODUIT. La boucle de revision s'arretait a « un
cours, un quiz ». Or avant un examen reel, un etudiant revise plusieurs
chapitres a la fois, et doit savoir s'il tient dans le temps imparti. C'est la
derniere piece manquante entre « generer des questions » et « se preparer ».

AUCUN APPEL AU MODELE, PAR DEFAUT. C'est la propriete la plus interessante de
ce module : les quiz des cours concernes sont deja en base, donc composer un
examen de vingt questions sur quatre cours ne coute rien. L'etudiant peut en
passer dix dans l'heure sans entamer son quota. La generation de questions
manquantes existe, mais elle est **explicitement demandee** (`completer`) et
soumise au plafond de debit — jamais declenchee en silence.

LE TEMPS EST MESURE, PAS IMPOSE. Le serveur fait foi sur la duree ecoulee et
marque une copie rendue en retard, mais il la corrige quand meme. Un outil de
revision n'a aucune raison de punir : l'etudiant veut savoir s'il a depasse,
pas perdre son travail. Le decompte visible, lui, vit dans le navigateur.
"""

from __future__ import annotations

import random
import re
import unicodedata
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..errors import ErreurApplicative
from ..models import Cours, Examen, Quiz
from .segmentation import repartir
from .study import cours_de, generer_quiz

#: Bornes du nombre de questions. En deca, ce n'est pas un examen ; au-dela,
#: la correction devient illisible sur une page.
MIN_QUESTIONS = 5
MAX_QUESTIONS = 40

#: Duree proposee quand l'etudiant n'en choisit pas. Une minute par question
#: est la convention la plus repandue pour un QCM.
SECONDES_PAR_QUESTION = 60

#: Tolerance avant de marquer une copie en retard : le temps du dernier clic et
#: de l'aller-retour reseau. Marquer « en retard » une copie rendue a la
#: seconde pres serait faux, et vexant.
GRACE_S = 5

MAX_COURS = 10


def _cle(question: str) -> str:
    """
    Empreinte souple d'un enonce, pour le dedoublonnage.

    Deux quiz successifs sur le meme cours reposent souvent la meme question a
    la virgule pres. Comparer les chaines brutes les laisserait toutes les deux
    entrer dans l'examen.
    """
    sans_accent = "".join(
        c
        for c in unicodedata.normalize("NFD", question.lower())
        if unicodedata.category(c) != "Mn"
    )
    return " ".join(re.findall(r"[a-z0-9]+", sans_accent))


def _disponibles(session: Session, cours: Cours) -> list[dict]:
    """Toutes les questions deja generees pour ce cours, dedoublonnees."""
    quizzes = session.scalars(
        select(Quiz)
        .where(Quiz.course_id == cours.id)
        .order_by(Quiz.created_at.desc())
    ).all()

    vues: set[str] = set()
    sortie: list[dict] = []
    for quiz in quizzes:
        for question in quiz.payload.get("questions", []):
            cle = _cle(question["question"])
            if cle in vues:
                continue
            vues.add(cle)
            sortie.append(
                {
                    **question,
                    "courseId": cours.id,
                    "courseTitle": cours.title,
                }
            )
    return sortie


def _repartir_reellement(parts: list[int], stocks: list[int]) -> list[int]:
    """
    Ajuste une repartition ideale a ce qui existe vraiment.

    `repartir` donne la part theorique de chaque cours. Un cours qui n'a que
    trois questions ne peut pas en fournir cinq : son deficit est redistribue
    aux cours qui ont du stock. Sans ce second passage, demander vingt
    questions en rendrait quatorze sans explication, alors que les six
    manquantes existaient ailleurs.
    """
    pris = [min(part, stock) for part, stock in zip(parts, stocks)]
    manque = sum(parts) - sum(pris)

    # Tours successifs : a chaque tour on prend au plus une question de plus
    # par cours encore pourvu, ce qui repartit le rattrapage au lieu de le
    # faire porter entierement par le premier cours venu.
    while manque > 0:
        servis = 0
        for i, stock in enumerate(stocks):
            if manque == 0:
                break
            if pris[i] < stock:
                pris[i] += 1
                manque -= 1
                servis += 1
        if servis == 0:
            break  # plus rien nulle part
    return pris


def composer(
    session: Session,
    owner_id: str,
    course_ids: list[str],
    nombre: int,
    duree_s: int | None = None,
    completer: bool = False,
    alea: random.Random | None = None,
) -> Examen:
    """
    Compose un examen blanc a partir des quiz deja generes.

    Si `completer`, un cours sans question en fait generer une serie — ce qui
    coute un appel au modele et doit donc rester un choix explicite.
    """
    alea = alea or random.Random()

    if not course_ids:
        raise ErreurApplicative("VALIDATION_ERROR", "Choisissez au moins un cours.")
    if len(course_ids) > MAX_COURS:
        raise ErreurApplicative(
            "VALIDATION_ERROR", f"Au plus {MAX_COURS} cours par examen."
        )
    if not MIN_QUESTIONS <= nombre <= MAX_QUESTIONS:
        raise ErreurApplicative(
            "VALIDATION_ERROR",
            f"Le nombre de questions doit etre compris entre {MIN_QUESTIONS} "
            f"et {MAX_QUESTIONS}.",
        )

    # L'ordre est fige et les doublons retires : demander deux fois le meme
    # cours lui donnerait deux parts.
    uniques = list(dict.fromkeys(course_ids))
    # cours_de verifie l'appartenance et leve FORBIDDEN sinon.
    cours = [cours_de(session, identifiant, owner_id) for identifiant in uniques]

    avertissements: list[dict] = []
    stocks: list[list[dict]] = []
    for un_cours in cours:
        questions = _disponibles(session, un_cours)
        if not questions and completer:
            generer_quiz(session, un_cours.id, owner_id, nombre=5)
            questions = _disponibles(session, un_cours)
        stocks.append(questions)

    parts = repartir(nombre, len(cours))
    pris = _repartir_reellement(parts, [len(s) for s in stocks])

    choisies: list[dict] = []
    for un_cours, disponibles, part, compte in zip(cours, stocks, parts, pris):
        if compte < part:
            avertissements.append(
                {
                    "courseId": un_cours.id,
                    "courseTitle": un_cours.title,
                    "attendu": part,
                    "obtenu": compte,
                    "raison": (
                        "Aucun quiz n'a encore ete genere pour ce cours."
                        if not disponibles
                        else f"Ce cours ne compte que {len(disponibles)} questions "
                        f"deja generees."
                    ),
                }
            )
        choisies.extend(alea.sample(disponibles, compte))

    if not choisies:
        raise ErreurApplicative(
            "VALIDATION_ERROR",
            "Aucune question disponible. Generez d'abord un quiz sur au moins "
            "un de ces cours, ou cochez « completer automatiquement ».",
            {"cours": [c.title for c in cours]},
        )

    # L'ordre est melange pour que l'examen n'enchaine pas les cours par blocs.
    # Les options de chaque question, elles, ne sont PAS remelangees : elles
    # l'ont deja ete a la generation, et les remelanger ici obligerait a
    # recalculer correctIndex pour un gain nul.
    alea.shuffle(choisies)

    examen = Examen(
        owner_id=owner_id,
        courses=[{"id": c.id, "title": c.title} for c in cours],
        questions=choisies,
        warnings=avertissements,
        duration_s=duree_s or len(choisies) * SECONDES_PAR_QUESTION,
        total=len(choisies),
    )
    session.add(examen)
    session.commit()
    session.refresh(examen)
    return examen


def examen_de(session: Session, exam_id: str, owner_id: str) -> Examen:
    examen = session.get(Examen, exam_id)
    if examen is None:
        raise ErreurApplicative("NOT_FOUND", "Examen introuvable.")
    if examen.owner_id != owner_id:
        raise ErreurApplicative("FORBIDDEN", "Examen non accessible.")
    return examen


def restant_s(examen: Examen) -> int:
    """Secondes restantes, jamais negatives. Le serveur fait foi."""
    debut = examen.started_at
    if debut.tzinfo is None:  # SQLite rend des datetimes naifs
        debut = debut.replace(tzinfo=timezone.utc)
    fin = debut + timedelta(seconds=examen.duration_s)
    return max(0, int((fin - datetime.now(timezone.utc)).total_seconds()))


def rendre(
    session: Session, exam_id: str, owner_id: str, reponses: list[int | None]
) -> dict:
    """
    Corrige la copie. Les bonnes reponses ne descendent qu'ICI, jamais avant.

    Une copie deja rendue ne peut pas l'etre deux fois : sans ce garde-fou, il
    suffirait de renvoyer le formulaire pour corriger ses erreurs apres avoir
    lu le corrige.
    """
    examen = examen_de(session, exam_id, owner_id)

    if examen.submitted_at is not None:
        raise ErreurApplicative(
            "VALIDATION_ERROR",
            "Cet examen a deja ete rendu. Composez-en un nouveau pour recommencer.",
            {"rendu_le": examen.submitted_at.isoformat()},
        )

    questions = examen.questions

    def choix(index: int) -> int | None:
        return reponses[index] if index < len(reponses) else None

    score = sum(
        1 for i, q in enumerate(questions) if choix(i) == q["correctIndex"]
    )

    examen.answers = [choix(i) for i in range(len(questions))]
    examen.score = score
    examen.submitted_at = datetime.now(timezone.utc)
    examen.late = _depasse(examen)
    session.commit()
    session.refresh(examen)

    return {
        "exam": examen,
        "correction": [
            {
                "question": q["question"],
                "options": q["options"],
                "chosen": choix(i),
                "correctIndex": q["correctIndex"],
                "correct": choix(i) == q["correctIndex"],
                "explanation": q["explanation"],
                "sourceQuote": q["sourceQuote"],
                "courseId": q["courseId"],
                "courseTitle": q["courseTitle"],
            }
            for i, q in enumerate(questions)
        ],
        "parCours": _par_cours(questions, choix),
    }


def _depasse(examen: Examen) -> bool:
    debut = examen.started_at
    if debut.tzinfo is None:
        debut = debut.replace(tzinfo=timezone.utc)
    ecoule = (datetime.now(timezone.utc) - debut).total_seconds()
    return ecoule > examen.duration_s + GRACE_S


def _par_cours(questions: list[dict], choix) -> list[dict]:
    """
    Score detaille par cours.

    C'est le chiffre qui sert vraiment : savoir qu'on a 12/20 n'indique pas
    quoi reviser, savoir qu'on a 2/5 sur le chapitre 3 si.
    """
    totaux: dict[str, dict] = {}
    for i, question in enumerate(questions):
        ligne = totaux.setdefault(
            question["courseId"],
            {
                "courseId": question["courseId"],
                "courseTitle": question["courseTitle"],
                "score": 0,
                "total": 0,
            },
        )
        ligne["total"] += 1
        if choix(i) == question["correctIndex"]:
            ligne["score"] += 1
    # Le cours le moins bien reussi en premier : c'est par la qu'il faut
    # reprendre, et c'est donc lui qui doit etre lu en premier.
    return sorted(totaux.values(), key=lambda c: c["score"] / c["total"])


def historique(session: Session, owner_id: str, limite: int = 20) -> list[Examen]:
    return list(
        session.scalars(
            select(Examen)
            .where(Examen.owner_id == owner_id)
            .order_by(Examen.created_at.desc())
            .limit(limite)
        )
    )
