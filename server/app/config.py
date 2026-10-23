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
    # RELAIS (22 octobre) : fournisseurs essayes dans l'ordre quand le
    # principal sature, epuise son quota ou depasse le delai. Format
    # « fournisseur:modele », separes par des virgules. Un relais sans clef
    # est ignore : la variable peut rester renseignee sans effet.
    # Exemple : LLM_RELAIS=groq:openai/gpt-oss-120b (Llama 3.3 a ete retire
    # par Groq ; liste a jour : GET https://api.groq.com/openai/v1/models).
    LLM_RELAIS: str = ""

    # --- Decoupage des cours ---
    # Un support de cours depasse largement un CV : au-dela d'une certaine
    # taille il est traite par segments plutot que tronque. Voir
    # services/segmentation.py pour le detail et les raisons de ces valeurs.
    MAX_COURSE_CHARS: int = 200_000
    # 24 000 et non 8 000 : le decoupage multiplie les appels, et le palier
    # gratuit de Gemini ne les publie plus. Ce compromis de soutenance est
    # leve le 23 octobre (decision 042) : avec le relais Groq, des segments
    # plus fins donnent des resumes plus detailles, et le tuteur recoit un
    # passage de plus pour un contexte comparable (4 x 16 000 au lieu de
    # 3 x 24 000 caracteres).
    SEGMENT_CHARS: int = 16_000
    SEGMENT_OVERLAP: int = 400
    MAX_SEGMENTS: int = 32
    SEGMENTS_CHAT: int = 4
    SEGMENTS_QUIZ: int = 4

    # --- Garde-fou de debit ---
    # Ne protege pas d'un abus determine : evite l'accident. Quinze analyses
    # par minute couvrent un usage soutenu (resume, quiz et questions
    # enchainees) et arretent encore un double-clic ou une boucle. Releve de
    # 10 le 23 octobre (decision 042).
    MAX_APPELS_MODELE_PAR_MINUTE: int = 15

    # Plafond GLOBAL, tous comptes confondus, par jour (UTC). Le plafond par
    # minute ne protege que d'un etudiant a la fois : plusieurs comptes
    # pouvaient ensemble epuiser le quota gratuit du fournisseur. Au-dela,
    # les fonctions sans IA (cartes, examen blanc, recherche) restent ouvertes.
    # Releve de 400 le 23 octobre (decision 042) : le relais absorbe un quota
    # epuise chez le principal. A ajuster sur les quotas reels des offres
    # retenues au lancement.
    MAX_APPELS_MODELE_PAR_JOUR: int = 1500

    # --- Garde-fous d'authentification ---
    # Echecs de connexion toleres pour une meme adresse avant blocage
    # temporaire, et duree de la fenetre. Freine la devinette de mot de passe.
    MAX_ECHECS_CONNEXION: int = 5
    FENETRE_ECHECS_CONNEXION_S: int = 15 * 60
    # Inscriptions par adresse IP et par heure : freine la creation de comptes
    # en serie, seul moyen de contourner le plafond par etudiant.
    MAX_INSCRIPTIONS_PAR_HEURE: int = 5

    # --- Tarif, pour le tableau de consommation ---
    # EN DOLLARS PAR MILLION DE JETONS. Ces valeurs ne sont PAS une verite du
    # projet : elles viennent d'agregateurs tiers consultes le 13 octobre 2026
    # pour gemini-3.5-flash-lite (0,30 en entree, 2,50 en sortie), et ces
    # agregateurs ne s'accordaient pas entre eux. La page officielle fait foi :
    # https://ai.google.dev/gemini-api/docs/pricing
    #
    # C'est pourquoi le tableau de bord AFFICHE le tarif applique a cote de
    # l'estimation, et parle de « cout estime ». Un chiffre d'argent presente
    # sans sa source est la facon la plus simple de tromper un lecteur de
    # bonne foi — y compris soi-meme.
    PRIX_ENTREE_PAR_MILLION: float = 0.30
    PRIX_SORTIE_PAR_MILLION: float = 2.50
    DEVISE: str = "USD"
    TARIF_SOURCE: str = "agregateurs tiers, 13 octobre 2026 — a verifier"

    # --- Clefs : renseigner uniquement celle du fournisseur actif ---
    GEMINI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    GROQ_API_KEY: str = ""

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
