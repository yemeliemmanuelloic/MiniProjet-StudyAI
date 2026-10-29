"""
Formats de quiz : QCM, vrai/faux, texte a trous (decision 053).

Un seul module juge les reponses (services/questions.py) ; le quiz,
l'examen blanc, la progression et les cartes s'y fient tous.
"""

from __future__ import annotations

import random

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.llm.pipeline import melanger_options
from app.schemas.llm import QuestionIA
from app.services.questions import bonne_reponse, est_juste, normaliser

from .test_api import COURS_COURT

TROUS = {"type": "trous", "question": "On evite la famine grace au ____.", "reponse": "vieillissement", "variantes": ["aging"]}
BASE = {"explanation": "Explication suffisamment longue pour le schema.", "sourceQuote": "Extrait du cours cite."}


class TestJugement:
    @pytest.mark.parametrize(
        "tapee",
        ["vieillissement", "Vieillissement", "  le vieillissement. ", "VIEILLISSEMENT", "vieilissement", "aging", "l'aging"],
    )
    def test_reponses_acceptees(self, tapee: str) -> None:
        assert est_juste(TROUS, tapee)

    @pytest.mark.parametrize("tapee", ["", "famine", "vieux", "priorite", 0, None])
    def test_reponses_refusees(self, tapee) -> None:
        assert not est_juste(TROUS, tapee)

    def test_accents_et_casse(self) -> None:
        q = {"type": "trous", "question": "Le ____ interrompt le processus.", "reponse": "préemption"}
        assert est_juste(q, "PREEMPTION")

    def test_pas_de_faute_toleree_sur_un_mot_court(self) -> None:
        q = {"type": "trous", "question": "Le ____ du processus.", "reponse": "etat"}
        assert est_juste(q, "état")
        assert not est_juste(q, "eta")

    def test_qcm_et_vrai_faux(self) -> None:
        qcm = {"options": ["a", "b", "c", "d"], "correctIndex": 2}
        assert est_juste(qcm, 2) and not est_juste(qcm, 1) and not est_juste(qcm, "c")
        vf = {"type": "vrai_faux", "options": ["Vrai", "Faux"], "correctIndex": 1}
        assert est_juste(vf, 1)
        # True vaut 1 en Python : il ne doit pas passer pour une reponse.
        assert not est_juste(vf, True)

    def test_bonne_reponse(self) -> None:
        assert bonne_reponse(TROUS) == "vieillissement"
        assert bonne_reponse({"options": ["a", "b", "c", "d"], "correctIndex": 3}) == "d"
        assert bonne_reponse({"options": ["a"], "correctIndex": 5}) is None

    def test_preposition_en_tete(self) -> None:
        q = {"type": "trous", "question": "Dans leur ordre ____.", "reponse": "d'arrivée"}
        assert est_juste(q, "arrivée") and est_juste(q, "d’arrivee")

    def test_normaliser(self) -> None:
        assert normaliser("  L’Ordonnanceur ! ") == "ordonnanceur"


class TestSchema:
    def test_vrai_faux_libelles_imposes(self) -> None:
        q = QuestionIA.model_validate({**BASE, "type": "vrai_faux", "question": "FIFO minimise l'attente.", "options": ["Oui", "Non"], "correctIndex": 1})
        assert q.options == ["Vrai", "Faux"]

    def test_vrai_faux_indice_borne(self) -> None:
        with pytest.raises(ValidationError):
            QuestionIA.model_validate({**BASE, "type": "vrai_faux", "question": "FIFO minimise l'attente.", "correctIndex": 2})

    def test_trous_exige_un_blanc_et_une_reponse(self) -> None:
        with pytest.raises(ValidationError):
            QuestionIA.model_validate({**BASE, "type": "trous", "question": "Sans blanc dans la phrase.", "reponse": "x"})
        with pytest.raises(ValidationError):
            QuestionIA.model_validate({**BASE, "type": "trous", "question": "Avec un ____ mais sans reponse."})
        q = QuestionIA.model_validate({**BASE, **TROUS, "options": ["a"], "correctIndex": 0})
        assert q.options == [] and q.correct_index is None

    def test_un_qcm_garde_ses_quatre_options(self) -> None:
        with pytest.raises(ValidationError):
            QuestionIA.model_validate({**BASE, "question": "Une question de QCM ?", "options": ["a", "b"], "correctIndex": 0})
        # Sans « type » : un QCM, comme avant la decision 053.
        assert QuestionIA.model_validate({**BASE, "question": "Une question de QCM ?", "options": list("abcd"), "correctIndex": 0}).type == "qcm"

    def test_seul_le_qcm_est_melange(self) -> None:
        vf = {"type": "vrai_faux", "options": ["Vrai", "Faux"], "correctIndex": 0}
        trous = dict(TROUS)
        melanger_options([vf, trous], random.Random(1))
        assert vf["options"] == ["Vrai", "Faux"] and vf["correctIndex"] == 0
        assert "options" not in trous


# --- De bout en bout cote serveur ------------------------------------------------------


def _quiz(client: TestClient, entetes: dict, formats: list[str], nombre: int = 6) -> tuple[str, dict]:
    cours = client.post("/api/courses", headers=entetes, json={"title": "Cours", "content": COURS_COURT}).json()["course"]["id"]
    r = client.post(f"/api/courses/{cours}/quiz", headers=entetes, json={"questionCount": nombre, "formats": formats})
    assert r.status_code == 200, r.text
    return cours, r.json()["quiz"]


def test_les_formats_demandes_sont_poses(client: TestClient, etudiant: dict, faux_modele) -> None:
    _, quiz = _quiz(client, etudiant, ["qcm", "vrai_faux", "trous"])
    assert [q["type"] for q in quiz["questions"]] == ["qcm"] * 2 + ["vrai_faux"] * 2 + ["trous"] * 2
    assert quiz["questions"][2]["options"] == ["Vrai", "Faux"]
    assert quiz["questions"][4]["options"] == []
    assert "Repartition demandee" in faux_modele.appels[0]["user"]


def test_la_reponse_du_texte_a_trous_ne_descend_pas(client: TestClient, etudiant: dict, faux_modele) -> None:
    cours = client.post("/api/courses", headers=etudiant, json={"title": "Cours", "content": COURS_COURT}).json()["course"]["id"]
    r = client.post(f"/api/courses/{cours}/quiz", headers=etudiant, json={"questionCount": 3, "formats": ["trous"]})
    assert "vieillissement" not in r.text and "aging" not in r.text


def test_qcm_seul_garde_la_consigne_eprouvee(client: TestClient, etudiant: dict, faux_modele) -> None:
    _quiz(client, etudiant, ["qcm"], nombre=3)
    assert "Repartition demandee" not in faux_modele.appels[0]["user"]
    assert "vrai/faux" not in faux_modele.appels[0]["system"]


def test_correction_d_un_quiz_mixte(client: TestClient, etudiant: dict, faux_modele, session_fabrique) -> None:
    from app.models import Quiz

    cours, quiz = _quiz(client, etudiant, ["vrai_faux", "trous"], nombre=4)
    with session_fabrique() as s:
        questions = s.get(Quiz, quiz["id"]).payload["questions"]
    reponses = [questions[0]["correctIndex"], 1 - questions[1]["correctIndex"], "Vieilissement", "famine"]
    corrige = client.post(f"/api/quizzes/{quiz['id']}/submit", headers=etudiant, json={"answers": reponses}).json()
    assert [l["correct"] for l in corrige["correction"]] == [True, False, True, False]
    assert corrige["attempt"]["score"] == 2
    assert corrige["correction"][3]["expected"] == "vieillissement"
    assert corrige["correction"][3]["chosen"] == "famine"
    # La question a trous ratee devient une carte, avec la reponse attendue.
    jeu = client.get(f"/api/courses/{cours}/flashcards", headers=etudiant).json()
    assert "vieillissement" in {c["verso"] for c in jeu["cards"]}


def test_l_examen_corrige_un_texte_a_trous(client: TestClient, etudiant: dict, faux_modele) -> None:
    cours, _ = _quiz(client, etudiant, ["trous"], nombre=3)
    examen = client.post("/api/exams", headers=etudiant, json={"courseIds": [cours], "questionCount": 5}).json()
    assert {q["type"] for q in examen["questions"]} == {"trous"}
    r = client.post(f"/api/exams/{examen['id']}/submit", headers=etudiant, json={"answers": ["aging"] * examen["total"]})
    assert r.status_code == 200, r.text
    assert r.json()["exam"]["score"] == examen["total"]
