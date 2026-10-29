"""Traductions de cours

Ajoutee le 29 octobre (decision 052). Une traduction cree un nouveau cours ;
cette table garde la telemetrie des appels.

  - table `translations`, rattachee au cours cree (cascade) et a son cours
    d'origine (mis a NULL si celui-ci est supprime).

Additive : la version en ligne anterieure ignore la table.

Revision ID: 0015
Revises: 0014
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "translations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "courseId",
            sa.String(36),
            sa.ForeignKey("courses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "sourceCourseId",
            sa.String(36),
            sa.ForeignKey("courses.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("language", sa.String(5), nullable=False),
        sa.Column("model", sa.String(100), nullable=False),
        sa.Column("promptVersion", sa.String(20), nullable=False),
        sa.Column("tokensIn", sa.Integer(), nullable=True),
        sa.Column("tokensOut", sa.Integer(), nullable=True),
        sa.Column("latencyMs", sa.Integer(), nullable=True),
        sa.Column("calls", sa.Integer(), nullable=True),
        sa.Column("sentPayload", sa.Text(), nullable=False),
        sa.Column("createdAt", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_translations_course", "translations", ["courseId"])


def downgrade() -> None:
    op.drop_index("ix_translations_course", table_name="translations")
    op.drop_table("translations")
