"""
Voix naturelle de la presentation narree (decision 045).

Produite a la premiere ecoute d'une scene, encodee en MP3, relue sans appel.
Une narration qui contient une donnee personnelle ne part pas : la scene est
lue par la voix du navigateur (204).
"""

from __future__ import annotations

import io
import struct
import wave

import pytest
from fastapi.testclient import TestClient

from app.errors import ErreurApplicative
from app.llm import client as client_llm
from app.llm.audio import en_mp3, vers_pcm
from app.llm.providers import gemini

# La vraie fonction, prise avant que la garde de conftest ne la remplace.
SYNTHETISER_REEL = client_llm.synthetiser_voix

from .test_api import COURS_COURT

UNE_SECONDE = b"\x00\x00" * 24_000


def _wav(pcm: bytes, frequence: int = 24_000) -> bytes:
    tampon = io.BytesIO()
    with wave.open(tampon, "wb") as fichier:
        fichier.setnchannels(1)
        fichier.setsampwidth(2)
        fichier.setframerate(frequence)
        fichier.writeframes(pcm)
    return tampon.getvalue()


@pytest.fixture
def fausse_voix(monkeypatch) -> list[str]:
    from app.llm import client

    lus: list[str] = []

    def synthetiser(texte: str):
        lus.append(texte)
        return _wav(UNE_SECONDE), "audio/wav", "voix-simulee", 30

    monkeypatch.setattr(client, "synthetiser_voix", synthetiser)
    return lus


def _presentation(client: TestClient, entetes: dict) -> tuple[str, str]:
    cours = client.post("/api/courses", headers=entetes, json={"title": "Cours", "content": COURS_COURT})
    cours_id = cours.json()["course"]["id"]
    p = client.post(f"/api/courses/{cours_id}/presentation", headers=entetes).json()["presentation"]
    return cours_id, p["id"]


def _voix(client: TestClient, entetes: dict, cours: str, presentation: str, scene: int):
    return client.get(f"/api/courses/{cours}/presentation/{presentation}/voice/{scene}", headers=entetes)


def test_premiere_ecoute_produit_un_mp3_puis_relu_sans_appel(
    client: TestClient, etudiant: dict, faux_modele, fausse_voix
) -> None:
    cours, presentation = _presentation(client, etudiant)
    r = _voix(client, etudiant, cours, presentation, 0)
    assert r.status_code == 200
    assert r.headers["content-type"] == "audio/mpeg"
    assert r.content[:3] == b"ID3" or r.content[0] == 0xFF
    assert len(fausse_voix) == 1

    assert _voix(client, etudiant, cours, presentation, 0).content == r.content
    assert len(fausse_voix) == 1  # relire ne coute rien


def test_une_narration_avec_donnee_personnelle_reste_locale(
    client: TestClient, etudiant: dict, faux_modele, fausse_voix, session_fabrique
) -> None:
    from app.models import Presentation

    cours, presentation = _presentation(client, etudiant)
    with session_fabrique() as session:
        p = session.get(Presentation, presentation)
        scenes = [dict(s) for s in p.payload["scenes"]]
        scenes[1]["narration"] = "Pour toute question, ecrivez a prof.ali@universite.tn avant l'examen."
        p.payload = {**p.payload, "scenes": scenes}
        session.commit()

    assert _voix(client, etudiant, cours, presentation, 1).status_code == 204
    assert fausse_voix == []


def test_un_autre_etudiant_n_entend_rien(client: TestClient, etudiant: dict, faux_modele, fausse_voix) -> None:
    cours, presentation = _presentation(client, etudiant)
    autre = client.post("/api/auth/register", json={"email": "autre@exemple.tn", "password": "motdepasse-solide"})
    entetes = {"Authorization": f"Bearer {autre.json()['token']}"}
    assert _voix(client, entetes, cours, presentation, 0).status_code == 403
    assert fausse_voix == []


@pytest.mark.parametrize("scene", [-1, 5, 99])
def test_scene_hors_bornes(client: TestClient, etudiant: dict, faux_modele, fausse_voix, scene: int) -> None:
    cours, presentation = _presentation(client, etudiant)
    assert _voix(client, etudiant, cours, presentation, scene).status_code == 404


def test_presentation_d_un_autre_cours(client: TestClient, etudiant: dict, faux_modele, fausse_voix) -> None:
    cours, _ = _presentation(client, etudiant)
    _, presentation_ailleurs = _presentation(client, etudiant)
    assert _voix(client, etudiant, cours, presentation_ailleurs, 0).status_code == 404


def test_seule_la_production_compte_dans_le_quota(
    client: TestClient, etudiant: dict, faux_modele, fausse_voix, monkeypatch
) -> None:
    from app.config import parametres

    monkeypatch.setattr(parametres, "MAX_APPELS_MODELE_PAR_MINUTE", 2)
    cours, presentation = _presentation(client, etudiant)  # 1
    assert _voix(client, etudiant, cours, presentation, 0).status_code == 200  # 2
    assert _voix(client, etudiant, cours, presentation, 0).status_code == 200  # relue : gratuite
    assert _voix(client, etudiant, cours, presentation, 1).status_code == 429


def test_supprimer_le_cours_emporte_les_voix(
    client: TestClient, etudiant: dict, faux_modele, fausse_voix, session_fabrique
) -> None:
    from app.models import VoixScene

    cours, presentation = _presentation(client, etudiant)
    _voix(client, etudiant, cours, presentation, 0)
    client.delete(f"/api/courses/{cours}", headers=etudiant)
    with session_fabrique() as session:
        assert session.query(VoixScene).count() == 0


class TestEncodage:
    def test_wav_ordinaire(self) -> None:
        pcm, frequence = vers_pcm(_wav(UNE_SECONDE, 22_050), "audio/wav")
        assert pcm == UNE_SECONDE and frequence == 22_050

    def test_double_en_tete_retiree(self) -> None:
        # Cas constate le 23 octobre : le WAV livre contenait un second WAV.
        pcm, _ = vers_pcm(_wav(_wav(UNE_SECONDE)), "audio/wav")
        assert pcm == UNE_SECONDE

    def test_pcm_brut_et_sa_frequence(self) -> None:
        brut = struct.pack("<4h", 1, -1, 2, -2)
        assert vers_pcm(brut, "audio/L16;codec=pcm;rate=16000") == (brut, 16_000)

    def test_le_mp3_est_bien_plus_leger(self) -> None:
        mp3 = en_mp3(UNE_SECONDE * 5, 24_000)
        assert 0 < len(mp3) < len(UNE_SECONDE * 5) / 5


class TestFournisseur:
    def test_seul_le_texte_part(self, monkeypatch) -> None:
        # Une consigne de ton placee devant etait lue a voix haute (23 octobre).
        envoye: dict = {}

        class Reponse:
            status_code = 200

            def json(self):
                return {"candidates": [{"content": {"parts": [{"inlineData": {"mimeType": "audio/wav", "data": "UklGRg=="}}]}}]}

        def poster(url, **kw):
            envoye.update(kw["json"])
            return Reponse()

        monkeypatch.setattr(gemini.httpx, "post", poster)
        gemini.FournisseurGemini().synthetiser("Le texte de la scene.", "Kore", "modele-voix", 1000)
        assert envoye["contents"][0]["parts"] == [{"text": "Le texte de la scene."}]
        assert "systemInstruction" not in envoye

    def test_un_quota_epuise_passe_au_modele_suivant(self, monkeypatch) -> None:
        from app.config import parametres

        monkeypatch.setattr(parametres, "MODELE_VOIX", "voix-a, voix-b")
        essayes: list[str] = []

        def synthetiser(self, texte, voix, modele, delai_ms):
            essayes.append(modele)
            if modele == "voix-a":
                raise ErreurApplicative("LLM_QUOTA_EXCEEDED", "Quota d'appels atteint.")
            return b"audio", "audio/wav"

        monkeypatch.setattr(gemini.FournisseurGemini, "synthetiser", synthetiser)
        _, _, modele, _ = SYNTHETISER_REEL("Texte.")
        assert essayes == ["voix-a", "voix-b"] and modele == "voix-b"

    def test_le_dernier_quota_epuise_remonte(self, monkeypatch) -> None:
        from app.config import parametres

        monkeypatch.setattr(parametres, "MODELE_VOIX", "voix-a")

        def synthetiser(self, texte, voix, modele, delai_ms):
            raise ErreurApplicative("LLM_QUOTA_EXCEEDED", "Quota d'appels atteint.")

        monkeypatch.setattr(gemini.FournisseurGemini, "synthetiser", synthetiser)
        with pytest.raises(ErreurApplicative) as erreur:
            SYNTHETISER_REEL("Texte.")
        assert erreur.value.code == "LLM_QUOTA_EXCEEDED"
