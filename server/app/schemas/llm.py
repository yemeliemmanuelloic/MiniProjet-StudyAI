"""
Schemas de sortie des modules IA.

Regle centrale du projet : **ce qui ne valide pas n'existe pas**. Une reponse
du modele qui ne respecte pas exactement ces formes n'est jamais stockee ni
affichee — elle declenche une relance, puis une erreur LLM_INVALID_OUTPUT.

Les champs portent un nom Python en minuscules et un alias en camelCase :
l'alias est ce que le modele produit et ce que le navigateur recoit, le nom
Python est ce que le code manipule. Les deux restent donc lisibles sans
traduction mentale.
"""

from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

PhraseCle = Annotated[str, StringConstraints(min_length=10)]
MotCle = Annotated[str, StringConstraints(min_length=2)]


class ModeleIA(BaseModel):
    # `extra="ignore"` : un modele ajoute parfois un champ de son cru. On ne
    # rejette pas pour si peu, on l'ignore.
    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class ResumeIA(ModeleIA):
    """Module 1 — sortie du resume."""

    abstract: str = Field(min_length=80)
    key_points: list[PhraseCle] = Field(alias="keyPoints", min_length=3, max_length=12)
    keywords: list[MotCle] = Field(default_factory=list, max_length=15)
    warnings: list[str] = Field(default_factory=list)


class QuestionIA(ModeleIA):
    question: str = Field(min_length=10)
    options: list[Annotated[str, StringConstraints(min_length=1)]] = Field(
        min_length=4, max_length=4
    )
    correct_index: int = Field(alias="correctIndex", ge=0, le=3)
    explanation: str = Field(min_length=20)
    # L'ancrage du quiz : pas de citation du cours, pas de question.
    source_quote: str = Field(alias="sourceQuote", min_length=10)


class QuizIA(ModeleIA):
    """Module 2 — sortie du quiz."""

    questions: list[QuestionIA] = Field(min_length=1, max_length=20)


class ReponseIA(ModeleIA):
    """Module 3 — sortie du tuteur."""

    answer: str = Field(min_length=1)
    # Faux quand les passages fournis ne permettent pas de repondre.
    grounded: bool
    sources: list[str] = Field(default_factory=list)
