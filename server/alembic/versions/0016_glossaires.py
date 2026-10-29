"""Glossaires des cours

Ajoutee le 29 octobre (decision 054).

  - table `glossaries`, rattachee a un cours (suppression en cascade).

Additive : la version en ligne anterieure ignore la table.

Revision ID: 0016
Revises: 0015
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "glossaries",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "courseId",
            sa.String(36),
            sa.ForeignKey("courses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("model", sa.String(100), nullable=False),
        sa.Column("promptVersion", sa.String(20), nullable=False),
        sa.Column("tokensIn", sa.Integer(), nullable=True),
        sa.Column("tokensOut", sa.Integer(), nullable=True),
        sa.Column("latencyMs", sa.Integer(), nullable=True),
        sa.Column("calls", sa.Integer(), nullable=True),
        sa.Column("sentPayload", sa.Text(), nullable=False),
        sa.Column("createdAt", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_glossaries_course_created", "glossaries", ["courseId", "createdAt"])


def downgrade() -> None:
    op.drop_index("ix_glossaries_course_created", table_name="glossaries")
    op.drop_table("glossaries")
