"""
Contrat commun a tous les fournisseurs de modele.

Le reste du projet — anonymisation, schemas, prompts, telemetrie, services —
ignore quel fournisseur repond. Changer de fournisseur se fait par la variable
d'environnement LLM_PROVIDER, sans toucher au code.

Cela sert deux besoins reels du projet :
  - demarrer gratuitement sur Gemini, puis basculer sur Claude sans migration ;
  - comparer deux modeles sur le meme corpus pour le banc d'essai (AA5).

Les appels passent par httpx plutot que par les SDK officiels. Trois raisons :
la requete HTTP est visible dans le code, donc explicable en soutenance ; la
traduction des defaillances dans notre taxonomie est entierement maitrisee ;
et le projet depend d'une bibliotheque de moins par fournisseur.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class AppelFournisseur:
    system: str
    user: str
    temperature: float
    max_tokens: int


@dataclass(frozen=True)
class ResultatFournisseur:
    text: str
    tokens_in: int
    tokens_out: int
    # Identifiant exact du modele ayant repondu : enregistre dans la telemetrie.
    model: str


class Fournisseur(Protocol):
    nom: str

    @property
    def disponible(self) -> bool:
        """Faux si la clef est absente : detecte au demarrage, pas au premier appel."""
        ...

    def appeler(self, appel: AppelFournisseur, delai_ms: int) -> ResultatFournisseur: ...
