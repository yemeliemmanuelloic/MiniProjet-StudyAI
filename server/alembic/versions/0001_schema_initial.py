"""Schema initial de StudyAI

Sept tables : utilisateurs, cours, et une table par module IA (resume, quiz,
tuteur), plus les tentatives de quiz et le banc d'essai.

Les noms de colonnes sont en camelCase parce qu'ils reprennent exactement ceux
du schema Prisma de la version precedente : une base deja migree reste donc
lisible par les deux implementations, ce qui a permis de comparer les sorties.

Revision ID: 0001
Revises:
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("passwordHash", sa.String(length=255), nullable=False),
        sa.Column("createdAt", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    op.create_table(
        "courses",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("ownerId", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("subject", sa.String(length=200), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("charCount", sa.Integer(), nullable=False),
        sa.Column("hash", sa.String(length=64), nullable=False),
        sa.Column("createdAt", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updatedAt", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["ownerId"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_courses_owner_created", "courses", ["ownerId", "createdAt"], unique=False
    )

    op.create_table(
        "summaries",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("courseId", sa.String(length=36), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("level", sa.String(length=20), nullable=False),
        sa.Column("model", sa.String(length=100), nullable=False),
        sa.Column("promptVersion", sa.String(length=20), nullable=False),
        sa.Column("temperature", sa.Numeric(precision=3, scale=2), nullable=False),
        sa.Column("tokensIn", sa.Integer(), nullable=True),
        sa.Column("tokensOut", sa.Integer(), nullable=True),
        sa.Column("latencyMs", sa.Integer(), nullable=True),
        sa.Column("sentPayload", sa.Text(), nullable=False),
        sa.Column("segmentCount", sa.Integer(), nullable=False),
        sa.Column("createdAt", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["courseId"], ["courses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_summaries_course_created", "summaries", ["courseId", "createdAt"], unique=False
    )

    op.create_table(
        "quizzes",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("courseId", sa.String(length=36), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("questionCount", sa.Integer(), nullable=False),
        sa.Column("difficulty", sa.String(length=20), nullable=False),
        sa.Column("model", sa.String(length=100), nullable=False),
        sa.Column("promptVersion", sa.String(length=20), nullable=False),
        sa.Column("temperature", sa.Numeric(precision=3, scale=2), nullable=False),
        sa.Column("tokensIn", sa.Integer(), nullable=True),
        sa.Column("tokensOut", sa.Integer(), nullable=True),
        sa.Column("latencyMs", sa.Integer(), nullable=True),
        sa.Column("sentPayload", sa.Text(), nullable=False),
        sa.Column("segmentCount", sa.Integer(), nullable=False),
        sa.Column("createdAt", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["courseId"], ["courses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_quizzes_course_created", "quizzes", ["courseId", "createdAt"], unique=False
    )

    op.create_table(
        "quiz_attempts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("quizId", sa.String(length=36), nullable=False),
        sa.Column("answers", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("total", sa.Integer(), nullable=False),
        sa.Column("createdAt", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["quizId"], ["quizzes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_attempts_quiz_created", "quiz_attempts", ["quizId", "createdAt"], unique=False
    )

    op.create_table(
        "chat_messages",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("courseId", sa.String(length=36), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("sources", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("grounded", sa.Boolean(), nullable=False),
        sa.Column("model", sa.String(length=100), nullable=True),
        sa.Column("promptVersion", sa.String(length=20), nullable=True),
        sa.Column("tokensIn", sa.Integer(), nullable=True),
        sa.Column("tokensOut", sa.Integer(), nullable=True),
        sa.Column("latencyMs", sa.Integer(), nullable=True),
        sa.Column("createdAt", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["courseId"], ["courses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_messages_course_created",
        "chat_messages",
        ["courseId", "createdAt"],
        unique=False,
    )

    op.create_table(
        "benchmark_runs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("task", sa.String(length=40), nullable=False),
        sa.Column("corpusVersion", sa.String(length=40), nullable=False),
        sa.Column("promptVersion", sa.String(length=20), nullable=False),
        sa.Column("model", sa.String(length=100), nullable=False),
        sa.Column("metrics", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("createdAt", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("benchmark_runs")
    op.drop_table("chat_messages")
    op.drop_table("quiz_attempts")
    op.drop_table("quizzes")
    op.drop_table("summaries")
    op.drop_table("courses")
    op.drop_table("users")
