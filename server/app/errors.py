"""
Taxonomie d'erreurs du projet (doc 01-architecture, section 5).

Les cinq codes LLM_* sont distincts a dessein : ce sont eux qui prouvent, en
soutenance, que l'exigence « gestion des erreurs d'appel API (timeout, quota,
clef absente) » de l'enonce est reellement traitee. Un message generique ne
prouverait rien.
"""

from __future__ import annotations

from typing import Any, Literal

CodeErreur = Literal[
    "VALIDATION_ERROR",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "RATE_LIMITED",
    "LLM_KEY_MISSING",
    "LLM_TIMEOUT",
    "LLM_QUOTA_EXCEEDED",
    "LLM_INVALID_OUTPUT",
    "LLM_UNAVAILABLE",
    "INTERNAL",
]

STATUT: dict[str, int] = {
    "VALIDATION_ERROR": 400,
    "UNAUTHORIZED": 401,
    "FORBIDDEN": 403,
    "NOT_FOUND": 404,
    "RATE_LIMITED": 429,
    "LLM_KEY_MISSING": 503,
    "LLM_TIMEOUT": 504,
    "LLM_QUOTA_EXCEEDED": 429,
    "LLM_INVALID_OUTPUT": 502,
    "LLM_UNAVAILABLE": 502,
    "INTERNAL": 500,
}


class ErreurApplicative(Exception):
    """
    Erreur portant un code du vocabulaire ci-dessus.

    Le gestionnaire global de main.py la traduit en reponse HTTP de forme
    unique : { "error": { "code", "message", "details" } }. Le front lit
    `error.code` et n'a jamais a composer de message lui-meme.
    """

    def __init__(
        self,
        code: CodeErreur,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code: str = code
        self.message = message
        self.details: dict[str, Any] = details or {}

    @property
    def statut(self) -> int:
        return STATUT.get(self.code, 500)
