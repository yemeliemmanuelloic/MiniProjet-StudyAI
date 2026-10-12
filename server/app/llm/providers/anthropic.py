"""Fournisseur Anthropic (Claude). Necessite un solde sur console.anthropic.com."""

from __future__ import annotations

import httpx

from ...config import parametres
from ...errors import ErreurApplicative
from .base import AppelFournisseur, ResultatFournisseur

RACINE = "https://api.anthropic.com/v1/messages"
VERSION_API = "2023-06-01"


class FournisseurAnthropic:
    nom = "anthropic"

    def __init__(self) -> None:
        self._cle = parametres.ANTHROPIC_API_KEY

    @property
    def disponible(self) -> bool:
        return bool(self._cle)

    def appeler(self, appel: AppelFournisseur, delai_ms: int) -> ResultatFournisseur:
        if not self._cle:
            raise ErreurApplicative(
                "LLM_KEY_MISSING",
                "Le service d'analyse est indisponible : clef Anthropic absente.",
            )

        modele = parametres.LLM_MODEL
        try:
            reponse = httpx.post(
                RACINE,
                headers={
                    "x-api-key": self._cle,
                    "anthropic-version": VERSION_API,
                    "content-type": "application/json",
                },
                json={
                    "model": modele,
                    "max_tokens": appel.max_tokens,
                    "temperature": appel.temperature,
                    "system": appel.system,
                    "messages": [{"role": "user", "content": appel.user}],
                },
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
            statut = reponse.status_code
            detail = reponse.text[:300]
            if statut == 429:
                raise ErreurApplicative("LLM_QUOTA_EXCEEDED", "Quota d'appels atteint.")
            if statut in (401, 403):
                raise ErreurApplicative(
                    "LLM_KEY_MISSING", "Clef d'API refusee par le fournisseur."
                )
            if statut == 404:
                raise ErreurApplicative(
                    "LLM_UNAVAILABLE",
                    f"Le modele « {modele} » n'est pas disponible chez ce fournisseur.",
                    {"model": modele, "provider": "anthropic", "detail": detail},
                )
            raise ErreurApplicative(
                "LLM_UNAVAILABLE",
                "Le service du modele est indisponible.",
                {"status": statut, "detail": detail},
            )

        donnees = reponse.json()
        blocs = [b for b in donnees.get("content", []) if b.get("type") == "text"]
        if not blocs:
            raise ErreurApplicative(
                "LLM_INVALID_OUTPUT",
                "Reponse du modele sans contenu texte.",
                {"stop_reason": donnees.get("stop_reason")},
            )

        usage = donnees.get("usage", {})
        return ResultatFournisseur(
            text="".join(b.get("text", "") for b in blocs),
            tokens_in=usage.get("input_tokens", 0),
            tokens_out=usage.get("output_tokens", 0),
            model=donnees.get("model", modele),
        )
