"""Plans de revision jusqu'a l'examen

Ajoutee le 23 octobre (decision 046). Un plan enregistre les choix de
l'etudiant (date d'examen, cours, temps par jour) et les seances cochees ; le
calendrier est recalcule a chaque lecture.

  - table `revision_plans`, rattachee a l'utilisateur (cascade).

Additive : la version en ligne anterieure ignore la table.

Revision ID: 0011
Revises: 0010
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "revision_plans",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "ownerId",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("examDate", sa.Date(), nullable=False),
        sa.Column("courseIds", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("minutesPerDay", sa.Integer(), nullable=False),
        sa.Column("done", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("createdAt", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_revision_plans_owner", "revision_plans", ["ownerId"])


def downgrade() -> None:
    op.drop_index("ix_revision_plans_owner", table_name="revision_plans")
    op.drop_table("revision_plans")
