"""Cartes de revision espacee

Derniere table du schema, et la moins couteuse : une carte se fabrique a
partir d'une question de quiz DEJA en base — enonce au recto, explication et
citation au verso. Aucun appel au modele n'est emis pour en produire un jeu.

Trois decisions sont inscrites dans le schema lui-meme :

  - CASCADE SUR LE COURS, contrairement a `exams` qui pend de l'etudiant. Un
    examen blanc porte sur plusieurs supports et survit a la suppression de
    l'un d'eux ; une carte appartient a un seul cours, et n'a plus de sens
    sans lui.

  - CONTENU FIGE dans la ligne, meme raison que `exams` : regenerer un quiz
    ne doit pas effacer une carte revisee depuis trois semaines.

  - UNICITE (cours, cle). `cle` est l'enonce normalise. Sans cette contrainte,
    regenerer un quiz sur le meme cours produirait un doublon de chaque carte
    deja en cours de revision, avec deux etats d'avancement concurrents.

`dueLe` est un horodatage mais ne sert qu'a comparer des JOURS : une carte est
due aujourd'hui, pas a 14 h 32. L'index (cours, dueLe) porte la seule requete
chaude, « les cartes a reviser ».

Revision ID: 0005
Revises: 0004
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "flashcards",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("courseId", sa.String(length=36), nullable=False),
        sa.Column("cle", sa.String(length=300), nullable=False),
        sa.Column("recto", sa.Text(), nullable=False),
        sa.Column("verso", sa.Text(), nullable=False),
        sa.Column("explication", sa.Text(), nullable=False),
        sa.Column("citation", sa.Text(), nullable=True),
        sa.Column("facilite", sa.Numeric(precision=4, scale=2), nullable=False),
        sa.Column("intervalle", sa.Integer(), nullable=False),
        sa.Column("repetitions", sa.Integer(), nullable=False),
        sa.Column("dueLe", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revisions", sa.Integer(), nullable=False),
        sa.Column("derniereNote", sa.Integer(), nullable=True),
        sa.Column("createdAt", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["courseId"], ["courses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("courseId", "cle", name="uq_flashcards_course_cle"),
    )
    op.create_index("ix_flashcards_course_due", "flashcards", ["courseId", "dueLe"])


def downgrade() -> None:
    op.drop_index("ix_flashcards_course_due", table_name="flashcards")
    op.drop_table("flashcards")
