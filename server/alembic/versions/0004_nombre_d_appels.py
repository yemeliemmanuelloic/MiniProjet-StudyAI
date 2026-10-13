"""Nombre d'appels reellement effectues, par operation

Le pipeline comptait deja les appels (Telemetrie.appels) : un par segment,
plus l'agregation pour un resume long. Ce compte etait JETE au moment
d'enregistrer, et seul segmentCount survivait.

Or segmentCount ne permet pas de le reconstruire. Pour un resume, la formule
serait deductible ; pour un quiz, le nombre d'appels depend aussi du nombre de
questions demande ET de SEGMENTS_QUIZ, un parametre de configuration qui peut
avoir change depuis. Un tableau de consommation calcule sur une formule
fragile afficherait un chiffre faux avec aplomb.

La colonne est NULLABLE et les lignes existantes restent a NULL : elles datent
d'avant ce decompte, et le tableau de bord le dit au lieu de les estimer.

Revision ID: 0004
Revises: 0003
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = ("summaries", "quizzes", "chat_messages")


def upgrade() -> None:
    for table in TABLES:
        op.add_column(table, sa.Column("calls", sa.Integer(), nullable=True))


def downgrade() -> None:
    for table in TABLES:
        op.drop_column(table, "calls")
