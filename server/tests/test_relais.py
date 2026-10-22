"""
Relais entre fournisseurs (22 octobre).

Le principal sature, epuise son quota ou depasse le delai : l'appel passe au
relais suivant, et la telemetrie dit qui a repondu. Une clef refusee ne
declenche pas le relais (erreur de configuration a corriger, pas a masquer).
Aucun appel reseau : les fournisseurs sont des doublures, et l'adaptateur
Groq est teste sur une reponse HTTP simulee.
"""

from __future__ import annotations

import httpx
import pytest

from app.errors import ErreurApplicative
from app.llm import client
from app.llm.providers import groq
from app.llm.providers.base import ResultatFournisseur


class Double:
    def __init__(self, nom: str, erreur: str | None = None, texte: str = '{"ok": true}') -> None:
        self.nom = nom
        self.erreur = erreur
        self.texte = texte
        self.appels = 0

    @property
    def disponible(self) -> bool:
        return True

    def appeler(self, appel, delai_ms):
        self.appels += 1
        if self.erreur:
            raise ErreurApplicative(self.erreur, "simule")
        return ResultatFournisseur(text=self.texte, tokens_in=10, tokens_out=5, model=f"{self.nom}-modele")


@pytest.fixture
def chaine(monkeypatch):
    monkeypatch.setattr(client, "ATTENTES", ())  # pas d'attente entre reprises
    monkeypatch.setattr(client.parametres, "GEMINI_API_KEY", "clef-de-test")

    def poser(principal: Double, *relais: Double) -> None:
        monkeypatch.setattr(client, "fournisseur", principal)
        monkeypatch.setattr(client, "relais", list(relais))

    return poser


@pytest.mark.parametrize("code", ["LLM_UNAVAILABLE", "LLM_QUOTA_EXCEEDED", "LLM_TIMEOUT"])
def test_defaillance_du_fournisseur_passe_au_relais(chaine, code) -> None:
    principal, secours = Double("gemini", code), Double("groq")
    chaine(principal, secours)
    brut = client.appeler_modele("sys", "user json", 0.2)
    assert brut.provider == "groq"
    assert brut.model == "groq-modele"
    assert principal.appels == 1 and secours.appels == 1


def test_clef_refusee_ne_passe_pas_au_relais(chaine) -> None:
    principal, secours = Double("gemini", "LLM_KEY_MISSING"), Double("groq")
    chaine(principal, secours)
    with pytest.raises(ErreurApplicative) as e:
        client.appeler_modele("sys", "user", 0.2)
    assert e.value.code == "LLM_KEY_MISSING"
    assert secours.appels == 0


def test_dernier_relais_en_echec_remonte_son_erreur(chaine) -> None:
    chaine(Double("gemini", "LLM_UNAVAILABLE"), Double("groq", "LLM_QUOTA_EXCEEDED"))
    with pytest.raises(ErreurApplicative) as e:
        client.appeler_modele("sys", "user", 0.2)
    assert e.value.code == "LLM_QUOTA_EXCEEDED"


def test_principal_sans_clef_mais_relais_disponible(chaine, monkeypatch) -> None:
    secours = Double("groq")
    chaine(Double("gemini"), secours)
    monkeypatch.setattr(client.parametres, "GEMINI_API_KEY", "")
    assert client.appeler_modele("sys", "user", 0.2).provider == "groq"


def test_aucun_fournisseur_disponible(chaine, monkeypatch) -> None:
    chaine(Double("gemini"))
    monkeypatch.setattr(client.parametres, "GEMINI_API_KEY", "")
    with pytest.raises(ErreurApplicative) as e:
        client.appeler_modele("sys", "user", 0.2)
    assert e.value.code == "LLM_KEY_MISSING"


def test_lecture_de_la_configuration(monkeypatch) -> None:
    monkeypatch.setattr(groq.parametres, "GROQ_API_KEY", "clef")
    chaine = client.relais_configures("groq:llama-3.3-70b-versatile, inconnu:x, malforme")
    assert [r.nom for r in chaine] == ["groq"]
    monkeypatch.setattr(groq.parametres, "GROQ_API_KEY", "")
    assert client.relais_configures("groq:llama-3.3-70b-versatile") == []


# --- Adaptateur Groq, sur des reponses HTTP simulees -----------------------

def _poster(statut: int, corps: dict | str):
    def faux_post(url, headers, json, timeout):
        assert url.endswith("/chat/completions")
        assert headers["authorization"] == "Bearer clef"
        assert json["response_format"] == {"type": "json_object"}
        requete = httpx.Request("POST", url)
        if isinstance(corps, str):
            return httpx.Response(statut, text=corps, request=requete)
        return httpx.Response(statut, json=corps, request=requete)

    return faux_post


@pytest.fixture
def adaptateur(monkeypatch):
    monkeypatch.setattr(groq.parametres, "GROQ_API_KEY", "clef")
    return groq.FournisseurGroq("llama-3.3-70b-versatile")


def _appel():
    from app.llm.providers.base import AppelFournisseur

    return AppelFournisseur(system="Reponds en json.", user="question", temperature=0.2, max_tokens=100)


def test_groq_reponse_traduite(adaptateur, monkeypatch) -> None:
    monkeypatch.setattr(groq.httpx, "post", _poster(200, {
        "model": "llama-3.3-70b-versatile",
        "choices": [{"message": {"content": '{"a": 1}'}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 12, "completion_tokens": 3},
    }))
    r = adaptateur.appeler(_appel(), 5000)
    assert (r.text, r.tokens_in, r.tokens_out, r.model) == ('{"a": 1}', 12, 3, "llama-3.3-70b-versatile")


@pytest.mark.parametrize(
    "statut, corps, code",
    [
        (429, "rate limit", "LLM_QUOTA_EXCEEDED"),
        (401, "invalid api key", "LLM_KEY_MISSING"),
        (404, "model not found", "LLM_UNAVAILABLE"),
        (503, "over capacity", "LLM_UNAVAILABLE"),
        (400, '{"error": {"code": "json_validate_failed"}}', "LLM_INVALID_OUTPUT"),
    ],
)
def test_groq_echecs_dans_la_taxonomie(adaptateur, monkeypatch, statut, corps, code) -> None:
    monkeypatch.setattr(groq.httpx, "post", _poster(statut, corps))
    with pytest.raises(ErreurApplicative) as e:
        adaptateur.appeler(_appel(), 5000)
    assert e.value.code == code


def test_groq_delai_depasse(adaptateur, monkeypatch) -> None:
    def trop_long(*a, **k):
        raise httpx.ReadTimeout("lent")

    monkeypatch.setattr(groq.httpx, "post", trop_long)
    with pytest.raises(ErreurApplicative) as e:
        adaptateur.appeler(_appel(), 5000)
    assert e.value.code == "LLM_TIMEOUT"
