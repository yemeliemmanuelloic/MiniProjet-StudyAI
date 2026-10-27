"""
Les questions ratees reviennent en cartes (decision 048).

A chaque quiz ou examen blanc rendu, une question ratee devient une carte si
elle n'en a pas, ou compte comme un oubli si elle en a deja une ; dans les
deux cas, elle est a reviser aujourd'hui. Aucun appel au modele.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from .test_api import COURS_COURT


def _bonnes(session_fabrique, quiz: dict) -> list[int]:
    """Les bonnes reponses, lues en base : le serveur melange les options."""
    from app.models import Quiz

    with session_fabrique() as s:
        return [q["correctIndex"] for q in s.get(Quiz, quiz["id"]).payload["questions"]]


def _fausses(bonnes: list[int]) -> list[int]:
    return [(b + 1) % 4 for b in bonnes]


def _cours_et_quiz(client: TestClient, entetes: dict, nombre: int = 4, titre: str = "Cours") -> tuple[str, dict]:
    cours = client.post("/api/courses", headers=entetes, json={"title": titre, "content": COURS_COURT}).json()["course"]["id"]
    quiz = client.post(f"/api/courses/{cours}/quiz", headers=entetes, json={"questionCount": nombre}).json()["quiz"]
    return cours, quiz


def _rendre(client: TestClient, entetes: dict, quiz: dict, reponses: list[int]) -> dict:
    r = client.post(f"/api/quizzes/{quiz['id']}/submit", headers=entetes, json={"answers": reponses})
    assert r.status_code == 200, r.text
    return r.json()


def _jeu(client: TestClient, entetes: dict, cours: str) -> dict:
    return client.get(f"/api/courses/{cours}/flashcards", headers=entetes).json()


def test_les_questions_ratees_deviennent_des_cartes_dues(
    client: TestClient, etudiant: dict, faux_modele, session_fabrique
) -> None:
    cours, quiz = _cours_et_quiz(client, etudiant)
    bonnes = _bonnes(session_fabrique, quiz)
    fausses = _fausses(bonnes)
    corrige = _rendre(client, etudiant, quiz, [bonnes[0], fausses[1], fausses[2], bonnes[3]])
    assert corrige["cardsQueued"] == 2

    jeu = _jeu(client, etudiant, cours)
    assert jeu["etat"]["total"] == 2 and jeu["etat"]["dues"] == 2
    ratees = [corrige["correction"][1], corrige["correction"][2]]
    assert {c["recto"] for c in jeu["cards"]} == {r["question"] for r in ratees}
    # Le verso est la BONNE reponse, pas celle donnee.
    from app.models import Quiz

    with session_fabrique() as s:
        questions = s.get(Quiz, quiz["id"]).payload["questions"]
    assert {c["verso"] for c in jeu["cards"]} == {questions[i]["options"][bonnes[i]] for i in (1, 2)}
    assert len(faux_modele.appels) == 1  # le quiz seulement


def test_un_quiz_reussi_ne_cree_rien(client: TestClient, etudiant: dict, faux_modele, session_fabrique) -> None:
    cours, quiz = _cours_et_quiz(client, etudiant)
    assert _rendre(client, etudiant, quiz, _bonnes(session_fabrique, quiz))["cardsQueued"] == 0
    assert _jeu(client, etudiant, cours)["etat"]["total"] == 0


def test_rater_deux_fois_ne_duplique_pas(client: TestClient, etudiant: dict, faux_modele, session_fabrique) -> None:
    cours, quiz = _cours_et_quiz(client, etudiant)
    fausses = _fausses(_bonnes(session_fabrique, quiz))
    _rendre(client, etudiant, quiz, fausses)
    _rendre(client, etudiant, quiz, fausses)
    assert _jeu(client, etudiant, cours)["etat"]["total"] == 4


def test_une_carte_deja_sue_revient_comme_oubliee(client: TestClient, etudiant: dict, faux_modele, session_fabrique) -> None:
    cours, quiz = _cours_et_quiz(client, etudiant, nombre=3)
    bonnes = _bonnes(session_fabrique, quiz)
    client.post(f"/api/courses/{cours}/flashcards", headers=etudiant)
    for c in _jeu(client, etudiant, cours)["cards"]:
        client.post(f"/api/flashcards/{c['id']}/review", headers=etudiant, json={"bouton": "facile"})
    from app.models import Carte, Quiz

    with session_fabrique() as s:
        enonce = s.get(Quiz, quiz["id"]).payload["questions"][0]["question"]
        carte = {"id": s.query(Carte).filter(Carte.recto == enonce).one().id}
    with session_fabrique() as s:
        avant = s.get(Carte, carte["id"])
        stabilite, revisions = avant.stabilite, avant.revisions
    assert _jeu(client, etudiant, cours)["etat"]["dues"] == 0

    assert _rendre(client, etudiant, quiz, [(bonnes[0] + 1) % 4, bonnes[1], bonnes[2]])["cardsQueued"] == 1
    assert _jeu(client, etudiant, cours)["etat"]["dues"] == 1
    with session_fabrique() as s:
        apres = s.get(Carte, carte["id"])
        assert apres.stabilite < stabilite
        assert apres.derniere_note == 1
        assert apres.revisions == revisions  # une erreur au quiz n'est pas une revision
    assert _jeu(client, etudiant, cours)["etat"]["total"] == 3


def test_l_examen_blanc_remet_les_erreurs_dans_chaque_cours(client: TestClient, etudiant: dict, faux_modele) -> None:
    a, _ = _cours_et_quiz(client, etudiant, titre="Reseaux")
    b, _ = _cours_et_quiz(client, etudiant, titre="Systemes")
    examen = client.post("/api/exams", headers=etudiant, json={"courseIds": [a, b], "questionCount": 8}).json()
    r = client.post(f"/api/exams/{examen['id']}/submit", headers=etudiant, json={"answers": [None] * examen["total"]})
    assert r.status_code == 200, r.text
    assert r.json()["cardsQueued"] == examen["total"]
    assert _jeu(client, etudiant, a)["etat"]["dues"] + _jeu(client, etudiant, b)["etat"]["dues"] == examen["total"]


def test_un_cours_supprime_depuis_l_examen_est_saute(client: TestClient, etudiant: dict, faux_modele) -> None:
    a, _ = _cours_et_quiz(client, etudiant, titre="Reseaux")
    b, _ = _cours_et_quiz(client, etudiant, titre="Systemes")
    examen = client.post("/api/exams", headers=etudiant, json={"courseIds": [a, b], "questionCount": 8}).json()
    client.delete(f"/api/courses/{a}", headers=etudiant)
    r = client.post(f"/api/exams/{examen['id']}/submit", headers=etudiant, json={"answers": [None] * examen["total"]})
    assert r.status_code == 200, r.text
    assert r.json()["cardsQueued"] == _jeu(client, etudiant, b)["etat"]["total"] > 0
