"""
Questions ouvertes corrigees par l'IA (decision 049).

Deux appels au modele : la generation, puis la correction de toute la copie.
Les points attendus ne descendent qu'avec la correction ; la note est
calculee par le serveur a partir des jugements du modele.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.services.ouvertes import _jugements, note_sur_20

from .test_api import COURS_COURT


def _cours(client: TestClient, entetes: dict, contenu: str = COURS_COURT) -> str:
    return client.post("/api/courses", headers=entetes, json={"title": "Cours", "content": contenu}).json()["course"]["id"]


def _serie(client: TestClient, entetes: dict, cours: str, nombre: int = 3) -> dict:
    r = client.post(f"/api/courses/{cours}/open-quiz", headers=entetes, json={"questionCount": nombre})
    assert r.status_code == 201, r.text
    return r.json()["openQuiz"]


def _rendre(client: TestClient, entetes: dict, serie: dict, reponses: list[str]):
    return client.post(f"/api/open-quizzes/{serie['id']}/submit", headers=entetes, json={"answers": reponses})


def test_aucune_serie_au_depart_et_sans_appel(client: TestClient, etudiant: dict, faux_modele) -> None:
    cours = _cours(client, etudiant)
    assert client.get(f"/api/courses/{cours}/open-quiz", headers=etudiant).json()["openQuiz"] is None
    assert faux_modele.appels == []


def test_les_attendus_ne_descendent_pas_avant_la_correction(client: TestClient, etudiant: dict, faux_modele) -> None:
    cours = _cours(client, etudiant)
    r = client.post(f"/api/courses/{cours}/open-quiz", headers=etudiant, json={"questionCount": 3})
    assert len(r.json()["openQuiz"]["questions"]) == 3
    for texte in (r.text, client.get(f"/api/courses/{cours}/open-quiz", headers=etudiant).text):
        assert "attendu" not in texte.lower()
        assert "reponseModele" not in texte
        assert "Passage du cours cite" not in texte
    assert len(faux_modele.appels) == 1


def test_correction_en_un_appel_et_note_calculee(client: TestClient, etudiant: dict, faux_modele) -> None:
    serie = _serie(client, etudiant, _cours(client, etudiant))
    r = _rendre(client, etudiant, serie, ["Ma reponse un.", "Ma reponse deux.", "Ma reponse trois."])
    assert r.status_code == 200, r.text
    copie = r.json()
    # La doublure juge « acquis, partiel » : 1,5 point sur 2 par question.
    assert copie["score"] == 15.0
    assert [c["note"] for c in copie["correction"]] == [15.0, 15.0, 15.0]
    premiere = copie["correction"][0]
    assert [a["etat"] for a in premiere["attendus"]] == ["acquis", "partiel"]
    assert premiere["attendus"][0]["citation"] and premiere["reponseModele"]
    assert len(faux_modele.appels) == 2  # generation + correction


def test_une_question_sans_reponse_ne_rapporte_rien(client: TestClient, etudiant: dict, faux_modele) -> None:
    serie = _serie(client, etudiant, _cours(client, etudiant))
    copie = _rendre(client, etudiant, serie, ["Reponse.", "", "Reponse."]).json()
    assert copie["correction"][1]["note"] == 0
    assert {a["etat"] for a in copie["correction"][1]["attendus"]} == {"absent"}
    assert copie["score"] == 10.0


def test_une_copie_blanche_est_refusee_sans_appel(client: TestClient, etudiant: dict, faux_modele) -> None:
    serie = _serie(client, etudiant, _cours(client, etudiant))
    assert _rendre(client, etudiant, serie, ["", "  ", ""]).status_code == 400
    assert len(faux_modele.appels) == 1


def test_la_copie_part_masquee(client: TestClient, etudiant: dict, faux_modele) -> None:
    serie = _serie(client, etudiant, _cours(client, etudiant))
    _rendre(client, etudiant, serie, ["Ecrivez-moi a moi.meme@exemple.tn pour en parler.", "x", "y"])
    assert "moi.meme@exemple.tn" not in faux_modele.appels[-1]["user"]


def test_un_autre_etudiant_n_a_acces_a_rien(client: TestClient, etudiant: dict, faux_modele) -> None:
    cours = _cours(client, etudiant)
    serie = _serie(client, etudiant, cours)
    autre = client.post("/api/auth/register", json={"email": "autre@exemple.tn", "password": "motdepasse-solide"})
    entetes = {"Authorization": f"Bearer {autre.json()['token']}"}
    assert client.get(f"/api/courses/{cours}/open-quiz", headers=entetes).status_code == 403
    assert _rendre(client, entetes, serie, ["Reponse."]).status_code == 403


def test_generation_et_correction_comptent_dans_le_quota(client: TestClient, etudiant: dict, faux_modele, monkeypatch) -> None:
    from app.config import parametres

    monkeypatch.setattr(parametres, "MAX_APPELS_MODELE_PAR_MINUTE", 2)
    serie = _serie(client, etudiant, _cours(client, etudiant))
    assert _rendre(client, etudiant, serie, ["Reponse."]).status_code == 200
    assert _rendre(client, etudiant, serie, ["Reponse."]).status_code == 429


def test_supprimer_le_cours_emporte_series_et_copies(client: TestClient, etudiant: dict, faux_modele, session_fabrique) -> None:
    from app.models import CopieOuverte, QuestionsOuvertes

    cours = _cours(client, etudiant)
    _rendre(client, etudiant, _serie(client, etudiant, cours), ["Reponse."])
    client.delete(f"/api/courses/{cours}", headers=etudiant)
    with session_fabrique() as s:
        assert s.query(QuestionsOuvertes).count() == 0
        assert s.query(CopieOuverte).count() == 0


class TestNote:
    def test_au_demi_point(self) -> None:
        c = lambda *etats: {"attendus": [{"etat": e} for e in etats]}  # noqa: E731
        assert note_sur_20([c("acquis", "acquis")]) == 20
        assert note_sur_20([c("acquis", "absent", "absent")]) == 6.5  # 6,67 -> 6,5
        assert note_sur_20([c("partiel", "absent"), c("acquis", "acquis")]) == 12.5
        assert note_sur_20([]) == 0

    def test_un_jugement_par_point_quoi_que_rende_le_modele(self) -> None:
        assert _jugements(["acquis"], 3) == ["acquis", "absent", "absent"]
        assert _jugements(["acquis", "partiel", "acquis", "acquis"], 2) == ["acquis", "partiel"]
        assert _jugements(["excellent", "partiel"], 2) == ["absent", "partiel"]
