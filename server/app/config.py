"""
Configuration de l'application, validee au demarrage.

Equivalent Python de l'ancien env.ts : si une variable manque ou est mal
formee, le serveur refuse de demarrer avec un message explicite plutot que
d'echouer plus tard, au milieu d'une demonstration.

Les clefs de modele sont volontairement optionnelles : le serveur doit
pouvoir demarrer sans, pour que l'absence se manifeste par une erreur
LLM_KEY_MISSING propre — c'est un des cas d'erreur exiges par l'enonce.
"""

from __future__ import annotations

import sys
from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import Field, ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict


# Le .env est localise par rapport a CE fichier, et non au repertoire courant :
# le serveur doit se comporter de la meme facon qu'il soit lance depuis
# server/ ou depuis la racine du projet.
FICHIER_ENV = Path(__file__).resolve().parent.parent / ".env"


class Parametres(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=FICHIER_ENV, env_file_encoding="utf-8", extra="ignore"
    )

    # --- Base de donnees ---
    # DATABASE_URL : pooler de transactions (6543), utilise par l'application.
    # DIRECT_URL   : pooler de sessions (5432), utilise par les migrations.
    DATABASE_URL: str = Field(min_length=1)
    DIRECT_URL: str = ""

    # --- Securite ---
    JWT_SECRET: str = Field(min_length=8)
    JWT_JOURS_VALIDITE: int = 7

    # --- Serveur ---
    PORT: int = 3002
    CLIENT_ORIGIN: str = "http://localhost:5174"

    # --- Fournisseur de modele ---
    # Changer de fournisseur = changer ces lignes, plus la clef correspondante.
    # Aucun code a modifier.
    LLM_PROVIDER: Literal["gemini", "anthropic"] = "gemini"
    LLM_MODEL: str = "gemini-3.5-flash-lite"
    LLM_TIMEOUT_MS: int = 30_000

    # --- Decoupage des cours ---
    # Un support de cours depasse largement un CV : au-dela d'une certaine
    # taille il est traite par segments plutot que tronque. Voir
    # services/segmentation.py pour le detail et les raisons de ces valeurs.
    MAX_COURSE_CHARS: int = 200_000
    # 24 000 et non 8 000 : le decoupage multiplie les appels, et le palier
    # gratuit de Gemini ne les publie plus. Des segments plus larges divisent
    # le nombre d'appels par trois sur un cours long, au prix d'un grain de
    # resume un peu moins fin. Arbitrage assume avant la soutenance.
    SEGMENT_CHARS: int = 24_000
    SEGMENT_OVERLAP: int = 400
    MAX_SEGMENTS: int = 24
    SEGMENTS_CHAT: int = 3
    SEGMENTS_QUIZ: int = 4

    # --- Garde-fou de debit ---
    # Ne protege pas d'un abus determine : evite l'accident. Dix analyses par
    # minute laissent largement de quoi faire une demonstration, et arretent
    # un double-clic ou une boucle avant qu'ils n'epuisent le quota du jour.
    MAX_APPELS_MODELE_PAR_MINUTE: int = 10

    # --- Clefs : renseigner uniquement celle du fournisseur actif ---
    GEMINI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""

    @property
    def cle_active(self) -> str:
        """Clef du fournisseur courant, chaine vide si absente."""
        if self.LLM_PROVIDER == "anthropic":
            return self.ANTHROPIC_API_KEY
        return self.GEMINI_API_KEY

    @property
    def url_application(self) -> str:
        return _url_sqlalchemy(self.DATABASE_URL)

    @property
    def url_migrations(self) -> str:
        return _url_sqlalchemy(self.DIRECT_URL or self.DATABASE_URL)


def _url_sqlalchemy(url: str) -> str:
    """
    Adapte une URL Supabase a SQLAlchemy + psycopg 3.

    Deux corrections necessaires, toutes deux constatees a l'usage :
      - le schema `postgresql://` doit devenir `postgresql+psycopg://`, sinon
        SQLAlchemy cherche psycopg2, qui n'est pas installe ;
      - le parametre `pgbouncer=true` que Supabase met dans l'URL est propre a
        Prisma. libpq ne le connait pas et refuse la connexion : on le retire.
    """
    morceaux = urlsplit(url) if url else None
    if morceaux is None:
        return url

    # Base SQLite locale (demonstration hors ligne) : on resout le chemin par
    # rapport au dossier server/, comme le .env, pour que le fichier soit
    # toujours le meme quel que soit le repertoire de lancement.
    if morceaux.scheme == "sqlite":
        chemin = url.removeprefix("sqlite:///")
        if chemin and not Path(chemin).is_absolute():
            return f"sqlite:///{(FICHIER_ENV.parent / chemin).resolve()}"
        return url

    # Rien a adapter pour les autres moteurs : la reconstruction d'URL
    # ci-dessous est specifique a PostgreSQL.
    if morceaux.scheme not in {"postgres", "postgresql"}:
        return url

    schema = "postgresql+psycopg"
    requete = [(c, v) for c, v in parse_qsl(morceaux.query) if c != "pgbouncer"]
    return urlunsplit(
        (schema, morceaux.netloc, morceaux.path, urlencode(requete), morceaux.fragment)
    )


@lru_cache
def obtenir_parametres() -> Parametres:
    try:
        return Parametres()  # type: ignore[call-arg]
    except ValidationError as erreur:
        manquantes = ", ".join(str(e["loc"][0]) for e in erreur.errors())
        print(
            f"Configuration invalide. Variables en cause : {manquantes}\n"
            "Copiez server/.env.example vers server/.env et completez-le.",
            file=sys.stderr,
        )
        raise SystemExit(1) from erreur


parametres = obtenir_parametres()
