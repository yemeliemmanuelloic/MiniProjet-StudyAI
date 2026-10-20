"""Compte : dernieres connexions et version de session

Trois colonnes sur `users`, ajoutees le 20 octobre avec la page « Mon compte ».

  - `lastLoginAt` et `previousLoginAt` : l'heure de la connexion en cours et
    celle d'avant. C'est la PRECEDENTE que l'etudiant voit : « derniere
    connexion le… » sert a reperer une connexion qu'il n'a pas faite, ce que
    l'heure de la session en cours ne dirait jamais.

  - `sessionVersion` : un entier inscrit dans chaque jeton. Changer de mot de
    passe l'incremente, ce qui invalide tous les jetons emis avant — un jeton
    vole ne survit plus a un changement de mot de passe. Sans elle, un jeton
    restait valable ses sept jours quoi qu'il arrive.

Les trois sont sans effet sur une version anterieure du code : deux colonnes
nullables et un entier a valeur par defaut 0, que l'ancien code ignore. La
migration peut donc passer AVANT le deploiement du code qui s'en sert.

Revision ID: 0006
Revises: 0005
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("lastLoginAt", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("previousLoginAt", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "users",
        sa.Column("sessionVersion", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("users", "sessionVersion")
    op.drop_column("users", "previousLoginAt")
    op.drop_column("users", "lastLoginAt")
