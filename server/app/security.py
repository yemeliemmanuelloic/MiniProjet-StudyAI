"""
Authentification : mots de passe et jetons.

StudyAI n'a qu'un type d'utilisateur, l'etudiant : pas de role, donc pas de
garde par role. La seule regle d'acces est la propriete, verifiee par le
serveur a chaque requete — un etudiant ne voit que SES cours. Le garde du
front n'est qu'un confort d'affichage.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated

import bcrypt
import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import parametres
from .errors import ErreurApplicative

ALGORITHME = "HS256"

# bcrypt ignore silencieusement ce qui depasse 72 octets. On tronque donc
# explicitement : un comportement silencieux sur un mot de passe est le genre
# de detail qui produit des connexions inexplicables.
LIMITE_BCRYPT = 72


def hacher(mot_de_passe: str) -> str:
    return bcrypt.hashpw(
        mot_de_passe.encode("utf-8")[:LIMITE_BCRYPT], bcrypt.gensalt()
    ).decode("utf-8")


def verifier(mot_de_passe: str, empreinte: str) -> bool:
    try:
        return bcrypt.checkpw(
            mot_de_passe.encode("utf-8")[:LIMITE_BCRYPT], empreinte.encode("utf-8")
        )
    except ValueError:
        # Empreinte corrompue en base : on refuse, on ne plante pas.
        return False


def creer_jeton(identifiant: str) -> str:
    expiration = datetime.now(timezone.utc) + timedelta(
        days=parametres.JWT_JOURS_VALIDITE
    )
    return jwt.encode(
        {"id": identifiant, "exp": expiration},
        parametres.JWT_SECRET,
        algorithm=ALGORITHME,
    )


_porteur = HTTPBearer(auto_error=False)


def utilisateur_courant(
    identifiants: Annotated[HTTPAuthorizationCredentials | None, Depends(_porteur)],
) -> str:
    """Dependance FastAPI : retourne l'identifiant de l'utilisateur authentifie."""
    if identifiants is None:
        raise ErreurApplicative("UNAUTHORIZED", "Authentification requise.")
    try:
        charge = jwt.decode(
            identifiants.credentials, parametres.JWT_SECRET, algorithms=[ALGORITHME]
        )
    except jwt.PyJWTError as erreur:
        raise ErreurApplicative(
            "UNAUTHORIZED", "Session expiree, reconnectez-vous."
        ) from erreur

    identifiant = charge.get("id")
    if not identifiant:
        raise ErreurApplicative("UNAUTHORIZED", "Jeton invalide.")
    return str(identifiant)


Authentifie = Annotated[str, Depends(utilisateur_courant)]
