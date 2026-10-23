"""
Import de fichiers sans texte : enregistrements, PDF scannes, photos (decision 043).

La regle verifiee avant tout : AUCUN fichier ne part chez un fournisseur
sans l'accord explicite de l'etudiant pour ce fichier. Viennent ensuite le
quota (la lecture compte comme une analyse), le texte minimal, et les deux
adaptateurs (Whisper chez Groq, lecture de fichier chez Gemini) sur des
reponses HTTP simulees. Aucun appel reseau.
"""

from __future__ import annotations

import httpx
import pymupdf
import pytest
from fastapi.testclient import TestClient

from app.config import parametres
from app.errors import ErreurApplicative
from app.llm import client as client_llm
from app.llm.client import ResultatBrut
from app.llm.providers import gemini, groq

TEXTE_LU = "Chapitre 1. L'ordonnancement des processus. " * 10


class Lecteur:
    """Doublure des deux lectures par modele, qui compte ses appels."""

    def __init__(self) -> None:
        self.audio: list[str] = []
        self.documents: list[str] = []

    def transcrire(self, contenu: bytes, nom: str) -> ResultatBrut:
        self.audio.append(nom)
        return ResultatBrut(text=TEXTE_LU, tokens_in=60, tokens_out=0, latence_ms=5, model="whisper", provider="groq")

    def lire(self, contenu: bytes, type_mime: str) -> ResultatBrut:
        self.documents.append(type_mime)
        return ResultatBrut(text=TEXTE_LU, tokens_in=10, tokens_out=10, latence_ms=5, model="gemini", provider="gemini")


@pytest.fixture
def lecteur(monkeypatch) -> Lecteur:
    double = Lecteur()
    monkeypatch.setattr(client_llm, "transcrire_enregistrement", double.transcrire)
    monkeypatch.setattr(client_llm, "lire_document", double.lire)
    return double


def _importer(client: TestClient, entetes: dict, nom: str, contenu: bytes, consentement: bool | None = None):
    donnees = {"title": "Cours importe"}
    if consentement is not None:
        donnees["consentement"] = "true" if consentement else "false"
    return client.post("/api/courses/import", headers=entetes, files={"file": (nom, contenu)}, data=donnees)


def _pdf_scanne() -> bytes:
    """Un PDF d'une page sans aucune couche texte, comme un scan."""
    document = pymupdf.open()
    page = document.new_page()
    page.draw_rect(pymupdf.Rect(50, 50, 300, 300), color=(0, 0, 0), fill=(0.5, 0.5, 0.5))
    return document.tobytes()


class TestConsentement:
    @pytest.mark.parametrize("nom, nature", [("cours.mp3", "enregistrement"), ("notes.jpg", "document")])
    def test_sans_accord_rien_ne_part(self, client: TestClient, etudiant: dict, lecteur: Lecteur, nom, nature) -> None:
        r = _importer(client, etudiant, nom, b"octets")
        assert r.status_code == 400
        assert r.json()["error"]["details"]["consentement_requis"] == nature
        assert lecteur.audio == [] and lecteur.documents == []

    def test_un_accord_refuse_vaut_absence_d_accord(self, client: TestClient, etudiant: dict, lecteur: Lecteur) -> None:
        r = _importer(client, etudiant, "cours.m4a", b"octets", consentement=False)
        assert r.status_code == 400
        assert lecteur.audio == []

    def test_pdf_scanne_sans_accord_est_signale_comme_tel(self, client: TestClient, etudiant: dict, lecteur: Lecteur) -> None:
        r = _importer(client, etudiant, "poly.pdf", _pdf_scanne())
        assert r.status_code == 400
        details = r.json()["error"]["details"]
        assert details["scanne"] is True and details["consentement_requis"] == "document"
        assert lecteur.documents == []


class TestLecture:
    def test_un_enregistrement_est_transcrit_et_devient_un_cours(self, client: TestClient, etudiant: dict, lecteur: Lecteur) -> None:
        r = _importer(client, etudiant, "amphi-3.mp3", b"octets", consentement=True)
        assert r.status_code == 201, r.text
        assert r.json()["course"]["content"] == TEXTE_LU.strip()
        assert lecteur.audio == ["amphi-3.mp3"]

    def test_une_photo_est_lue_avec_son_type(self, client: TestClient, etudiant: dict, lecteur: Lecteur) -> None:
        r = _importer(client, etudiant, "notes.png", b"octets", consentement=True)
        assert r.status_code == 201, r.text
        assert lecteur.documents == ["image/png"]

    def test_un_pdf_scanne_accepte_est_lu_par_le_modele(self, client: TestClient, etudiant: dict, lecteur: Lecteur) -> None:
        r = _importer(client, etudiant, "poly.pdf", _pdf_scanne(), consentement=True)
        assert r.status_code == 201, r.text
        assert lecteur.documents == ["application/pdf"]

    def test_un_pdf_a_couche_texte_n_appelle_aucun_modele_meme_avec_accord(
        self, client: TestClient, etudiant: dict, lecteur: Lecteur
    ) -> None:
        document = pymupdf.open()
        document.new_page().insert_text((50, 72), TEXTE_LU[:90])
        page2 = document.new_page()
        page2.insert_text((50, 72), TEXTE_LU[90:180])
        page3 = document.new_page()
        page3.insert_text((50, 72), TEXTE_LU[180:270])
        r = _importer(client, etudiant, "poly.pdf", document.tobytes(), consentement=True)
        assert r.status_code == 201, r.text
        assert lecteur.documents == []

    def test_trop_peu_de_texte_reconnu_est_refuse(self, client: TestClient, etudiant: dict, monkeypatch) -> None:
        monkeypatch.setattr(
            client_llm,
            "transcrire_enregistrement",
            lambda contenu, nom: ResultatBrut(text="Euh.", tokens_in=1, tokens_out=0, latence_ms=1, model="w", provider="groq"),
        )
        r = _importer(client, etudiant, "vide.mp3", b"octets", consentement=True)
        assert r.status_code == 400
        assert "Trop peu de texte" in r.json()["error"]["message"]

    def test_la_lecture_compte_dans_le_quota(self, client: TestClient, etudiant: dict, lecteur: Lecteur, monkeypatch) -> None:
        monkeypatch.setattr(parametres, "MAX_APPELS_MODELE_PAR_MINUTE", 1)
        assert _importer(client, etudiant, "a.mp3", b"octets", consentement=True).status_code == 201
        r = _importer(client, etudiant, "b.mp3", b"octets", consentement=True)
        assert r.status_code == 429
        assert len(lecteur.audio) == 1


# --- Adaptateurs, sur des reponses HTTP simulees ---------------------------


def test_whisper_rend_le_texte(monkeypatch) -> None:
    monkeypatch.setattr(groq.parametres, "GROQ_API_KEY", "clef")

    def faux_post(url, headers, data, files, timeout):
        assert url.endswith("/audio/transcriptions")
        assert data["model"] == "whisper-large-v3-turbo"
        assert files["file"][0] == "cours.mp3"
        return httpx.Response(200, json={"text": "  Bonjour a tous.  ", "duration": 42.5}, request=httpx.Request("POST", url))

    monkeypatch.setattr(groq.httpx, "post", faux_post)
    r = groq.FournisseurGroq("whisper-large-v3-turbo").transcrire(b"x", "cours.mp3", 5000)
    assert (r.text, r.tokens_in) == ("Bonjour a tous.", 42)


@pytest.mark.parametrize("statut, code", [(413, "VALIDATION_ERROR"), (429, "LLM_QUOTA_EXCEEDED"), (401, "LLM_KEY_MISSING")])
def test_whisper_echecs(monkeypatch, statut, code) -> None:
    monkeypatch.setattr(groq.parametres, "GROQ_API_KEY", "clef")
    monkeypatch.setattr(
        groq.httpx, "post", lambda url, **k: httpx.Response(statut, text="echec", request=httpx.Request("POST", url))
    )
    with pytest.raises(ErreurApplicative) as e:
        groq.FournisseurGroq("whisper-large-v3-turbo").transcrire(b"x", "cours.mp3", 5000)
    assert e.value.code == code


def test_gemini_lit_un_fichier_et_signale_une_lecture_coupee(monkeypatch) -> None:
    monkeypatch.setattr(gemini.parametres, "GEMINI_API_KEY", "clef")
    vus = {}

    def faux_post(url, headers, json, timeout):
        partie = json["contents"][0]["parts"][0]["inline_data"]
        vus["mime"] = partie["mime_type"]
        return httpx.Response(
            200,
            json={"candidates": [{"content": {"parts": [{"text": "Texte lu."}]}, "finishReason": "MAX_TOKENS"}]},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(gemini.httpx, "post", faux_post)
    r = gemini.FournisseurGemini().lire_fichier(b"%PDF", "application/pdf", "Recopie.", 5000)
    assert vus["mime"] == "application/pdf"
    assert r.text.startswith("Texte lu.")
    assert "Lecture interrompue" in r.text
