"""Types de jetons reellement masques, par resume

La vue de transparence deduisait les types de donnees personnelles masquees en
cherchant les jetons dans la charge envoyee au modele. Or cette charge contient
le prompt systeme, qui cite [NOM_1], [EMAIL_1], [TEL_1] et [ETABLISSEMENT_1] a
titre d'exemple : ces quatre types s'affichaient donc sur n'importe quel cours,
meme vierge de toute donnee personnelle.

Les types sont desormais enregistres au moment de l'appel, depuis la table des
jetons elle-meme. Une liste vide signifie « aucune donnee personnelle
detectee », et le dit.

Revision ID: 0002
Revises: 0001
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "summaries",
        sa.Column(
            "tokenTypes",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
    )


def downgrade() -> None:
    op.drop_column("summaries", "tokenTypes")
