"""Presentations narrees

Ajoutee le 23 octobre (decision 044). Une presentation narree est le script
d'une courte video pedagogique : des scenes (titre, points, narration,
citation du cours) que le navigateur affiche et lit a voix haute. Seul le
script est enregistre, avec la telemetrie habituelle des sorties du modele.

  - table `presentations`, rattachee a un cours (suppression en cascade).

Additive : la version en ligne anterieure ignore la table. La migration peut
donc passer avant le deploiement du code qui s'en sert.

Revision ID: 0009
Revises: 0008
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "presentations",
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
    op.create_index("ix_presentations_course_created", "presentations", ["courseId", "createdAt"])


def downgrade() -> None:
    op.drop_index("ix_presentations_course_created", table_name="presentations")
    op.drop_table("presentations")
