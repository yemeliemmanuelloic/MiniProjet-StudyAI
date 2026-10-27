"""Journal d'activite et objectif hebdomadaire

Ajoutee le 27 octobre (decision 050).

  - table `learning_events` : un geste de revision par ligne (cascade depuis
    l'utilisateur) ;
  - colonne `users.weeklyGoal` : objectif de jours de revision par semaine,
    5 par defaut.

Additive : la version en ligne anterieure ignore la table et la colonne.

Revision ID: 0014
Revises: 0013
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "learning_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "ownerId",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_learning_events_owner_at", "learning_events", ["ownerId", "at"])
    op.add_column(
        "users", sa.Column("weeklyGoal", sa.Integer(), nullable=False, server_default="5")
    )


def downgrade() -> None:
    op.drop_column("users", "weeklyGoal")
    op.drop_index("ix_learning_events_owner_at", table_name="learning_events")
    op.drop_table("learning_events")
