"""
Conversations du tuteur (20 octobre).

Avant, un cours n'avait qu'un fil : les six derniers messages, quels qu'ils
soient, servaient de contexte au modele. Ces tests fixent ce qui a change :
une conversation se cree, se poursuit, se liste, se supprime ; son contexte
ne deborde plus sur une autre ; et elle reste cloisonnee a son proprietaire.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.models import Message
from tests.test_api import creer_cours


def autre_etudiant(client: TestClient) -> dict[str, str]:
    r = client.post(
        "/api/auth/register",
        json={"email": "autre@exemple.tn", "password": "motdepasse-solide"},
    )
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def poser(client: TestClient, entetes: dict, cours: str, question: str, conversation: str | None = None):
    corps: dict = {"question": question}
    if conversation:
        corps["conversationId"] = conversation
    r = client.post(f"/api/courses/{cours}/chat", headers=entetes, json=corps)
    assert r.status_code == 200, r.text
    return r.json()["message"]


def conversations(client: TestClient, entetes: dict, cours: str) -> list[dict]:
    r = client.get(f"/api/courses/{cours}/conversations", headers=entetes)
    assert r.status_code == 200, r.text
    return r.json()["conversations"]


class TestCycleDeVie:
    def test_une_question_sans_conversation_en_ouvre_une(self, client, etudiant, faux_modele) -> None:
        cours = creer_cours(client, etudiant)
        message = poser(client, etudiant, cours, "Qu'est-ce que la preemption ?")
        liste = conversations(client, etudiant, cours)
        assert len(liste) == 1
        assert liste[0]["id"] == message["conversationId"]
        assert liste[0]["title"] == "Qu'est-ce que la preemption ?"
        assert liste[0]["messageCount"] == 2

    def test_nouvelle_conversation_vide(self, client, etudiant) -> None:
        cours = creer_cours(client, etudiant)
        r = client.post(f"/api/courses/{cours}/conversations", headers=etudiant)
        assert r.status_code == 201, r.text
        c = r.json()["conversation"]
        assert c["title"] is None and c["messageCount"] == 0

    def test_poursuivre_puis_lire_une_conversation(self, client, etudiant, faux_modele) -> None:
        cours = creer_cours(client, etudiant)
        premiere = poser(client, etudiant, cours, "Qu'est-ce que la preemption ?")
        poser(client, etudiant, cours, "Et le quantum ?", premiere["conversationId"])
        r = client.get(f"/api/conversations/{premiere['conversationId']}/messages", headers=etudiant)
        assert [m["role"] for m in r.json()["messages"]] == ["user", "assistant", "user", "assistant"]
        # Le titre reste la PREMIERE question.
        assert conversations(client, etudiant, cours)[0]["title"] == "Qu'est-ce que la preemption ?"

    def test_la_plus_recente_en_tete(self, client, etudiant, faux_modele) -> None:
        cours = creer_cours(client, etudiant)
        a = poser(client, etudiant, cours, "Premiere question du jour")["conversationId"]
        b = poser(client, etudiant, cours, "Deuxieme question du jour")["conversationId"]
        assert [c["id"] for c in conversations(client, etudiant, cours)] == [b, a]
        poser(client, etudiant, cours, "Je reviens sur la premiere", a)
        assert [c["id"] for c in conversations(client, etudiant, cours)] == [a, b]

    def test_suppression(self, client, etudiant, faux_modele) -> None:
        cours = creer_cours(client, etudiant)
        c = poser(client, etudiant, cours, "Qu'est-ce que la preemption ?")["conversationId"]
        assert client.delete(f"/api/conversations/{c}", headers=etudiant).status_code == 204
        assert conversations(client, etudiant, cours) == []
        assert client.get(f"/api/conversations/{c}/messages", headers=etudiant).status_code == 404
        # Les messages partent avec la conversation.
        fil = client.get(f"/api/courses/{cours}/messages", headers=etudiant).json()["messages"]
        assert fil == []

    def test_titre_tronque_sur_une_ligne(self, client, etudiant, faux_modele) -> None:
        cours = creer_cours(client, etudiant)
        longue = "Explique   en detail\nle mecanisme " + "de preemption " * 20
        poser(client, etudiant, cours, longue)
        titre = conversations(client, etudiant, cours)[0]["title"]
        assert len(titre) <= 80 and titre.endswith("…") and "\n" not in titre and "  " not in titre


class TestContexte:
    def test_le_contexte_ne_deborde_pas_sur_une_autre_conversation(self, client, etudiant, faux_modele) -> None:
        cours = creer_cours(client, etudiant)
        a = poser(client, etudiant, cours, "Parle-moi du temoinalpha dans le cours")["conversationId"]

        # Meme conversation : la question precedente fait partie du contexte.
        poser(client, etudiant, cours, "Peux-tu preciser ?", a)
        assert "temoinalpha" in faux_modele.appels[-1]["user"]

        # Nouvelle conversation : elle n'en sait rien.
        poser(client, etudiant, cours, "Qu'est-ce que la preemption ?")
        assert "temoinalpha" not in faux_modele.appels[-1]["user"]


class TestCloisonnement:
    def test_un_autre_etudiant_ne_voit_ni_ne_supprime(self, client, etudiant, faux_modele) -> None:
        cours = creer_cours(client, etudiant)
        c = poser(client, etudiant, cours, "Qu'est-ce que la preemption ?")["conversationId"]
        intrus = autre_etudiant(client)
        for r in (
            client.get(f"/api/conversations/{c}/messages", headers=intrus),
            client.delete(f"/api/conversations/{c}", headers=intrus),
            client.get(f"/api/courses/{cours}/conversations", headers=intrus),
        ):
            assert r.status_code in (403, 404), r.text
        assert conversations(client, etudiant, cours)[0]["messageCount"] == 2

    def test_poursuivre_la_conversation_d_un_autre_est_refuse(self, client, etudiant, faux_modele) -> None:
        cours = creer_cours(client, etudiant)
        c = poser(client, etudiant, cours, "Qu'est-ce que la preemption ?")["conversationId"]
        intrus = autre_etudiant(client)
        son_cours = creer_cours(client, intrus)
        r = client.post(
            f"/api/courses/{son_cours}/chat",
            headers=intrus,
            json={"question": "Je tente ma chance", "conversationId": c},
        )
        assert r.status_code in (403, 404), r.text

    def test_conversation_d_un_autre_cours_refusee(self, client, etudiant, faux_modele) -> None:
        cours_a = creer_cours(client, etudiant)
        cours_b = creer_cours(client, etudiant)
        c = poser(client, etudiant, cours_a, "Qu'est-ce que la preemption ?")["conversationId"]
        r = client.post(
            f"/api/courses/{cours_b}/chat",
            headers=etudiant,
            json={"question": "Mauvais cours", "conversationId": c},
        )
        assert r.status_code == 400
        assert r.json()["error"]["code"] == "VALIDATION_ERROR"


class TestMessagesAnterieurs:
    def test_les_messages_sans_conversation_sont_regroupes(self, client, etudiant, session_fabrique) -> None:
        """Un message ecrit par l'ancienne version de l'API, sans conversation."""
        cours = creer_cours(client, etudiant)
        with session_fabrique() as s:
            s.add(Message(course_id=cours, role="user", content="Question d'avant"))
            s.add(Message(course_id=cours, role="assistant", content="Reponse d'avant"))
            s.commit()
        liste = conversations(client, etudiant, cours)
        assert len(liste) == 1
        assert liste[0]["title"] is None
        assert liste[0]["messageCount"] == 2
        # Et une seule fois : une seconde lecture ne recree rien.
        assert len(conversations(client, etudiant, cours)) == 1
