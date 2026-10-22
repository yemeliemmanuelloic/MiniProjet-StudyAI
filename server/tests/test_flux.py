"""
Reponses du tuteur au fil de l'eau (23 octobre).

Trois niveaux : les outils de texte (extraction du champ, restauration des
jetons coupes), le relais en diffusion (bascule seulement avant le premier
morceau), et la route NDJSON de bout en bout avec la doublure du modele.
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.errors import ErreurApplicative
from app.llm import client as client_llm
from app.llm import run_task, tasks
from app.llm.flux import ExtracteurChaine, RestaurateurFlux
from app.llm.providers.base import ResultatFournisseur
from app.models import Message

from .test_api import COURS_COURT


def _par_morceaux(texte: str, taille: int) -> list[str]:
    return [texte[i : i + taille] for i in range(0, len(texte), taille)]


def _consommer(gen):
    morceaux = []
    while True:
        try:
            morceaux.append(next(gen))
        except StopIteration as fin:
            return morceaux, fin.value


class TestExtracteur:
    @pytest.mark.parametrize("taille", [1, 2, 3, 7, 1000])
    def test_rend_la_valeur_decodee_quel_que_soit_le_decoupage(self, taille: int) -> None:
        valeur = 'Ligne 1\nLigne "2" \\ fin, été é /'
        brut = json.dumps({"answer": valeur, "grounded": True, "sources": ["a"]})
        e = ExtracteurChaine("answer")
        sortie = "".join(e.ajouter(m) for m in _par_morceaux(brut, taille))
        assert sortie == valeur
        assert e.termine

    def test_ignore_ce_qui_precede_et_suit_le_champ(self) -> None:
        e = ExtracteurChaine("answer")
        brut = '{"grounded": true, "answer": "ok", "sources": ["ne pas emettre"]}'
        assert "".join(e.ajouter(m) for m in _par_morceaux(brut, 4)) == "ok"

    def test_rien_tant_que_le_champ_n_est_pas_ouvert(self) -> None:
        e = ExtracteurChaine("answer")
        assert e.ajouter('{"ans') == ""
        assert e.ajouter('wer": "Bon') == "Bon"
        assert e.ajouter('jour"}') == "jour"


class TestRestaurateur:
    carte = {"[EMAIL_1]": "ali@exemple.tn", "[TEL_1]": "+216 22 333 444"}

    @pytest.mark.parametrize("taille", [1, 2, 4, 9, 100])
    def test_un_jeton_coupe_n_est_jamais_montre_a_moitie(self, taille: int) -> None:
        r = RestaurateurFlux(self.carte)
        texte = "Ecrire a [EMAIL_1] ou appeler le [TEL_1]."
        morceaux = [r.ajouter(m) for m in _par_morceaux(texte, taille)] + [r.vider()]
        assert "".join(morceaux) == "Ecrire a ali@exemple.tn ou appeler le +216 22 333 444."
        assert not any("[" in m for m in morceaux)

    def test_un_crochet_ordinaire_n_est_pas_retenu_indefiniment(self) -> None:
        r = RestaurateurFlux(self.carte)
        long = "Voir [" + "x" * 60
        assert r.ajouter(long) == long


# --- Relais en diffusion ---------------------------------------------------


class Diffuseur:
    def __init__(self, nom: str, erreur: str | None = None, apres: int = 0) -> None:
        self.nom, self.erreur, self.apres = nom, erreur, apres
        self.morceaux = ['{"a":', "1}"]

    @property
    def disponible(self) -> bool:
        return True

    def appeler_en_flux(self, appel, delai_ms):
        for i, m in enumerate(self.morceaux):
            if self.erreur and i == self.apres:
                raise ErreurApplicative(self.erreur, "simule")
            yield m
        return ResultatFournisseur(
            text="".join(self.morceaux), tokens_in=3, tokens_out=2, model=f"{self.nom}-m"
        )


@pytest.fixture
def chaine(monkeypatch):
    monkeypatch.setattr(client_llm, "ATTENTES", ())
    monkeypatch.setattr(client_llm.parametres, "GEMINI_API_KEY", "clef")

    def poser(principal, *relais):
        monkeypatch.setattr(client_llm, "fournisseur", principal)
        monkeypatch.setattr(client_llm, "relais", list(relais))

    return poser


def test_echec_avant_le_premier_morceau_passe_au_relais(chaine) -> None:
    chaine(Diffuseur("gemini", erreur="LLM_QUOTA_EXCEEDED", apres=0), Diffuseur("groq"))
    morceaux, brut = _consommer(client_llm.appeler_modele_en_flux("s", "u json", 0.1))
    assert "".join(morceaux) == '{"a":1}'
    assert brut.provider == "groq" and brut.model == "groq-m"


def test_echec_apres_un_morceau_remonte_sans_relais(chaine) -> None:
    chaine(Diffuseur("gemini", erreur="LLM_UNAVAILABLE", apres=1), Diffuseur("groq"))
    with pytest.raises(ErreurApplicative) as e:
        _consommer(client_llm.appeler_modele_en_flux("s", "u", 0.1))
    assert e.value.code == "LLM_UNAVAILABLE"


def test_sortie_invalide_retombe_sur_l_appel_classique(monkeypatch, faux_modele) -> None:
    """Le JSON diffuse est rejete par le schema : la reponse validee vient du repli."""

    def flux_invalide(system, user, temperature, max_tokens=2048):
        yield '{"answer": "incomplet"'
        return client_llm.ResultatBrut(
            text='{"answer": "incomplet"', tokens_in=1, tokens_out=1, latence_ms=1, model="m", provider="t"
        )

    monkeypatch.setattr(run_task, "appeler_modele_en_flux", flux_invalide)
    _, resultat = _consommer(run_task.executer_tache_en_flux(tasks.TACHE_CHAT, "sys", "user"))
    assert resultat.donnees.answer == "Reponse appuyee sur les passages fournis."
    assert resultat.telemetrie.relance and resultat.telemetrie.appels == 2


# --- Route NDJSON -------------------------------------------------------------


def _cours(client: TestClient, entetes: dict, contenu: str = COURS_COURT) -> str:
    r = client.post("/api/courses", headers=entetes, json={"title": "Cours", "content": contenu})
    return r.json()["course"]["id"]


def _evenements(reponse) -> list[dict]:
    return [json.loads(ligne) for ligne in reponse.text.splitlines() if ligne.strip()]


def test_route_diffuse_puis_enregistre(
    client: TestClient, etudiant: dict, faux_modele, session_fabrique
) -> None:
    cours = _cours(client, etudiant)
    r = client.post(
        f"/api/courses/{cours}/chat/stream", headers=etudiant, json={"question": "Que dit le cours ?"}
    )
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/x-ndjson")
    ev = _evenements(r)
    assert ev[0]["type"] == "conversation"
    textes = [e["texte"] for e in ev if e["type"] == "texte"]
    assert len(textes) > 1  # bien diffuse en plusieurs morceaux
    assert "".join(textes) == "Reponse appuyee sur les passages fournis."
    fin = ev[-1]
    assert fin["type"] == "fin"
    assert fin["message"]["content"] == "Reponse appuyee sur les passages fournis."
    assert fin["message"]["conversationId"] == ev[0]["conversationId"]
    with session_fabrique() as session:
        roles = [m.role for m in session.query(Message).order_by(Message.created_at).all()]
    assert roles == ["user", "assistant"]


def test_route_les_droits_sont_verifies_avant_le_flux(
    client: TestClient, etudiant: dict, faux_modele
) -> None:
    r = client.post("/api/courses/inexistant/chat/stream", headers=etudiant, json={"question": "Que dit le cours ?"})
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "NOT_FOUND"
    assert client.post("/api/courses/x/chat/stream", json={"question": "Que dit le cours ?"}).status_code == 401


def test_route_un_echec_du_modele_arrive_comme_evenement(
    client: TestClient, etudiant: dict, faux_modele, monkeypatch
) -> None:
    def en_panne(system, user, temperature, max_tokens=2048):
        raise ErreurApplicative("LLM_QUOTA_EXCEEDED", "Quota d'appels atteint.")
        yield ""  # pragma: no cover - fait de la fonction un generateur

    monkeypatch.setattr(run_task, "appeler_modele_en_flux", en_panne)
    cours = _cours(client, etudiant)
    ev = _evenements(
        client.post(f"/api/courses/{cours}/chat/stream", headers=etudiant, json={"question": "Que dit le cours ?"})
    )
    assert ev[-1]["type"] == "erreur"
    assert ev[-1]["error"]["code"] == "LLM_QUOTA_EXCEEDED"


def test_route_ne_transmet_au_modele_que_du_texte_masque(
    client: TestClient, etudiant: dict, faux_modele
) -> None:
    cours = _cours(client, etudiant, COURS_COURT + " Contact : prof.ali@universite.tn.")
    client.post(f"/api/courses/{cours}/chat/stream", headers=etudiant, json={"question": "Qui contacter ?"})
    assert faux_modele.appels, "le modele n'a pas ete appele"
    assert all("prof.ali@universite.tn" not in a["user"] for a in faux_modele.appels)


# --- Decodage des flux SSE des fournisseurs ----------------------------------


class _FauxFlux:
    def __init__(self, statut: int, lignes: list[str]) -> None:
        self.status_code, self._lignes = statut, lignes
        self.text = "\n".join(lignes)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def read(self):
        return self.text.encode()

    def iter_lines(self):
        return iter(self._lignes)


def _appel():
    from app.llm.providers.base import AppelFournisseur

    return AppelFournisseur(system="json", user="q", temperature=0.1, max_tokens=50)


def test_gemini_decode_le_flux_sse(monkeypatch) -> None:
    from app.llm.providers import gemini

    lignes = [
        'data: {"candidates": [{"content": {"parts": [{"text": "{\\"answer\\": \\"Bon"}]}}]}',
        "",
        'data: {"candidates": [{"content": {"parts": [{"text": "jour\\"}"}]}}], '
        '"usageMetadata": {"promptTokenCount": 9, "candidatesTokenCount": 4}}',
    ]
    monkeypatch.setattr(gemini.parametres, "GEMINI_API_KEY", "clef")
    monkeypatch.setattr(gemini.httpx, "stream", lambda *a, **k: _FauxFlux(200, lignes))
    morceaux, r = _consommer(gemini.FournisseurGemini().appeler_en_flux(_appel(), 5000))
    assert "".join(morceaux) == '{"answer": "Bonjour"}'
    assert (r.tokens_in, r.tokens_out) == (9, 4)


def test_groq_decode_le_flux_sse(monkeypatch) -> None:
    from app.llm.providers import groq

    lignes = [
        'data: {"model": "llama", "choices": [{"delta": {"content": "{\\"a\\": "}}]}',
        'data: {"choices": [{"delta": {"content": "1}"}}]}',
        'data: {"choices": [], "usage": {"prompt_tokens": 7, "completion_tokens": 2}}',
        "data: [DONE]",
    ]
    monkeypatch.setattr(groq.parametres, "GROQ_API_KEY", "clef")
    monkeypatch.setattr(groq.httpx, "stream", lambda *a, **k: _FauxFlux(200, lignes))
    morceaux, r = _consommer(groq.FournisseurGroq("llama").appeler_en_flux(_appel(), 5000))
    assert "".join(morceaux) == '{"a": 1}'
    assert (r.tokens_in, r.tokens_out, r.model) == (7, 2, "llama")


def test_un_429_en_flux_est_traduit(monkeypatch) -> None:
    from app.llm.providers import groq

    monkeypatch.setattr(groq.parametres, "GROQ_API_KEY", "clef")
    monkeypatch.setattr(groq.httpx, "stream", lambda *a, **k: _FauxFlux(429, ["rate limit"]))
    with pytest.raises(ErreurApplicative) as e:
        _consommer(groq.FournisseurGroq("llama").appeler_en_flux(_appel(), 5000))
    assert e.value.code == "LLM_QUOTA_EXCEEDED"
