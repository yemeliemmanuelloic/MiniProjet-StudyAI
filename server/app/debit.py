"""
Limitation de debit sur les routes qui appellent le modele.

POURQUOI, CONCRETEMENT : le palier gratuit de Gemini ne publie plus ses
limites, et un double-clic suffisait a declencher deux generations de quiz.
Dix clics pendant une demonstration, et le quota de la journee est epuise —
au pire moment possible. Le code `RATE_LIMITED` existait dans la taxonomie
depuis le debut sans qu'aucune route ne l'emette.

Fenetre glissante en memoire, par utilisateur. Pas de Redis, pas de
dependance : le serveur est unique et les compteurs n'ont pas besoin de
survivre a un redemarrage. Si le projet se deployait sur plusieurs instances,
il faudrait un magasin partage — c'est dit dans docs/DECISIONS.md.

Ne protege PAS contre un abus determine : un utilisateur peut creer plusieurs
comptes. L'objectif est d'eviter l'accident, pas l'attaque.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import Depends

from .config import parametres
from .errors import ErreurApplicative
from .security import Authentifie

_appels: dict[str, deque[float]] = defaultdict(deque)
_verrou = threading.Lock()


def _consommer(identifiant: str, limite: int, fenetre: float) -> tuple[bool, float]:
    """Retourne (autorise, secondes a attendre)."""
    maintenant = time.monotonic()
    with _verrou:
        horodatages = _appels[identifiant]
        while horodatages and maintenant - horodatages[0] > fenetre:
            horodatages.popleft()
        if len(horodatages) >= limite:
            return False, fenetre - (maintenant - horodatages[0])
        horodatages.append(maintenant)
        return True, 0.0


def limiter_appels_modele(identifiant: Authentifie) -> str:
    """
    Dependance FastAPI a poser sur toute route qui appelle le modele.

    Les routes de lecture ne la portent pas : consulter ses cours ou sa
    progression ne coute rien.
    """
    autorise, attente = _consommer(
        identifiant,
        parametres.MAX_APPELS_MODELE_PAR_MINUTE,
        60.0,
    )
    if not autorise:
        raise ErreurApplicative(
            "RATE_LIMITED",
            f"Trop d'analyses demandees. Reessayez dans {int(attente) + 1} secondes.",
            {"attente_s": int(attente) + 1},
        )
    return identifiant


def reinitialiser() -> None:
    """Remet les compteurs a zero. Reserve aux tests."""
    with _verrou:
        _appels.clear()


AppelModele = Depends(limiter_appels_modele)
