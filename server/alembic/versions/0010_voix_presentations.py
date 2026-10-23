"""Voix naturelle des presentations narrees

Ajoutee le 23 octobre (decision 045). La voix de chaque scene est produite par
la synthese vocale Gemini a la premiere ecoute, encodee en MP3, puis relue
sans appel.

  - table `presentation_voices`, rattachee a une presentation (cascade),
    une ligne par scene.

Additive : la version en ligne anterieure ignore la table.

Revision ID: 0010
Revises: 0009
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "presentation_voices",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "presentationId",
            sa.String(36),
            sa.ForeignKey("presentations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("scene", sa.Integer(), nullable=False),
        sa.Column("audio", sa.LargeBinary(), nullable=False),
        sa.Column("model", sa.String(100), nullable=False),
        sa.Column("latencyMs", sa.Integer(), nullable=True),
        sa.Column("createdAt", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("presentationId", "scene", name="uq_presentation_voices_scene"),
    )


def downgrade() -> None:
    op.drop_table("presentation_voices")
