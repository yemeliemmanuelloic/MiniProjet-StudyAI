"""
Plan de revision jusqu'a l'examen (decision 046).

L'algorithme est une fonction pure : on le teste jour par jour, sans base ni
horloge. Les routes, elles, ne doivent jamais appeler le modele.
"""

from __future__ import annotations

from collections import Counter
from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.services.plan import EtatCours, construire

from .test_api import COURS_COURT

LUNDI = date(2026, 11, 2)
NEUF = EtatCours("a", "Reseaux", None, False)
FAIBLE = EtatCours("b", "Systemes", 30, True)
SOLIDE = EtatCours("c", "Bases de donnees", 95, True)


def _taches(calendrier: list[dict]) -> list[dict]:
    return [t for j in calendrier for t in j["taches"]]


class TestConstruire:
    def test_rien_si_l_examen_est_aujourd_hui_ou_sans_cours(self) -> None:
        assert construire(LUNDI, LUNDI, [NEUF], 60) == []
        assert construire(LUNDI, LUNDI + timedelta(days=5), [], 60) == []

    def test_un_jour_par_date_jusqu_a_la_veille(self) -> None:
        jours = construire(LUNDI, LUNDI + timedelta(days=10), [NEUF], 60)
        assert [j["date"] for j in jours] == [(LUNDI + timedelta(days=i)).isoformat() for i in range(10)]
        assert all(j["taches"] for j in jours)

    def test_un_cours_neuf_commence_par_son_resume_un_cours_connu_par_un_quiz(self) -> None:
        premier = construire(LUNDI, LUNDI + timedelta(days=10), [NEUF, FAIBLE], 90)[0]["taches"]
        par_cours = {t["courseId"]: t["type"] for t in premier if t["courseId"]}
        assert par_cours == {"a": "resume", "b": "quiz"}

    def test_le_cours_faible_revient_plus_souvent_que_le_cours_solide(self) -> None:
        jours = construire(LUNDI, LUNDI + timedelta(days=21), [FAIBLE, SOLIDE], 60)
        seances = Counter(t["courseId"] for t in _taches(jours) if t["courseId"])
        assert seances["b"] > seances["c"] >= 2

    def test_examen_blanc_trois_jours_avant_et_veille_legere(self) -> None:
        jours = construire(LUNDI, LUNDI + timedelta(days=10), [NEUF, FAIBLE, SOLIDE], 60)
        assert "examen" in [t["type"] for t in jours[-3]["taches"]]
        veille = jours[-1]["taches"]
        assert [t["type"] for t in veille] == ["cartes", "resume"]
        assert veille[1]["courseId"] == "a"  # le plus fragile : jamais interroge

    def test_le_temps_du_jour_est_respecte(self) -> None:
        jours = construire(LUNDI, LUNDI + timedelta(days=14), [NEUF, FAIBLE, SOLIDE], 30)
        for j in jours:
            if not any(t["type"] == "examen" for t in j["taches"]):
                assert j["minutes"] <= 30

    def test_les_cles_sont_uniques(self) -> None:
        cles = [t["cle"] for t in _taches(construire(LUNDI, LUNDI + timedelta(days=30), [NEUF, FAIBLE, SOLIDE], 120))]
        assert len(cles) == len(set(cles))


# --- Routes -------------------------------------------------------------------------


AUJOURDHUI = datetime.now(timezone.utc).date()


def _cours(client: TestClient, entetes: dict, titre: str = "Cours") -> str:
    r = client.post("/api/courses", headers=entetes, json={"title": titre, "content": COURS_COURT})
    return r.json()["course"]["id"]


def _plan(client: TestClient, entetes: dict, cours: list[str], jours: int = 10, **extra):
    corps = {
        "title": "Partiels",
        "examDate": (AUJOURDHUI + timedelta(days=jours)).isoformat(),
        "courseIds": cours,
        "minutesPerDay": 45,
        "today": AUJOURDHUI.isoformat(),
        **extra,
    }
    return client.post("/api/plans", headers=entetes, json=corps)


def test_creer_puis_relire_sans_appel(client: TestClient, etudiant: dict, faux_modele) -> None:
    a, b = _cours(client, etudiant, "Reseaux"), _cours(client, etudiant, "Systemes")
    r = _plan(client, etudiant, [a, b])
    assert r.status_code == 201, r.text
    p = r.json()
    assert p["daysLeft"] == 10 and len(p["days"]) == 10
    assert {c["title"] for c in p["courses"]} == {"Reseaux", "Systemes"}
    relu = client.get(f"/api/plans/{p['plan']['id']}", headers=etudiant)
    assert relu.json()["days"] == p["days"]
    assert faux_modele.appels == []
    assert [x["id"] for x in client.get("/api/plans", headers=etudiant).json()["plans"]] == [p["plan"]["id"]]


@pytest.mark.parametrize("jours", [0, -3, 400])
def test_date_d_examen_invalide(client: TestClient, etudiant: dict, jours: int) -> None:
    assert _plan(client, etudiant, [_cours(client, etudiant)], jours).status_code == 400


def test_un_cours_d_un_autre_etudiant_est_refuse(client: TestClient, etudiant: dict) -> None:
    autre = client.post("/api/auth/register", json={"email": "autre@exemple.tn", "password": "motdepasse-solide"})
    entetes = {"Authorization": f"Bearer {autre.json()['token']}"}
    assert _plan(client, entetes, [_cours(client, etudiant)]).status_code == 403


def test_un_autre_etudiant_ne_voit_pas_le_plan(client: TestClient, etudiant: dict) -> None:
    plan = _plan(client, etudiant, [_cours(client, etudiant)]).json()["plan"]["id"]
    autre = client.post("/api/auth/register", json={"email": "autre@exemple.tn", "password": "motdepasse-solide"})
    entetes = {"Authorization": f"Bearer {autre.json()['token']}"}
    assert client.get(f"/api/plans/{plan}", headers=entetes).status_code == 403
    assert client.delete(f"/api/plans/{plan}", headers=entetes).status_code == 403
    assert client.get("/api/plans", headers=entetes).json()["plans"] == []


def test_cocher_et_decocher(client: TestClient, etudiant: dict) -> None:
    p = _plan(client, etudiant, [_cours(client, etudiant)]).json()
    cle = p["days"][0]["taches"][0]["cle"]
    url = f"/api/plans/{p['plan']['id']}/tasks?today={AUJOURDHUI.isoformat()}"
    coche = client.post(url, headers=etudiant, json={"cle": cle, "fait": True}).json()
    assert coche["days"][0]["taches"][0]["fait"] is True
    decoche = client.post(url, headers=etudiant, json={"cle": cle, "fait": False}).json()
    assert decoche["days"][0]["taches"][0]["fait"] is False


def test_un_quiz_rendu_aujourd_hui_coche_la_seance(client: TestClient, etudiant: dict, faux_modele) -> None:
    cours = _cours(client, etudiant)
    quiz = client.post(f"/api/courses/{cours}/quiz", headers=etudiant, json={"count": 3}).json()["quiz"]
    client.post(f"/api/quizzes/{quiz['id']}/submit", headers=etudiant, json={"answers": [0, 0, 0]})
    p = _plan(client, etudiant, [cours]).json()
    premier = p["days"][0]["taches"]
    assert [t["type"] for t in premier if t["courseId"]] == ["quiz"]  # deja interroge
    assert all(t["fait"] for t in premier if t["type"] == "quiz")


def test_un_cours_supprime_sort_du_plan(client: TestClient, etudiant: dict) -> None:
    a, b = _cours(client, etudiant, "Reseaux"), _cours(client, etudiant, "Systemes")
    plan = _plan(client, etudiant, [a, b]).json()["plan"]["id"]
    client.delete(f"/api/courses/{a}", headers=etudiant)
    p = client.get(f"/api/plans/{plan}", headers=etudiant).json()
    assert [c["title"] for c in p["courses"]] == ["Systemes"]


def test_supprimer_le_plan(client: TestClient, etudiant: dict) -> None:
    plan = _plan(client, etudiant, [_cours(client, etudiant)]).json()["plan"]["id"]
    assert client.delete(f"/api/plans/{plan}", headers=etudiant).status_code == 204
    assert client.get(f"/api/plans/{plan}", headers=etudiant).status_code == 404


def test_une_date_du_jour_fantaisiste_est_ignoree(client: TestClient, etudiant: dict) -> None:
    p = _plan(client, etudiant, [_cours(client, etudiant)], today="2030-01-01").json()
    assert p["today"] == AUJOURDHUI.isoformat()
