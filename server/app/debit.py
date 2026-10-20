"""
Limitation de debit : appels au modele, connexions, inscriptions.

POURQUOI, CONCRETEMENT : le palier gratuit de Gemini ne publie plus ses
limites, et un double-clic suffisait a declencher deux generations de quiz.
Dix clics pendant une demonstration, et le quota de la journee est epuise —
au pire moment possible. Le code `RATE_LIMITED` existait dans la taxonomie
depuis le debut sans qu'aucune route ne l'emette.

Quatre garde-fous, ajoutes en deux temps :

  1. par etudiant et par minute, sur toute route qui appelle le modele ;
  2. GLOBAL et par jour, tous comptes confondus (20 octobre) : le premier ne
     protegeait que d'un etudiant a la fois, et quelques comptes suffisaient
     a vider le quota du fournisseur une fois le site en ligne ;
  3. echecs de connexion par adresse (20 octobre) : freine la devinette de
     mot de passe ;
  4. inscriptions par adresse IP et par heure (20 octobre) : freine la
     creation de comptes en serie, seul moyen de contourner le garde-fou 1.

Fenetres glissantes en memoire. Pas de Redis, pas de dependance : le serveur
est unique. Les compteurs ne survivent pas a un redemarrage — c'est accepte :
un abus soutenu maintient precisement le serveur eveille, donc les compteurs
en vie, pendant toute sa duree. Sur plusieurs instances, il faudrait un
magasin partage ; c'est dit dans docs/DECISIONS.md.

Chaque refus est journalise sur le journal `studyai.securite`, sans jamais y
ecrire de mot de passe.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

from fastapi import Depends, Request

from .config import parametres
from .errors import ErreurApplicative
from .security import Authentifie

journal = logging.getLogger("studyai.securite")

_appels: dict[str, deque[float]] = defaultdict(deque)
_echecs: dict[str, deque[float]] = defaultdict(deque)
_inscriptions: dict[str, deque[float]] = defaultdict(deque)
_jour: dict[str, object] = {"date": None, "compte": 0}
_verrou = threading.Lock()


def _purger(horodatages: deque[float], maintenant: float, fenetre: float) -> None:
    while horodatages and maintenant - horodatages[0] > fenetre:
        horodatages.popleft()


def _consommer(identifiant: str, limite: int, fenetre: float) -> tuple[bool, float]:
    """Retourne (autorise, secondes a attendre)."""
    maintenant = time.monotonic()
    with _verrou:
        horodatages = _appels[identifiant]
        _purger(horodatages, maintenant, fenetre)
        if len(horodatages) >= limite:
            return False, fenetre - (maintenant - horodatages[0])
        horodatages.append(maintenant)
        return True, 0.0


def _consommer_jour() -> bool:
    """Compte un appel dans le plafond global du jour (UTC). False si atteint."""
    aujourd_hui = datetime.now(timezone.utc).date()
    with _verrou:
        if _jour["date"] != aujourd_hui:
            _jour["date"] = aujourd_hui
            _jour["compte"] = 0
        if int(_jour["compte"]) >= parametres.MAX_APPELS_MODELE_PAR_JOUR:
            return False
        _jour["compte"] = int(_jour["compte"]) + 1
        return True


def _secondes_avant_minuit_utc() -> int:
    maintenant = datetime.now(timezone.utc)
    demain = (maintenant + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return int((demain - maintenant).total_seconds()) + 1


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
        journal.warning("debit: plafond par minute atteint (utilisateur %s)", identifiant)
        raise ErreurApplicative(
            "RATE_LIMITED",
            f"Trop d'analyses demandees. Reessayez dans {int(attente) + 1} secondes.",
            {"attente_s": int(attente) + 1},
        )
    # Le plafond global n'est consomme qu'une fois le plafond individuel
    # franchi : un etudiant bloque ne doit pas entamer la reserve des autres.
    if not _consommer_jour():
        journal.warning("debit: plafond global du jour atteint")
        raise ErreurApplicative(
            "RATE_LIMITED",
            "Le service a atteint son plafond d'analyses pour aujourd'hui.",
            {"quota_jour": True, "attente_s": _secondes_avant_minuit_utc()},
        )
    return identifiant


# --- Connexion ------------------------------------------------------------


def verifier_connexion_autorisee(email: str) -> None:
    """Refuse la tentative si l'adresse a trop d'echecs recents."""
    fenetre = float(parametres.FENETRE_ECHECS_CONNEXION_S)
    maintenant = time.monotonic()
    with _verrou:
        echecs = _echecs[email]
        _purger(echecs, maintenant, fenetre)
        if len(echecs) >= parametres.MAX_ECHECS_CONNEXION:
            attente = int(fenetre - (maintenant - echecs[0])) + 1
        else:
            return
    journal.warning("connexion: adresse bloquee temporairement (%s)", email)
    raise ErreurApplicative(
        "RATE_LIMITED",
        f"Trop de tentatives de connexion. Reessayez dans {attente} secondes.",
        {"attente_s": attente},
    )


def noter_echec_connexion(email: str) -> None:
    with _verrou:
        _echecs[email].append(time.monotonic())
    journal.warning("connexion: echec pour %s", email)


def oublier_echecs_connexion(email: str) -> None:
    with _verrou:
        _echecs.pop(email, None)


# --- Inscription ----------------------------------------------------------


def adresse_client(requete: Request) -> str:
    """
    Adresse du client. Derriere l'hebergeur, la connexion vient du proxy :
    la vraie adresse est la premiere de X-Forwarded-For. Cet en-tete peut etre
    falsifie par un client direct ; c'est sans consequence ici, le garde-fou
    vise l'accident et l'abus naif, pas l'attaquant determine.
    """
    transmis = requete.headers.get("x-forwarded-for", "")
    if transmis:
        return transmis.split(",")[0].strip()
    return requete.client.host if requete.client else "inconnu"


def limiter_inscriptions(requete: Request) -> None:
    adresse = adresse_client(requete)
    autorise, attente = True, 0.0
    maintenant = time.monotonic()
    with _verrou:
        horodatages = _inscriptions[adresse]
        _purger(horodatages, maintenant, 3600.0)
        if len(horodatages) >= parametres.MAX_INSCRIPTIONS_PAR_HEURE:
            autorise, attente = False, 3600.0 - (maintenant - horodatages[0])
        else:
            horodatages.append(maintenant)
    if not autorise:
        journal.warning("inscription: plafond horaire atteint (adresse %s)", adresse)
        raise ErreurApplicative(
            "RATE_LIMITED",
            f"Trop de comptes crees depuis cette adresse. Reessayez dans {int(attente) + 1} secondes.",
            {"attente_s": int(attente) + 1},
        )


def reinitialiser() -> None:
    """Remet tous les compteurs a zero. Reserve aux tests."""
    with _verrou:
        _appels.clear()
        _echecs.clear()
        _inscriptions.clear()
        _jour["date"] = None
        _jour["compte"] = 0


AppelModele = Depends(limiter_appels_modele)
