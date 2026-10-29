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

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

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
    #: Format de la question (decision 053). Absent = QCM : les quiz anterieurs
    #: et la consigne V3 restent valides tels quels.
    type: Literal["qcm", "vrai_faux", "trous"] = "qcm"
    question: str = Field(min_length=10)
    options: list[Annotated[str, StringConstraints(min_length=1)]] = Field(
        default_factory=list, max_length=4
    )
    correct_index: int | None = Field(default=None, alias="correctIndex", ge=0, le=3)
    #: Texte a trous : la reponse attendue, et d'autres formes acceptables.
    reponse: str | None = Field(default=None, max_length=80)
    variantes: list[str] = Field(default_factory=list, max_length=5)
    explanation: str = Field(min_length=20)
    # L'ancrage du quiz : pas de citation du cours, pas de question.
    source_quote: str = Field(alias="sourceQuote", min_length=10)

    @model_validator(mode="after")
    def _coherente(self) -> "QuestionIA":
        """Chaque format porte exactement ce dont il a besoin, rien d'autre."""
        if self.type == "qcm":
            if len(self.options) != 4 or self.correct_index is None:
                raise ValueError("un QCM a exactement quatre options et un correctIndex")
        elif self.type == "vrai_faux":
            # Les libelles sont fixes ici : « Vrai » puis « Faux », quoi qu'ait
            # ecrit le modele. Seul l'indice compte.
            if self.correct_index not in (0, 1):
                raise ValueError("un vrai/faux a un correctIndex de 0 (Vrai) ou 1 (Faux)")
            self.options = ["Vrai", "Faux"]
        else:
            if "____" not in self.question:
                raise ValueError("un texte a trous contient un blanc « ____ »")
            if not (self.reponse or "").strip():
                raise ValueError("un texte a trous donne sa reponse")
            self.options, self.correct_index = [], None
        return self


class QuizIA(ModeleIA):
    """Module 2 — sortie du quiz."""

    questions: list[QuestionIA] = Field(min_length=1, max_length=20)


class ReponseIA(ModeleIA):
    """Module 3 — sortie du tuteur."""

    answer: str = Field(min_length=1)
    # Faux quand les passages fournis ne permettent pas de repondre.
    grounded: bool
    sources: list[str] = Field(default_factory=list)


class SceneIA(ModeleIA):
    """Une scene de la presentation narree : une diapositive et sa narration."""

    titre: str = Field(min_length=3)
    points: list[Annotated[str, StringConstraints(min_length=3)]] = Field(min_length=1, max_length=4)
    narration: str = Field(min_length=40)
    # L'ancrage, comme pour le quiz : pas de passage du cours, pas de scene.
    citation: str = Field(min_length=10)


class IdeeIA(ModeleIA):
    """Une idee de la carte mentale, ancree dans le cours."""

    idee: str = Field(min_length=2, max_length=90)
    citation: str = Field(min_length=10)


class BrancheIA(IdeeIA):
    """Une branche principale et ses idees secondaires."""

    enfants: list[IdeeIA] = Field(default_factory=list, max_length=5)


class CarteMentaleIA(ModeleIA):
    """Carte mentale du cours (decision 047) : un sujet, des branches, des idees."""

    sujet: str = Field(min_length=3, max_length=90)
    branches: list[BrancheIA] = Field(min_length=3, max_length=7)


class PresentationIA(ModeleIA):
    """Presentation narree du cours (decision 044)."""

    titre: str = Field(min_length=3)
    scenes: list[SceneIA] = Field(min_length=4, max_length=10)


# --- Questions ouvertes (decision 049) ---------------------------------------------


class AttenduIA(ModeleIA):
    """Un point qu'une bonne reponse doit contenir, justifie par le cours."""

    point: str = Field(min_length=5, max_length=240)
    citation: str = Field(min_length=10)


class QuestionOuverteIA(ModeleIA):
    question: str = Field(min_length=10)
    attendus: list[AttenduIA] = Field(min_length=2, max_length=5)
    reponse_modele: str = Field(alias="reponseModele", min_length=40)


class QuestionsOuvertesIA(ModeleIA):
    questions: list[QuestionOuverteIA] = Field(min_length=1, max_length=5)


class ErreurReponseIA(ModeleIA):
    """Une affirmation fausse de l'etudiant, corrigee par le cours."""

    affirmation: str = Field(min_length=3)
    correction: str = Field(min_length=5)
    citation: str = Field(min_length=10)


class CorrectionQuestionIA(ModeleIA):
    #: Un jugement par point attendu, dans l'ordre. La NOTE n'est pas demandee
    #: au modele : le serveur la calcule a partir de ces jugements.
    attendus: list[Literal["acquis", "partiel", "absent"]] = Field(min_length=1, max_length=5)
    erreurs: list[ErreurReponseIA] = Field(default_factory=list, max_length=3)
    commentaire: str = Field(min_length=20)


class CorrectionOuverteIA(ModeleIA):
    corrections: list[CorrectionQuestionIA] = Field(min_length=1, max_length=5)


# --- Traduction (decision 052) -------------------------------------------------------


class TraductionIA(ModeleIA):
    """Une partie du cours, traduite."""

    texte: str = Field(min_length=1)


# --- Glossaire (decision 054) -----------------------------------------------------------


class TermeIA(ModeleIA):
    terme: str = Field(min_length=2, max_length=60)
    definition: str = Field(min_length=20, max_length=400)
    citation: str = Field(min_length=10)


class GlossaireIA(ModeleIA):
    """Glossaire du cours : ses termes cles, chacun defini PAR le cours."""

    termes: list[TermeIA] = Field(min_length=3, max_length=30)
