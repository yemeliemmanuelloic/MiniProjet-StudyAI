"""
Fournisseur Google Gemini. Niveau gratuit genereux : c'est le fournisseur de
demarrage du projet, avant bascule eventuelle vers Anthropic.

Un avantage notable sur notre cas d'usage : `responseMimeType: application/json`
contraint le modele a produire du JSON, ce qui ameliore mecaniquement le taux
de conformite au schema — une des metriques du banc d'essai.
"""

from __future__ import annotations

import base64
import json

import httpx

from ...config import parametres
from ...errors import ErreurApplicative
from .base import AppelFournisseur, FluxFournisseur, ResultatFournisseur, lignes_sse

RACINE = "https://generativelanguage.googleapis.com/v1beta"


class FournisseurGemini:
    nom = "gemini"

    def __init__(self) -> None:
        self._cle = parametres.GEMINI_API_KEY

    @property
    def disponible(self) -> bool:
        return bool(self._cle)

    def appeler(self, appel: AppelFournisseur, delai_ms: int) -> ResultatFournisseur:
        if not self._cle:
            raise ErreurApplicative(
                "LLM_KEY_MISSING",
                "Le service d'analyse est indisponible : clef Gemini absente.",
            )

        modele = parametres.LLM_MODEL
        corps = {
            "systemInstruction": {"parts": [{"text": appel.system}]},
            "contents": [{"role": "user", "parts": [{"text": appel.user}]}],
            "generationConfig": {
                "temperature": appel.temperature,
                "maxOutputTokens": appel.max_tokens,
                "responseMimeType": "application/json",
            },
        }

        try:
            reponse = httpx.post(
                f"{RACINE}/models/{modele}:generateContent",
                headers={"x-goog-api-key": self._cle, "content-type": "application/json"},
                json=corps,
                timeout=delai_ms / 1000,
            )
        except httpx.TimeoutException as erreur:
            raise ErreurApplicative(
                "LLM_TIMEOUT", "L'analyse a depasse le delai imparti."
            ) from erreur
        except httpx.HTTPError as erreur:
            raise ErreurApplicative(
                "LLM_UNAVAILABLE", "Le service du modele est injoignable."
            ) from erreur

        if reponse.status_code >= 400:
            _traduire_echec(reponse, modele)

        donnees = reponse.json()
        candidats = donnees.get("candidates") or []
        if not candidats:
            # Reponse vide : le plus souvent un filtrage de securite cote
            # fournisseur. Le motif est remonte tel quel, il est diagnostique.
            raise ErreurApplicative(
                "LLM_INVALID_OUTPUT",
                "Le modele n'a produit aucune reponse.",
                {"raison": donnees.get("promptFeedback", {})},
            )

        parties = candidats[0].get("content", {}).get("parts") or []
        texte = "".join(p.get("text", "") for p in parties)
        if not texte:
            raise ErreurApplicative(
                "LLM_INVALID_OUTPUT",
                "Reponse du modele vide.",
                {"finishReason": candidats[0].get("finishReason")},
            )

        usage = donnees.get("usageMetadata", {})
        return ResultatFournisseur(
            text=texte,
            tokens_in=usage.get("promptTokenCount", 0),
            tokens_out=usage.get("candidatesTokenCount", 0),
            model=modele,
        )


    def lire_fichier(
        self, contenu: bytes, type_mime: str, consigne: str, delai_ms: int
    ) -> ResultatFournisseur:
        """
        Fait lire un PDF scanne ou une photo par le modele (decision 043).

        Le fichier est joint tel quel (inline_data, base64) : c'est une
        LECTURE, pas une analyse — la consigne demande de recopier le texte,
        sans resumer ni corriger. Une sortie coupee par la limite de longueur
        est signalee dans le texte lui-meme plutot que tronquee en silence.
        """
        if not self._cle:
            raise ErreurApplicative(
                "LLM_KEY_MISSING",
                "La lecture du document est indisponible : clef Gemini absente.",
            )
        modele = parametres.LLM_MODEL
        corps = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"inline_data": {"mime_type": type_mime, "data": base64.b64encode(contenu).decode()}},
                        {"text": consigne},
                    ],
                }
            ],
            "generationConfig": {"temperature": 0, "maxOutputTokens": 32768},
        }
        try:
            reponse = httpx.post(
                f"{RACINE}/models/{modele}:generateContent",
                headers={"x-goog-api-key": self._cle, "content-type": "application/json"},
                json=corps,
                timeout=delai_ms / 1000,
            )
        except httpx.TimeoutException as erreur:
            raise ErreurApplicative(
                "LLM_TIMEOUT", "La lecture du document a depasse le delai imparti."
            ) from erreur
        except httpx.HTTPError as erreur:
            raise ErreurApplicative(
                "LLM_UNAVAILABLE", "Le service du modele est injoignable."
            ) from erreur

        if reponse.status_code >= 400:
            _traduire_echec(reponse, modele)

        donnees = reponse.json()
        candidats = donnees.get("candidates") or []
        parties = candidats[0].get("content", {}).get("parts") or [] if candidats else []
        texte = "".join(p.get("text", "") for p in parties).strip()
        if not texte:
            raise ErreurApplicative(
                "LLM_INVALID_OUTPUT", "Le modele n'a produit aucun texte pour ce document."
            )
        if candidats and candidats[0].get("finishReason") == "MAX_TOKENS":
            texte += (
                "\n\n[Lecture interrompue : le document depasse la longueur lisible "
                "en une fois. Importez la suite dans un second cours.]"
            )
        usage = donnees.get("usageMetadata", {})
        return ResultatFournisseur(
            text=texte,
            tokens_in=usage.get("promptTokenCount", 0),
            tokens_out=usage.get("candidatesTokenCount", 0),
            model=modele,
        )

    def appeler_en_flux(self, appel: AppelFournisseur, delai_ms: int) -> FluxFournisseur:
        """Meme requete, en Server-Sent Events (`streamGenerateContent?alt=sse`)."""
        if not self._cle:
            raise ErreurApplicative(
                "LLM_KEY_MISSING",
                "Le service d'analyse est indisponible : clef Gemini absente.",
            )
        modele = parametres.LLM_MODEL
        corps = {
            "systemInstruction": {"parts": [{"text": appel.system}]},
            "contents": [{"role": "user", "parts": [{"text": appel.user}]}],
            "generationConfig": {
                "temperature": appel.temperature,
                "maxOutputTokens": appel.max_tokens,
                "responseMimeType": "application/json",
            },
        }
        texte: list[str] = []
        usage: dict = {}
        try:
            with httpx.stream(
                "POST",
                f"{RACINE}/models/{modele}:streamGenerateContent?alt=sse",
                headers={"x-goog-api-key": self._cle, "content-type": "application/json"},
                json=corps,
                timeout=delai_ms / 1000,
            ) as reponse:
                if reponse.status_code >= 400:
                    reponse.read()
                    _traduire_echec(reponse, modele)
                for charge in lignes_sse(reponse.iter_lines()):
                    donnees = json.loads(charge)
                    usage = donnees.get("usageMetadata") or usage
                    for candidat in (donnees.get("candidates") or [])[:1]:
                        for partie in candidat.get("content", {}).get("parts") or []:
                            morceau = partie.get("text", "")
                            if morceau:
                                texte.append(morceau)
                                yield morceau
        except httpx.TimeoutException as erreur:
            raise ErreurApplicative(
                "LLM_TIMEOUT", "L'analyse a depasse le delai imparti."
            ) from erreur
        except httpx.HTTPError as erreur:
            raise ErreurApplicative(
                "LLM_UNAVAILABLE", "Le service du modele est injoignable."
            ) from erreur

        if not texte:
            raise ErreurApplicative("LLM_INVALID_OUTPUT", "Reponse du modele vide.")
        return ResultatFournisseur(
            text="".join(texte),
            tokens_in=usage.get("promptTokenCount", 0),
            tokens_out=usage.get("candidatesTokenCount", 0),
            model=modele,
        )


def _traduire_echec(reponse: httpx.Response, modele: str) -> None:
    """Traduit un echec HTTP dans la taxonomie du projet."""
    statut = reponse.status_code
    detail = reponse.text[:300]

    if statut == 429:
        raise ErreurApplicative("LLM_QUOTA_EXCEEDED", "Quota d'appels atteint.")

    # Un modele retire ou inexistant renvoie 404. Le classer comme clef
    # manquante enverrait chercher un probleme d'authentification alors que la
    # clef est valide — erreur constatee le 1er octobre avec le retrait de
    # gemini-2.0-flash. Le nom du modele est donc remonte explicitement.
    if statut == 404:
        raise ErreurApplicative(
            "LLM_UNAVAILABLE",
            f"Le modele « {modele} » n'est pas disponible chez ce fournisseur.",
            {"model": modele, "provider": "gemini", "detail": detail},
        )

    if statut in (401, 403):
        raise ErreurApplicative(
            "LLM_KEY_MISSING", "Clef d'API refusee par le fournisseur."
        )

    raise ErreurApplicative(
        "LLM_UNAVAILABLE",
        "Le service du modele est indisponible.",
        {"status": statut, "detail": detail},
    )
