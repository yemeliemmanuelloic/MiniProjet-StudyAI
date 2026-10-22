"""
Fournisseur Groq : modeles ouverts (Llama, Qwen) sur une API compatible
OpenAI. Il sert de RELAIS : quand le fournisseur principal sature, epuise son
quota ou depasse le delai, l'appel est rejoue ici (voir client.py).

Pourquoi Groq en relais (22 octobre) : une offre gratuite aux limites
publiees par modele, des latences tres basses, et le mode JSON
(`response_format: json_object`) qui contraint la sortie comme le fait
`responseMimeType` chez Gemini. Le mode JSON exige que le mot « json »
figure dans les messages : nos prompts le disent deja tous (le schema
attendu y est decrit en JSON).

Le modele est fixe par la configuration du relais (LLM_RELAIS), pas par
LLM_MODEL qui designe celui du fournisseur principal.
"""

from __future__ import annotations

import json

import httpx

from ...config import parametres
from ...errors import ErreurApplicative
from .base import AppelFournisseur, FluxFournisseur, ResultatFournisseur, lignes_sse

RACINE = "https://api.groq.com/openai/v1"


class FournisseurGroq:
    nom = "groq"

    def __init__(self, modele: str) -> None:
        self._cle = parametres.GROQ_API_KEY
        self._modele = modele

    @property
    def disponible(self) -> bool:
        return bool(self._cle)

    def appeler(self, appel: AppelFournisseur, delai_ms: int) -> ResultatFournisseur:
        if not self._cle:
            raise ErreurApplicative(
                "LLM_KEY_MISSING",
                "Le service d'analyse est indisponible : clef Groq absente.",
            )

        corps = {
            "model": self._modele,
            "messages": [
                {"role": "system", "content": appel.system},
                {"role": "user", "content": appel.user},
            ],
            "temperature": appel.temperature,
            "max_tokens": appel.max_tokens,
            "response_format": {"type": "json_object"},
        }

        try:
            reponse = httpx.post(
                f"{RACINE}/chat/completions",
                headers={
                    "authorization": f"Bearer {self._cle}",
                    "content-type": "application/json",
                },
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
            _traduire_echec(reponse, self._modele)

        donnees = reponse.json()
        choix = donnees.get("choices") or []
        texte = (choix[0].get("message", {}).get("content") or "") if choix else ""
        if not texte:
            raise ErreurApplicative(
                "LLM_INVALID_OUTPUT",
                "Reponse du modele vide.",
                {"finish_reason": choix[0].get("finish_reason") if choix else None},
            )

        usage = donnees.get("usage", {})
        return ResultatFournisseur(
            text=texte,
            tokens_in=usage.get("prompt_tokens", 0),
            tokens_out=usage.get("completion_tokens", 0),
            model=donnees.get("model") or self._modele,
        )


    def appeler_en_flux(self, appel: AppelFournisseur, delai_ms: int) -> FluxFournisseur:
        """Meme requete avec `stream: true` (Server-Sent Events, format OpenAI)."""
        if not self._cle:
            raise ErreurApplicative(
                "LLM_KEY_MISSING",
                "Le service d'analyse est indisponible : clef Groq absente.",
            )
        corps = {
            "model": self._modele,
            "messages": [
                {"role": "system", "content": appel.system},
                {"role": "user", "content": appel.user},
            ],
            "temperature": appel.temperature,
            "max_tokens": appel.max_tokens,
            "response_format": {"type": "json_object"},
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        texte: list[str] = []
        usage: dict = {}
        modele = self._modele
        try:
            with httpx.stream(
                "POST",
                f"{RACINE}/chat/completions",
                headers={
                    "authorization": f"Bearer {self._cle}",
                    "content-type": "application/json",
                },
                json=corps,
                timeout=delai_ms / 1000,
            ) as reponse:
                if reponse.status_code >= 400:
                    reponse.read()
                    _traduire_echec(reponse, self._modele)
                for charge in lignes_sse(reponse.iter_lines()):
                    if charge == "[DONE]":
                        break
                    donnees = json.loads(charge)
                    modele = donnees.get("model") or modele
                    usage = donnees.get("usage") or (donnees.get("x_groq") or {}).get("usage") or usage
                    for choix in (donnees.get("choices") or [])[:1]:
                        morceau = (choix.get("delta") or {}).get("content") or ""
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
            tokens_in=usage.get("prompt_tokens", 0),
            tokens_out=usage.get("completion_tokens", 0),
            model=modele,
        )


def _traduire_echec(reponse: httpx.Response, modele: str) -> None:
    """Traduit un echec HTTP dans la taxonomie du projet."""
    statut = reponse.status_code
    detail = reponse.text[:300]

    if statut == 429:
        raise ErreurApplicative("LLM_QUOTA_EXCEEDED", "Quota d'appels atteint.")
    if statut == 404:
        raise ErreurApplicative(
            "LLM_UNAVAILABLE",
            f"Le modele « {modele} » n'est pas disponible chez ce fournisseur.",
            {"model": modele, "provider": "groq", "detail": detail},
        )
    if statut in (401, 403):
        raise ErreurApplicative(
            "LLM_KEY_MISSING", "Clef d'API refusee par le fournisseur."
        )
    # 400 « json_validate_failed » : le modele n'a pas produit de JSON valide.
    # C'est une sortie non conforme, pas une panne : executer_tache() sait
    # relancer une sortie non conforme.
    if statut == 400 and "json" in detail.lower():
        raise ErreurApplicative(
            "LLM_INVALID_OUTPUT",
            "Le modele n'a pas produit de JSON valide.",
            {"provider": "groq", "detail": detail},
        )
    raise ErreurApplicative(
        "LLM_UNAVAILABLE",
        "Le service du modele est indisponible.",
        {"status": statut, "detail": detail},
    )
