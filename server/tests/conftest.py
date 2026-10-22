"""
Montage des tests de bout en bout.

Deux doublures, et deux seulement :

  - la base : SQLite en memoire au lieu de PostgreSQL. Le schema est le meme,
    cree a partir des memes modeles ;
  - le fournisseur de modele : une fonction qui rend du JSON conforme aux
    schemas, au lieu d'un appel reseau.

Tout le reste est le code de production : les routes, l'authentification,
l'anonymisation, le decoupage, la validation, la persistance. C'est ce qui
rend ces tests utiles — ils echouent si l'une de ces pieces se casse.

Ce que ces tests NE prouvent PAS : que le modele produit de bonnes reponses.
Cela se mesure sur de vrais appels, dans le banc d'essai (AA5), pas ici.
"""

from __future__ import annotations

import json
import os
from collections.abc import Iterator

import pytest

# Renseigne avant tout import de l'application : config.py valide sa
# configuration des le chargement du module.
os.environ.setdefault("DATABASE_URL", "postgresql://essai:essai@localhost:5432/essai")
os.environ.setdefault("DIRECT_URL", "postgresql://essai:essai@localhost:5432/essai")
os.environ.setdefault("JWT_SECRET", "secret-de-test-suffisamment-long")
os.environ.setdefault("GEMINI_API_KEY", "cle-de-test")

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.db import obtenir_session  # noqa: E402
from app.llm import run_task  # noqa: E402
from app.llm.client import ResultatBrut  # noqa: E402
from app.main import application  # noqa: E402
from app.models import Base  # noqa: E402


@pytest.fixture(autouse=True)
def _compteurs_vierges():
    """Le garde-fou de debit vit au niveau du module : sans cela, les tests
    se contamineraient entre eux."""
    from app import debit

    debit.reinitialiser()
    yield
    debit.reinitialiser()


@pytest.fixture
def session_fabrique():
    moteur = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(moteur)
    yield sessionmaker(bind=moteur, autoflush=False, expire_on_commit=False)
    Base.metadata.drop_all(moteur)


@pytest.fixture
def client(session_fabrique) -> Iterator[TestClient]:
    def session_de_test():
        session = session_fabrique()
        try:
            yield session
        finally:
            session.close()

    application.dependency_overrides[obtenir_session] = session_de_test
    with TestClient(application, raise_server_exceptions=False) as essai:
        yield essai
    application.dependency_overrides.clear()


# --- Doublure du fournisseur de modele ---------------------------------------


class FauxModele:
    """
    Rend une reponse conforme au schema attendu, deduite du prompt systeme.

    Garde la trace de chaque appel : c'est ce qui permet de verifier qu'un
    cours long declenche bien plusieurs appels, et qu'aucune donnee
    personnelle ne figure dans ce qui part.
    """

    def __init__(self) -> None:
        self.appels: list[dict[str, str]] = []

    def __call__(
        self, system: str, user: str, temperature: float, max_tokens: int = 2048
    ) -> ResultatBrut:
        self.appels.append({"system": system, "user": user})

        if "assemble une fiche de revision unique" in system:
            charge = self._resume("Fiche fusionnee a partir des resumes partiels. ")
        elif "prepare une fiche de revision" in system:
            charge = self._resume("Resume fidele du contenu fourni. ")
        elif "QCM" in system:
            nombre = 1
            for mot in user.split():
                if mot.isdigit():
                    nombre = int(mot)
                    break
            charge = {"questions": [self._question(i) for i in range(nombre)]}
        else:
            charge = {
                "answer": "Reponse appuyee sur les passages fournis.",
                "grounded": True,
                "sources": ["Extrait du cours cite par le modele."],
            }

        texte = json.dumps(charge, ensure_ascii=False)
        return ResultatBrut(
            text=texte,
            tokens_in=len(user) // 4,
            tokens_out=len(texte) // 4,
            latence_ms=12,
            model="modele-de-test",
            provider="test",
        )

    @staticmethod
    def _resume(prefixe: str) -> dict:
        return {
            "abstract": prefixe * 4,
            "keyPoints": [
                "Premier point cle suffisamment long pour valider.",
                "Deuxieme point cle suffisamment long pour valider.",
                "Troisieme point cle suffisamment long pour valider.",
            ],
            "keywords": ["ordonnancement", "processus"],
            "warnings": [],
        }

    @staticmethod
    def _question(index: int) -> dict:
        return {
            "question": f"Question numero {index + 1} sur le cours ?",
            # Les options portent le numero de leur question. Un vrai quiz
            # ne reutilise pas la meme chaine de reponse d'une question a
            # l'autre ; la doublure le faisait, et deux questions du meme
            # gabarit se retrouvaient avec un enonce proche ET une reponse
            # identique — le profil exact d'un doublon, alors qu'il s'agit de
            # deux questions distinctes.
            "options": [
                f"Option {lettre} de la question {index + 1}"
                for lettre in "ABCD"
            ],
            "correctIndex": index % 4,
            "explanation": "Explication suffisamment longue pour valider le schema.",
            "sourceQuote": "Passage du cours cite mot pour mot.",
        }


def flux_de(double: FauxModele, taille: int = 7):
    """La meme doublure, en diffusion : sa reponse rendue par petits morceaux."""

    def appeler_en_flux(system: str, user: str, temperature: float, max_tokens: int = 2048):
        brut = double(system, user, temperature, max_tokens)
        for i in range(0, len(brut.text), taille):
            yield brut.text[i : i + taille]
        return brut

    return appeler_en_flux


@pytest.fixture
def faux_modele(monkeypatch) -> FauxModele:
    double = FauxModele()
    monkeypatch.setattr(run_task, "appeler_modele", double)
    monkeypatch.setattr(run_task, "appeler_modele_en_flux", flux_de(double))
    return double


# --- Raccourcis ---------------------------------------------------------------


@pytest.fixture
def etudiant(client: TestClient) -> dict[str, str]:
    """Cree un compte et rend l'en-tete d'authentification correspondant."""
    reponse = client.post(
        "/api/auth/register",
        json={"email": "etudiant@exemple.tn", "password": "motdepasse-solide"},
    )
    assert reponse.status_code == 201, reponse.text
    return {"Authorization": f"Bearer {reponse.json()['token']}"}
