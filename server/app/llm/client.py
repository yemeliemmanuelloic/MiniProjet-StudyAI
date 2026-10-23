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

RELAIS (22 octobre). Un service vendu ne peut pas tomber parce qu'un seul
fournisseur sature : quand le principal echoue pour une raison qui tient au
fournisseur (indisponible, quota, delai), l'appel est rejoue chez le relais
suivant de LLM_RELAIS. La telemetrie enregistre le modele qui a reellement
repondu. Une clef refusee ou une sortie invalide ne declenchent PAS le relais :
la premiere est une erreur de configuration a corriger, la seconde est deja
relancee par executer_tache().
"""

from __future__ import annotations

import logging
import time
from collections.abc import Generator
from dataclasses import dataclass

from ..config import parametres
from ..errors import ErreurApplicative
from .providers.anthropic import FournisseurAnthropic
from .providers.base import AppelFournisseur, Fournisseur
from .providers.gemini import FournisseurGemini
from .providers.groq import FournisseurGroq

journal = logging.getLogger("studyai.llm")

FOURNISSEURS = {
    "gemini": FournisseurGemini,
    "anthropic": FournisseurAnthropic,
}

fournisseur: Fournisseur = FOURNISSEURS.get(
    parametres.LLM_PROVIDER, FournisseurGemini
)()  # type: ignore[assignment]

#: Fournisseurs de relais construisibles a partir d'un nom de modele.
RELAIS_CONNUS = {"groq": FournisseurGroq}

#: Defaillances qui tiennent au fournisseur : un autre peut reussir.
PASSER_AU_RELAIS = {"LLM_UNAVAILABLE", "LLM_QUOTA_EXCEEDED", "LLM_TIMEOUT"}


def relais_configures(texte: str) -> list[Fournisseur]:
    """Lit LLM_RELAIS (« groq:modele, ... »). Ignore les entrees inconnues ou sans clef."""
    chaine: list[Fournisseur] = []
    for entree in (e.strip() for e in texte.split(",")):
        if not entree or ":" not in entree:
            continue
        nom, modele = (p.strip() for p in entree.split(":", 1))
        classe = RELAIS_CONNUS.get(nom)
        if classe is None or not modele:
            journal.warning("relais ignore : %r", entree)
            continue
        candidat = classe(modele)
        if candidat.disponible:
            chaine.append(candidat)
    return chaine


relais: list[Fournisseur] = relais_configures(parametres.LLM_RELAIS)


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
    chaine = ([fournisseur] if parametres.cle_active else []) + relais
    if not chaine:
        raise ErreurApplicative(
            "LLM_KEY_MISSING",
            "Le service d'analyse est indisponible : clef d'API absente.",
        )

    depart = time.monotonic()
    appel = AppelFournisseur(
        system=system, user=user, temperature=temperature, max_tokens=max_tokens
    )

    for rang, courant in enumerate(chaine):
        try:
            return _appeler_avec_reprise(courant, appel, depart)
        except ErreurApplicative as erreur:
            dernier = rang == len(chaine) - 1
            if dernier or erreur.code not in PASSER_AU_RELAIS:
                raise
            journal.warning(
                "%s en echec (%s) : relais vers %s", courant.nom, erreur.code, chaine[rang + 1].nom
            )
    raise AssertionError("chaine de fournisseurs vide")  # inatteignable


def _appeler_avec_reprise(
    courant: Fournisseur, appel: AppelFournisseur, depart: float
) -> ResultatBrut:

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
            resultat = courant.appeler(appel, parametres.LLM_TIMEOUT_MS)
            return ResultatBrut(
                text=resultat.text,
                tokens_in=resultat.tokens_in,
                tokens_out=resultat.tokens_out,
                latence_ms=int((time.monotonic() - depart) * 1000),
                model=resultat.model,
                provider=courant.nom,
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



def appeler_modele_en_flux(
    system: str, user: str, temperature: float, max_tokens: int = 2048
) -> Generator[str, None, ResultatBrut]:
    """
    Comme appeler_modele, mais rend le texte au fur et a mesure (23 octobre).

    Le relais et les reprises ne valent qu'AVANT le premier morceau : une
    fois du texte montre a l'etudiant, on ne peut plus recoller la reponse
    d'un autre fournisseur a sa suite. Un echec en cours de route remonte
    donc tel quel. Un fournisseur qui ne sait pas diffuser repond d'un bloc.
    """
    chaine = ([fournisseur] if parametres.cle_active else []) + relais
    if not chaine:
        raise ErreurApplicative(
            "LLM_KEY_MISSING",
            "Le service d'analyse est indisponible : clef d'API absente.",
        )
    depart = time.monotonic()
    appel = AppelFournisseur(
        system=system, user=user, temperature=temperature, max_tokens=max_tokens
    )

    for rang, courant in enumerate(chaine):
        diffuser = getattr(courant, "appeler_en_flux", None)
        for tentative in range(len(ATTENTES) + 1):
            emis = False
            try:
                if diffuser is None:
                    resultat = courant.appeler(appel, parametres.LLM_TIMEOUT_MS)
                    emis = True
                    yield resultat.text
                else:
                    flux = diffuser(appel, parametres.LLM_TIMEOUT_MS)
                    while True:
                        try:
                            morceau = next(flux)
                        except StopIteration as fin:
                            resultat = fin.value
                            break
                        emis = True
                        yield morceau
                return ResultatBrut(
                    text=resultat.text,
                    tokens_in=resultat.tokens_in,
                    tokens_out=resultat.tokens_out,
                    latence_ms=int((time.monotonic() - depart) * 1000),
                    model=resultat.model,
                    provider=courant.nom,
                )
            except ErreurApplicative as erreur:
                if emis:
                    raise
                if erreur.code == "LLM_UNAVAILABLE" and tentative < len(ATTENTES):
                    time.sleep(ATTENTES[tentative] / 1000)
                    continue
                if rang == len(chaine) - 1 or erreur.code not in PASSER_AU_RELAIS:
                    raise
                journal.warning(
                    "%s en echec (%s) : relais vers %s", courant.nom, erreur.code, chaine[rang + 1].nom
                )
                break
    raise AssertionError("chaine de fournisseurs vide")  # inatteignable


# --- Lecture de fichiers sans texte (decision 043) ---------------------------

#: La consigne de lecture : recopier, jamais resumer ni corriger. Le resume
#: viendra ensuite, du texte obtenu, par le chemin habituel (avec masquage).
CONSIGNE_LECTURE = (
    "Recopie integralement le texte de ce document de cours, dans l'ordre de "
    "lecture, sans resumer, sans corriger, sans rien ajouter. Conserve les "
    "titres, les listes et les tableaux (en lignes separees par des barres "
    "verticales). Si une partie est illisible, ecris [illisible]. Ne reponds "
    "rien d'autre que le texte du document."
)


def transcrire_enregistrement(contenu: bytes, nom_fichier: str) -> ResultatBrut:
    """Transcrit un enregistrement par Whisper chez Groq."""
    transcripteur = FournisseurGroq(parametres.MODELE_TRANSCRIPTION)
    depart = time.monotonic()
    resultat = transcripteur.transcrire(contenu, nom_fichier, parametres.DELAI_LECTURE_MS)
    return ResultatBrut(
        text=resultat.text,
        tokens_in=resultat.tokens_in,
        tokens_out=resultat.tokens_out,
        latence_ms=int((time.monotonic() - depart) * 1000),
        model=resultat.model,
        provider=transcripteur.nom,
    )


def lire_document(contenu: bytes, type_mime: str) -> ResultatBrut:
    """Fait lire un PDF scanne ou une photo par Gemini."""
    lecteur = FournisseurGemini()
    depart = time.monotonic()
    resultat = lecteur.lire_fichier(contenu, type_mime, CONSIGNE_LECTURE, parametres.DELAI_LECTURE_MS)
    return ResultatBrut(
        text=resultat.text,
        tokens_in=resultat.tokens_in,
        tokens_out=resultat.tokens_out,
        latence_ms=int((time.monotonic() - depart) * 1000),
        model=resultat.model,
        provider=lecteur.nom,
    )


def synthetiser_voix(texte: str) -> tuple[bytes, str, str, int]:
    """
    Lit un texte DEJA verifie sans donnee personnelle (voir pipeline.narrer).
    Rend l'audio brut, son type MIME, le modele et la latence en ms.
    """
    lecteur = FournisseurGemini()
    modeles = [m.strip() for m in parametres.MODELE_VOIX.split(",") if m.strip()]
    for rang, modele in enumerate(modeles):
        depart = time.monotonic()
        try:
            audio, type_mime = lecteur.synthetiser(
                texte, parametres.VOIX_NARRATION, modele, parametres.DELAI_VOIX_MS
            )
        except ErreurApplicative as erreur:
            if erreur.code == "LLM_QUOTA_EXCEEDED" and rang < len(modeles) - 1:
                journal.warning("voix: quota atteint pour %s, modele suivant", modele)
                continue
            raise
        return audio, type_mime, modele, int((time.monotonic() - depart) * 1000)
    raise ErreurApplicative("LLM_KEY_MISSING", "Aucun modele de voix n'est configure.")
