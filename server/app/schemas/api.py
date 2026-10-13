"""
Formes des requetes et des reponses de l'API.

Les noms sont en minuscules cote Python et en camelCase cote JSON : la
conversion est automatique (`alias_generator=to_camel`). Le front n'a donc
aucune traduction a faire, et ces modeles alimentent la documentation OpenAPI
publiee sur /docs — qui sert de piece au rapport technique.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field
from pydantic.alias_generators import to_camel


class ModeleApi(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


# --- Entrees ------------------------------------------------------------------


class IdentifiantsEntree(ModeleApi):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class CoursEntree(ModeleApi):
    title: str = Field(min_length=3, max_length=300)
    subject: str | None = Field(default=None, max_length=200)
    content: str = Field(
        min_length=200,
        description="Un cours doit faire au moins 200 caracteres pour etre analysable.",
    )


class ResumeEntree(ModeleApi):
    level: Literal["court", "standard", "detaille"] = "standard"


class QuizEntree(ModeleApi):
    question_count: int = Field(default=5, ge=3, le=20)
    difficulty: Literal["facile", "standard", "difficile"] = "standard"


class CorrectionEntree(ModeleApi):
    # -1 signale une question laissee sans reponse. Le front empeche de
    # soumettre un quiz incomplet, mais l'API ne doit pas refuser une entree
    # qu'elle sait interpreter : elle la compte comme fausse.
    answers: list[int] = Field(min_length=1)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ChatEntree(ModeleApi):
    question: str = Field(min_length=3, max_length=1000)


# --- Sorties ------------------------------------------------------------------


class UtilisateurSortie(ModeleApi):
    id: str
    email: str


class SessionSortie(ModeleApi):
    user: UtilisateurSortie
    token: str


class ComptesSortie(ModeleApi):
    summaries: int
    quizzes: int
    messages: int


class CoursResumeSortie(ModeleApi):
    id: str
    title: str
    subject: str | None
    char_count: int
    created_at: datetime
    # Nom impose par le front, herite du `_count` de Prisma.
    compte: ComptesSortie = Field(serialization_alias="_count")


class CoursSortie(ModeleApi):
    id: str
    title: str
    subject: str | None
    content: str
    char_count: int
    created_at: datetime


class ResumeSortie(ModeleApi):
    id: str
    level: str
    payload: dict[str, Any]
    model: str
    prompt_version: str
    latency_ms: int | None
    segment_count: int
    created_at: datetime


class QuestionPoseeSortie(ModeleApi):
    """Ce que le navigateur recoit : PAS de bonne reponse, PAS d'explication."""

    question: str
    options: list[str]


class QuizPoseSortie(ModeleApi):
    id: str
    question_count: int
    segment_count: int
    questions: list[QuestionPoseeSortie]


class TentativeSortie(ModeleApi):
    id: str
    score: int
    total: int
    created_at: datetime


class LigneCorrectionSortie(ModeleApi):
    question: str
    chosen: int | None
    correct_index: int
    correct: bool
    explanation: str
    source_quote: str


class CorrectionSortie(ModeleApi):
    attempt: TentativeSortie
    correction: list[LigneCorrectionSortie]


class MessageSortie(ModeleApi):
    id: str
    role: str
    content: str
    sources: list[str] | None
    grounded: bool
    latency_ms: int | None
    created_at: datetime


class TentativeResumeSortie(ModeleApi):
    """Une ligne de l'historique des tentatives."""

    id: str
    quiz_id: str
    score: int
    total: int
    difficulty: str
    created_at: datetime


class QuestionFaibleSortie(ModeleApi):
    """Une question ratee plusieurs fois. Pas de bonne reponse ici non plus."""

    question: str
    wrong_count: int
    source_quote: str


class ProgressionSortie(ModeleApi):
    """Synthese de la progression. Scores en pourcentage, pour que des quiz de
    longueurs differentes restent comparables."""

    attempt_count: int
    average_score: int
    best_score: int
    last_score: int
    trend: list[int]
    weak_questions: list[QuestionFaibleSortie]


class ChargeUtileSortie(ModeleApi):
    """Vue de transparence : ce qui a reellement ete transmis au modele."""

    payload: str
    token_map: list[str]


# --- Examen blanc multi-cours -------------------------------------------------


class ExamenEntree(ModeleApi):
    course_ids: list[str] = Field(min_length=1, max_length=10)
    question_count: int = Field(default=20, ge=5, le=40)
    #: Duree en minutes. Absente, le serveur compte une minute par question.
    duration_min: int | None = Field(default=None, ge=1, le=240)
    #: Autorise la generation d'un quiz pour un cours qui n'en a pas.
    #: COUTE UN APPEL AU MODELE : c'est pourquoi la valeur par defaut est faux.
    completer: bool = False


class ReponsesExamenEntree(ModeleApi):
    #: `null` pour une question laissee sans reponse. Le contrat du quiz
    #: n'acceptait que des entiers ; sur un examen chronometre, laisser une
    #: question vide est le cas NORMAL, pas une anomalie.
    answers: list[int | None] = Field(max_length=40)


class CoursDeLExamenSortie(ModeleApi):
    id: str
    title: str


class AvertissementExamenSortie(ModeleApi):
    """Ce que la composition n'a pas pu faire, et pourquoi."""

    course_id: str
    course_title: str
    attendu: int
    obtenu: int
    raison: str


class ExamenPoseSortie(ModeleApi):
    """
    Ce que le navigateur recoit pendant l'epreuve.

    Meme discipline que le quiz : ni bonne reponse, ni explication, ni
    citation. La correction se fait cote serveur, a la remise.
    """

    id: str
    courses: list[CoursDeLExamenSortie]
    questions: list[QuestionPoseeSortie]
    warnings: list[AvertissementExamenSortie]
    total: int
    duration_s: int
    #: Calcule par le serveur, qui fait foi. Le decompte du navigateur n'est
    #: qu'un affichage.
    remaining_s: int
    started_at: datetime
    submitted_at: datetime | None


class ExamenResumeSortie(ModeleApi):
    """Une ligne de l'historique."""

    id: str
    courses: list[CoursDeLExamenSortie]
    total: int
    score: int | None
    duration_s: int
    late: bool
    created_at: datetime
    submitted_at: datetime | None


class LigneCorrectionExamenSortie(ModeleApi):
    question: str
    options: list[str]
    chosen: int | None
    correct_index: int
    correct: bool
    explanation: str
    source_quote: str
    #: Vers quel cours renvoyer l'etudiant. C'est tout l'interet d'un examen
    #: multi-cours : l'erreur doit pointer son support d'origine.
    course_id: str
    course_title: str


class ScoreParCoursSortie(ModeleApi):
    course_id: str
    course_title: str
    score: int
    total: int


class CorrectionExamenSortie(ModeleApi):
    exam: ExamenResumeSortie
    correction: list[LigneCorrectionExamenSortie]
    #: Trie du cours le moins bien reussi au mieux reussi : c'est l'ordre dans
    #: lequel il faut reprendre ses revisions.
    par_cours: list[ScoreParCoursSortie]
