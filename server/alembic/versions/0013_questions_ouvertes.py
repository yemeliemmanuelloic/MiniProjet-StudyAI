"""Questions ouvertes corrigees par l'IA

Ajoutee le 27 octobre (decision 049).

  - table `open_quizzes` : une serie de questions ouvertes sur un cours, avec
    ses points attendus et sa reponse modele (cascade depuis le cours) ;
  - table `open_attempts` : une copie rendue et sa correction (cascade depuis
    la serie).

Additive : la version en ligne anterieure ignore les tables.

Revision ID: 0013
Revises: 0012
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _telemetrie() -> list[sa.Column]:
    return [
        sa.Column("model", sa.String(100), nullable=False),
        sa.Column("promptVersion", sa.String(20), nullable=False),
        sa.Column("tokensIn", sa.Integer(), nullable=True),
        sa.Column("tokensOut", sa.Integer(), nullable=True),
        sa.Column("latencyMs", sa.Integer(), nullable=True),
        sa.Column("calls", sa.Integer(), nullable=True),
        sa.Column("sentPayload", sa.Text(), nullable=False),
        sa.Column("createdAt", sa.DateTime(timezone=True), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "open_quizzes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "courseId",
            sa.String(36),
            sa.ForeignKey("courses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        *_telemetrie(),
    )
    op.create_index("ix_open_quizzes_course_created", "open_quizzes", ["courseId", "createdAt"])
    op.create_table(
        "open_attempts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "openQuizId",
            sa.String(36),
            sa.ForeignKey("open_quizzes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "courseId",
            sa.String(36),
            sa.ForeignKey("courses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("answers", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("correction", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        *_telemetrie(),
    )
    op.create_index("ix_open_attempts_quiz", "open_attempts", ["openQuizId"])


def downgrade() -> None:
    op.drop_index("ix_open_attempts_quiz", table_name="open_attempts")
    op.drop_table("open_attempts")
    op.drop_index("ix_open_quizzes_course_created", table_name="open_quizzes")
    op.drop_table("open_quizzes")
