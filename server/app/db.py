"""
Acces a la base.

Choix assume : sessions SQLAlchemy **synchrones**, et des routes FastAPI
declarees avec `def` plutot que `async def`. FastAPI les execute alors dans un
pool de fils d'execution.

Pourquoi ne pas tout passer en asynchrone ? Parce que le pooler de
transactions de Supabase (pgbouncer) interdit les requetes preparees, ce qui
demande une configuration particuliere en asyncpg et produit des pannes
difficiles a diagnostiquer. Le gain de performance serait nul a notre echelle :
quelques etudiants, et un appel au modele de plusieurs secondes qui domine de
toute facon la latence.
"""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from .config import parametres

_url = parametres.url_application

# pgbouncer en mode transaction ne conserve pas l'etat entre deux requetes :
# les requetes preparees cote serveur doivent etre desactivees. Ce reglage est
# propre a psycopg et n'a pas de sens ailleurs — d'ou la condition, qui permet
# aussi de lancer l'application sur SQLite pour une demonstration hors ligne.
_options = {"prepare_threshold": None} if _url.startswith("postgresql") else {}

moteur = create_engine(_url, pool_pre_ping=True, connect_args=_options)

FabriqueSession = sessionmaker(bind=moteur, autoflush=False, expire_on_commit=False)


def obtenir_session() -> Iterator[Session]:
    """Dependance FastAPI : une session par requete, fermee quoi qu'il arrive."""
    session = FabriqueSession()
    try:
        yield session
    finally:
        session.close()
