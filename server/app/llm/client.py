"""
Appel bas niveau au modele.

+-------------------------------------------------------------------------+
|  NE PAS IMPORTER HORS DE app/llm/.                                      |
|                                                                         |
|  La seule entree publique du module est executer_tache(), qui anonymise  |
|  systematiquement. Si ce fichier devient accessible ailleurs, il devient |
|  possible d'appeler le modele sans masquage — et la regle de            |
|  confidentialite n'est plus garantie par la structure, seulement par la  |
|  vigilance. Voir docs/01-architecture.md section 1.                     |
+-------------------------------------------------------------------------+

Le fournisseur est choisi par LLM_PROVIDER. Chacun traduit ses propres
defaillances dans la taxonomie du projet (LLM_TIMEOUT, LLM_QUOTA_EXCEEDED,
LLM_KEY_MISSING, LLM_UNAVAILABLE), de sorte que le reste du code n'a jamais a
savoir qui a repondu.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

from ..config import parametres
from ..errors import ErreurApplicative
from .providers.anthropic import FournisseurAnthropic
from .providers.base import AppelFournisseur, Fournisseur
from .providers.gemini import FournisseurGemini

journal = logging.getLogger("studyai.llm")

FOURNISSEURS = {
    "gemini": FournisseurGemini,
    "anthropic": FournisseurAnthropic,
}

fournisseur: Fournisseur = FOURNISSEURS.get(
    parametres.LLM_PROVIDER, FournisseurGemini
)()  # type: ignore[assignment]


@dataclass(frozen=True)
class ResultatBrut:
    text: str
    tokens_in: int
    tokens_out: int
    latence_ms: int
    model: str
    provider: str


# Attentes croissantes entre deux tentatives, en millisecondes.
ATTENTES = (800, 2500)


def appeler_modele(
    system: str, user: str, temperature: float, max_tokens: int = 2048
) -> ResultatBrut:
    if not parametres.cle_active:
        raise ErreurApplicative(
            "LLM_KEY_MISSING",
            "Le service d'analyse est indisponible : clef d'API absente.",
        )

    depart = time.monotonic()
    appel = AppelFournisseur(
        system=system, user=user, temperature=temperature, max_tokens=max_tokens
    )

    # Reprise sur defaillance TRANSITOIRE uniquement. A ne pas confondre avec la
    # relance d'executer_tache(), qui porte sur une sortie non conforme au
    # schema : celle-ci porte sur le transport. Les fournisseurs repondent
    # regulierement « high demand » (503) aux heures chargees ; sans reprise,
    # une demonstration echouerait une fois sur deux pour une raison qui n'a
    # rien a voir avec le code.
    #
    # On ne reessaie PAS une clef refusee, un modele inexistant, un quota
    # epuise ni un depassement de delai : reessayer ne peut pas aider.
    derniere: ErreurApplicative | None = None

    for tentative in range(len(ATTENTES) + 1):
        try:
            resultat = fournisseur.appeler(appel, parametres.LLM_TIMEOUT_MS)
            return ResultatBrut(
                text=resultat.text,
                tokens_in=resultat.tokens_in,
                tokens_out=resultat.tokens_out,
                latence_ms=int((time.monotonic() - depart) * 1000),
                model=resultat.model,
                provider=fournisseur.nom,
            )
        except ErreurApplicative as erreur:
            if erreur.code != "LLM_UNAVAILABLE":
                raise
            derniere = erreur
            if tentative < len(ATTENTES):
                attente = ATTENTES[tentative]
                journal.warning(
                    "service indisponible, nouvelle tentative dans %d ms", attente
                )
                time.sleep(attente / 1000)

    assert derniere is not None
    raise derniere


# Expose le fournisseur actif pour la telemetrie et le banc d'essai.
nom_fournisseur = fournisseur.nom
