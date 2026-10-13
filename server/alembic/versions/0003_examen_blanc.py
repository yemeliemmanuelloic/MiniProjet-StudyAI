"""Examen blanc multi-cours

La boucle de revision s'arretait a « un cours, un quiz ». Avant un examen reel,
un etudiant revise plusieurs chapitres a la fois, et sous contrainte de temps.

La table `exams` n'est rattachee a aucun cours mais a l'etudiant : un examen
blanc porte sur plusieurs supports, et la suppression de l'un d'eux ne doit pas
emporter l'examen qui portait aussi sur les trois autres.

Les questions sont FIGEES dans la ligne plutot que referencees par (quiz, rang).
Duplication assumee : un quiz peut etre regenere, et un examen deja passe doit
rester corrigible exactement tel qu'il a ete passe.

Revision ID: 0003
Revises: 0002
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "exams",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("ownerId", sa.String(length=36), nullable=False),
        sa.Column("courses", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("questions", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("warnings", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("durationS", sa.Integer(), nullable=False),
        sa.Column("startedAt", sa.DateTime(timezone=True), nullable=False),
        sa.Column("submittedAt", sa.DateTime(timezone=True), nullable=True),
        sa.Column("answers", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column("total", sa.Integer(), nullable=False),
        sa.Column("late", sa.Boolean(), nullable=False),
        sa.Column("createdAt", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["ownerId"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_exams_owner_created", "exams", ["ownerId", "createdAt"])


def downgrade() -> None:
    op.drop_index("ix_exams_owner_created", table_name="exams")
    op.drop_table("exams")
