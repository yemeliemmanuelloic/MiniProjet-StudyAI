"""Cartes : memoire FSRS

Ajoutee le 22 octobre (decision 040). La repetition espacee passe de SM-2 a
FSRS, qui decrit chaque carte par sa stabilite et sa difficulte, et tient
compte du temps reellement ecoule depuis la derniere revision.

  - `flashcards.stabilite` et `flashcards.difficulte` : la memoire FSRS,
    NULLABLES (nulles pour une carte jamais reussie) ;
  - `flashcards.derniereRevision` : date de la derniere revision, sans
    laquelle le temps ecoule ne peut pas etre calcule ;
  - reprise : chaque carte deja reussie recoit une memoire convertie depuis
    son etat SM-2 (stabilite = intervalle, difficulte d'apres le facteur de
    facilite, derniere revision = echeance moins intervalle). La formule est
    recopiee ici plutot qu'importee : une migration doit rester juste meme si
    le code de l'application change ensuite.

Additive : la version en ligne anterieure ignore les trois colonnes. Les
colonnes SM-2 restent en place, et continuent de servir aux compteurs
(« neuves », « acquises »).

Revision ID: 0008
Revises: 0007
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import timedelta

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("flashcards") as table:
        table.add_column(sa.Column("stabilite", sa.Float(), nullable=True))
        table.add_column(sa.Column("difficulte", sa.Float(), nullable=True))
        table.add_column(
            sa.Column("derniereRevision", sa.DateTime(timezone=True), nullable=True)
        )

    # Reprise des cartes deja reussies. En mode --sql (hors ligne, utilise
    # par la CI), il n'y a pas de donnees a lire : l'etape est sautee.
    if op.get_context().as_sql:
        return
    lien = op.get_bind()
    cartes = sa.table(
        "flashcards",
        sa.column("id", sa.String),
        sa.column("facilite", sa.Numeric),
        sa.column("intervalle", sa.Integer),
        sa.column("repetitions", sa.Integer),
        sa.column("dueLe", sa.DateTime(timezone=True)),
        sa.column("stabilite", sa.Float),
        sa.column("difficulte", sa.Float),
        sa.column("derniereRevision", sa.DateTime(timezone=True)),
    )
    lignes = lien.execute(
        sa.select(
            cartes.c.id,
            cartes.c.facilite,
            cartes.c.intervalle,
            cartes.c.dueLe,
        ).where(cartes.c.repetitions > 0, cartes.c.intervalle > 0)
    ).all()
    for identifiant, facilite, intervalle, echeance in lignes:
        difficulte = min(10.0, max(1.0, 10 - (float(facilite) - 1.3) * (5 / 1.2)))
        lien.execute(
            cartes.update()
            .where(cartes.c.id == identifiant)
            .values(
                stabilite=float(intervalle),
                difficulte=round(difficulte, 4),
                derniereRevision=echeance - timedelta(days=intervalle) if echeance else None,
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("flashcards") as table:
        table.drop_column("derniereRevision")
        table.drop_column("difficulte")
        table.drop_column("stabilite")
