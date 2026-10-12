"""
Configuration Alembic.

L'URL vient de .env, pas de alembic.ini : un mot de passe de base n'a rien a
faire dans un fichier versionne. On utilise DIRECT_URL (pooler de sessions),
parce que le pooler de transactions ne supporte pas le DDL.
"""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.config import parametres
from app.models import Base

configuration = context.config

if configuration.config_file_name is not None:
    fileConfig(configuration.config_file_name)

configuration.set_main_option("sqlalchemy.url", parametres.url_migrations)

cible = Base.metadata


def migrer_hors_ligne() -> None:
    """Produit le SQL sans se connecter : `alembic upgrade head --sql`."""
    context.configure(
        url=configuration.get_main_option("sqlalchemy.url"),
        target_metadata=cible,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        dialect_name="postgresql",
    )
    with context.begin_transaction():
        context.run_migrations()


def migrer_en_ligne() -> None:
    moteur = engine_from_config(
        configuration.get_section(configuration.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with moteur.connect() as connexion:
        context.configure(connection=connexion, target_metadata=cible)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    migrer_hors_ligne()
else:
    migrer_en_ligne()
