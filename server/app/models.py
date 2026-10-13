"""
Modele de donnees — transposition fidele de l'ancien schema Prisma.

Sept tables : l'utilisateur, le cours, et une table par module IA, plus la
table des tentatives de quiz et celle du banc d'essai (AA5).

Les colonnes de telemetrie (model, promptVersion, temperature, tokens,
latence) sont presentes sur chaque sortie de modele : sans elles, le chapitre
d'evaluation du rapport ne reposerait sur rien de mesure.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

# JSONB en production, JSON generique ailleurs. Cette variante n'est pas une
# coquetterie : elle permet d'executer la suite de tests de bout en bout sur
# SQLite, sans base distante ni conteneur. Une chaine de traitement qu'on ne
# peut pas executer en test n'est verifiee par personne.
JsonPortable = JSONB().with_variant(JSON(), "sqlite")


def _identifiant() -> str:
    return str(uuid.uuid4())


def _maintenant() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Utilisateur(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_identifiant)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column("passwordHash", String(255))
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=_maintenant
    )

    cours: Mapped[list["Cours"]] = relationship(
        back_populates="proprietaire", cascade="all, delete-orphan"
    )
    examens: Mapped[list["Examen"]] = relationship(cascade="all, delete-orphan")


class Cours(Base):
    """Un cours importe par l'etudiant : texte colle ou PDF a couche texte."""

    __tablename__ = "courses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_identifiant)
    owner_id: Mapped[str] = mapped_column(
        "ownerId", String(36), ForeignKey("users.id", ondelete="CASCADE")
    )
    title: Mapped[str] = mapped_column(String(300))
    subject: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Contenu brut. Traverse le pipeline d'anonymisation avant tout envoi.
    content: Mapped[str] = mapped_column(Text)
    char_count: Mapped[int] = mapped_column("charCount", Integer)
    # Empreinte du contenu : un cours inchange n'est pas reanalyse.
    hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=_maintenant
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), default=_maintenant, onupdate=_maintenant
    )

    proprietaire: Mapped[Utilisateur] = relationship(back_populates="cours")
    resumes: Mapped[list["Resume"]] = relationship(
        back_populates="cours", cascade="all, delete-orphan"
    )
    quiz: Mapped[list["Quiz"]] = relationship(
        back_populates="cours", cascade="all, delete-orphan"
    )
    messages: Mapped[list["Message"]] = relationship(
        back_populates="cours", cascade="all, delete-orphan"
    )

    __table_args__ = (Index("ix_courses_owner_created", "ownerId", "createdAt"),)


class Resume(Base):
    """Module 1 — resume automatique."""

    __tablename__ = "summaries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_identifiant)
    course_id: Mapped[str] = mapped_column(
        "courseId", String(36), ForeignKey("courses.id", ondelete="CASCADE")
    )
    # Sortie validee : { abstract, keyPoints[], keywords[], warnings[] }
    payload: Mapped[dict] = mapped_column(JsonPortable)
    level: Mapped[str] = mapped_column(String(20), default="standard")

    # --- Telemetrie ---
    model: Mapped[str] = mapped_column(String(100))
    prompt_version: Mapped[str] = mapped_column("promptVersion", String(20))
    temperature: Mapped[float] = mapped_column(Numeric(3, 2))
    tokens_in: Mapped[int | None] = mapped_column("tokensIn", Integer, nullable=True)
    tokens_out: Mapped[int | None] = mapped_column("tokensOut", Integer, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column("latencyMs", Integer, nullable=True)
    sent_payload: Mapped[str] = mapped_column("sentPayload", Text)
    # Nombre de segments traites : 1 = cours court, n = synthese par agregation.
    segment_count: Mapped[int] = mapped_column("segmentCount", Integer, default=1)
    # Types de donnees personnelles masquees dans CE cours. Alimente la vue de
    # transparence : liste vide = aucune donnee personnelle detectee.
    token_types: Mapped[list] = mapped_column("tokenTypes", JsonPortable, default=list)

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=_maintenant
    )

    cours: Mapped[Cours] = relationship(back_populates="resumes")

    __table_args__ = (Index("ix_summaries_course_created", "courseId", "createdAt"),)


class Quiz(Base):
    """Module 2 — quiz a choix multiples genere depuis le cours."""

    __tablename__ = "quizzes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_identifiant)
    course_id: Mapped[str] = mapped_column(
        "courseId", String(36), ForeignKey("courses.id", ondelete="CASCADE")
    )
    payload: Mapped[dict] = mapped_column(JsonPortable)
    question_count: Mapped[int] = mapped_column("questionCount", Integer)
    difficulty: Mapped[str] = mapped_column(String(20), default="standard")

    model: Mapped[str] = mapped_column(String(100))
    prompt_version: Mapped[str] = mapped_column("promptVersion", String(20))
    temperature: Mapped[float] = mapped_column(Numeric(3, 2))
    tokens_in: Mapped[int | None] = mapped_column("tokensIn", Integer, nullable=True)
    tokens_out: Mapped[int | None] = mapped_column("tokensOut", Integer, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column("latencyMs", Integer, nullable=True)
    sent_payload: Mapped[str] = mapped_column("sentPayload", Text)
    segment_count: Mapped[int] = mapped_column("segmentCount", Integer, default=1)

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=_maintenant
    )

    cours: Mapped[Cours] = relationship(back_populates="quiz")
    tentatives: Mapped[list["Tentative"]] = relationship(
        back_populates="quiz", cascade="all, delete-orphan"
    )

    __table_args__ = (Index("ix_quizzes_course_created", "courseId", "createdAt"),)


class Tentative(Base):
    """Une session de revision : les reponses de l'etudiant et son score."""

    __tablename__ = "quiz_attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_identifiant)
    quiz_id: Mapped[str] = mapped_column(
        "quizId", String(36), ForeignKey("quizzes.id", ondelete="CASCADE")
    )
    answers: Mapped[list] = mapped_column(JsonPortable)
    score: Mapped[int] = mapped_column(Integer)
    total: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=_maintenant
    )

    quiz: Mapped[Quiz] = relationship(back_populates="tentatives")

    __table_args__ = (Index("ix_attempts_quiz_created", "quizId", "createdAt"),)


class Message(Base):
    """Module 3 — chatbot ancre sur le cours."""

    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_identifiant)
    course_id: Mapped[str] = mapped_column(
        "courseId", String(36), ForeignKey("courses.id", ondelete="CASCADE")
    )
    role: Mapped[str] = mapped_column(String(20))  # 'user' | 'assistant'
    content: Mapped[str] = mapped_column(Text)
    # Extraits du cours sur lesquels la reponse s'appuie. Vide => hors cours.
    sources: Mapped[list | None] = mapped_column(JsonPortable, nullable=True)
    # Faux quand le modele declare que le cours ne permet pas de repondre.
    grounded: Mapped[bool] = mapped_column(Boolean, default=True)

    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    prompt_version: Mapped[str | None] = mapped_column(
        "promptVersion", String(20), nullable=True
    )
    tokens_in: Mapped[int | None] = mapped_column("tokensIn", Integer, nullable=True)
    tokens_out: Mapped[int | None] = mapped_column("tokensOut", Integer, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column("latencyMs", Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=_maintenant
    )

    cours: Mapped[Cours] = relationship(back_populates="messages")

    __table_args__ = (Index("ix_messages_course_created", "courseId", "createdAt"),)


class Examen(Base):
    """
    Un examen blanc : des questions tirees de PLUSIEURS cours, chronometre.

    POURQUOI UNE TABLE A PART, et pas une simple Tentative multi-quiz. Un
    examen blanc n'appartient a aucun cours : c'est l'etudiant qui en est
    proprietaire, pas un support. Le rattacher a un cours aurait oblige a en
    choisir un arbitrairement, et la suppression de ce cours aurait emporte
    l'examen portant sur les trois autres.

    POURQUOI LES QUESTIONS SONT FIGEES ICI, et non referencees par (quiz, rang).
    C'est une duplication assumee. Un quiz peut etre regenere ou supprime ;
    l'examen passe la semaine derniere doit rester corrigible et relisible tel
    qu'il a ete passe. Un examen dont la correction change apres coup ne vaut
    rien comme trace de revision. La normalisation cede ici devant la
    reproductibilite.

    Chaque question figee porte son cours d'origine (`courseId`, `courseTitle`),
    pour que la correction renvoie l'etudiant au bon support.
    """

    __tablename__ = "exams"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_identifiant)
    owner_id: Mapped[str] = mapped_column(
        "ownerId", String(36), ForeignKey("users.id", ondelete="CASCADE")
    )
    #: Titres des cours au moment de la composition. Conserves pour que
    #: l'historique reste lisible apres la suppression d'un cours.
    courses: Mapped[list] = mapped_column(JsonPortable)
    #: Les questions tirees, avec leur reponse. NE DESCEND JAMAIS en entier
    #: vers le navigateur : voir schemas/api.py.
    questions: Mapped[list] = mapped_column(JsonPortable)
    #: Ce que la composition n'a pas pu faire, et pourquoi.
    warnings: Mapped[list] = mapped_column(JsonPortable, default=list)

    duration_s: Mapped[int] = mapped_column("durationS", Integer)
    started_at: Mapped[datetime] = mapped_column(
        "startedAt", DateTime(timezone=True), default=_maintenant
    )
    submitted_at: Mapped[datetime | None] = mapped_column(
        "submittedAt", DateTime(timezone=True), nullable=True
    )
    answers: Mapped[list | None] = mapped_column(JsonPortable, nullable=True)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total: Mapped[int] = mapped_column(Integer)
    #: Vrai si la copie est arrivee apres la fin du temps imparti. L'examen est
    #: corrige quand meme : voir services/examen.py.
    late: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=_maintenant
    )

    __table_args__ = (Index("ix_exams_owner_created", "ownerId", "createdAt"),)


class EssaiBanc(Base):
    """Support du chapitre d'evaluation (AA5)."""

    __tablename__ = "benchmark_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_identifiant)
    task: Mapped[str] = mapped_column(String(40))  # summarize | quiz | chat
    corpus_version: Mapped[str] = mapped_column("corpusVersion", String(40))
    prompt_version: Mapped[str] = mapped_column("promptVersion", String(20))
    model: Mapped[str] = mapped_column(String(100))
    metrics: Mapped[dict] = mapped_column(JsonPortable)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=_maintenant
    )
