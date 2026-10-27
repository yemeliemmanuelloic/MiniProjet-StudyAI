"""
Journal d'activite et objectif hebdomadaire (decision 050).

Chaque geste de revision laisse une trace ; le journal les rend reduits a un
par type et par demi-heure. Le calcul de la serie, lui, se fait dans le
navigateur (lib/serie.ts), a l'heure locale de l'etudiant.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from .test_api import COURS_COURT


def _types(client: TestClient, entetes: dict) -> list[str]:
    return [e["type"] for e in client.get("/api/activity", headers=entetes).json()["events"]]


def _cours_et_quiz(client: TestClient, entetes: dict) -> tuple[str, dict]:
    cours = client.post("/api/courses", headers=entetes, json={"title": "Cours", "content": COURS_COURT}).json()["course"]["id"]
    quiz = client.post(f"/api/courses/{cours}/quiz", headers=entetes, json={"questionCount": 3}).json()["quiz"]
    return cours, quiz


def test_rien_au_depart(client: TestClient, etudiant: dict) -> None:
    r = client.get("/api/activity", headers=etudiant).json()
    assert r == {"events": [], "weeklyGoal": 5}


def test_chaque_geste_de_revision_laisse_une_trace(client: TestClient, etudiant: dict, faux_modele) -> None:
    cours, quiz = _cours_et_quiz(client, etudiant)
    client.post(f"/api/quizzes/{quiz['id']}/submit", headers=etudiant, json={"answers": [0, 0, 0]})
    client.post(f"/api/courses/{cours}/flashcards", headers=etudiant)
    carte = client.get(f"/api/courses/{cours}/flashcards", headers=etudiant).json()["cards"][0]
    client.post(f"/api/flashcards/{carte['id']}/review", headers=etudiant, json={"bouton": "correct"})
    examen = client.post("/api/exams", headers=etudiant, json={"courseIds": [cours], "questionCount": 5}).json()
    client.post(f"/api/exams/{examen['id']}/submit", headers=etudiant, json={"answers": [None] * examen["total"]})
    serie = client.post(f"/api/courses/{cours}/open-quiz", headers=etudiant, json={"questionCount": 1}).json()["openQuiz"]
    client.post(f"/api/open-quizzes/{serie['id']}/submit", headers=etudiant, json={"answers": ["Ma reponse."]})
    jour = datetime.now(timezone.utc).date()
    plan = client.post(
        "/api/plans",
        headers=etudiant,
        json={"title": "P", "examDate": (jour + timedelta(days=5)).isoformat(), "courseIds": [cours], "minutesPerDay": 30, "today": jour.isoformat()},
    ).json()
    cle = plan["days"][0]["taches"][0]["cle"]
    client.post(f"/api/plans/{plan['plan']['id']}/tasks", headers=etudiant, json={"cle": cle, "fait": True})

    assert set(_types(client, etudiant)) == {"quiz", "cartes", "examen", "ouvertes", "plan"}


def test_les_gestes_rapproches_sont_reduits(client: TestClient, etudiant: dict, faux_modele) -> None:
    cours, _ = _cours_et_quiz(client, etudiant)
    client.post(f"/api/courses/{cours}/flashcards", headers=etudiant)
    for carte in client.get(f"/api/courses/{cours}/flashcards", headers=etudiant).json()["cards"]:
        client.post(f"/api/flashcards/{carte['id']}/review", headers=etudiant, json={"bouton": "facile"})
    assert _types(client, etudiant) == ["cartes"]


def test_decocher_ne_compte_pas(client: TestClient, etudiant: dict, faux_modele) -> None:
    cours, _ = _cours_et_quiz(client, etudiant)
    jour = datetime.now(timezone.utc).date()
    plan = client.post(
        "/api/plans",
        headers=etudiant,
        json={"title": "P", "examDate": (jour + timedelta(days=5)).isoformat(), "courseIds": [cours], "minutesPerDay": 30, "today": jour.isoformat()},
    ).json()
    cle = plan["days"][0]["taches"][0]["cle"]
    client.post(f"/api/plans/{plan['plan']['id']}/tasks", headers=etudiant, json={"cle": cle, "fait": False})
    assert _types(client, etudiant) == []


def test_un_autre_etudiant_ne_voit_rien(client: TestClient, etudiant: dict, faux_modele) -> None:
    _, quiz = _cours_et_quiz(client, etudiant)
    client.post(f"/api/quizzes/{quiz['id']}/submit", headers=etudiant, json={"answers": [0, 0, 0]})
    autre = client.post("/api/auth/register", json={"email": "autre@exemple.tn", "password": "motdepasse-solide"})
    entetes = {"Authorization": f"Bearer {autre.json()['token']}"}
    assert _types(client, entetes) == []


def test_objectif_hebdomadaire(client: TestClient, etudiant: dict) -> None:
    assert client.put("/api/activity/goal", headers=etudiant, json={"weeklyGoal": 3}).json() == {"weeklyGoal": 3}
    assert client.get("/api/activity", headers=etudiant).json()["weeklyGoal"] == 3
    for invalide in (0, 8):
        assert client.put("/api/activity/goal", headers=etudiant, json={"weeklyGoal": invalide}).status_code in (400, 422)


def test_la_fenetre_est_bornee(client: TestClient, etudiant: dict) -> None:
    assert client.get("/api/activity?days=0", headers=etudiant).status_code in (400, 422)
    assert client.get("/api/activity?days=401", headers=etudiant).status_code in (400, 422)
