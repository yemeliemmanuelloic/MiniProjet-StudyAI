"""Cartes mentales des cours

Ajoutee le 23 octobre (decision 047). Une carte mentale est la structure d'un
cours (sujet, branches, idees, citations) produite par le modele ; le
navigateur la dessine.

  - table `mind_maps`, rattachee a un cours (suppression en cascade).

Additive : la version en ligne anterieure ignore la table.

Revision ID: 0012
Revises: 0011
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "mind_maps",
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
    op.create_index("ix_mind_maps_course_created", "mind_maps", ["courseId", "createdAt"])


def downgrade() -> None:
    op.drop_index("ix_mind_maps_course_created", table_name="mind_maps")
    op.drop_table("mind_maps")
