"""
Cartes de revision espacee.

CE QUE CE MODULE AJOUTE. Le quiz verifie qu'on a compris le jour meme. Il ne
fait rien pour qu'on s'en souvienne trois semaines plus tard, et c'est tout
l'objet de la repetition espacee : revoir chaque notion juste avant de
l'oublier. C'est le seul manque reel face aux produits du marche.

ZERO APPEL AU MODELE, et c'est le point qui merite d'etre defendu. Une carte
ne se GENERE pas, elle se DERIVE : l'enonce d'une question de quiz devient le
recto, la bonne option le verso, l'explication et la citation du cours
l'accompagnent. Les quatre champs sont deja en base depuis la generation du
quiz. Fabriquer cinquante cartes coute donc exactement zero appel, zero jeton
et zero seconde d'attente — comme l'examen blanc, et pour la meme raison.

CE QUE CELA SUPPOSE. Un cours sans quiz n'a pas de cartes, et le module le dit
au lieu de generer un quiz en silence : declencher un appel au modele depuis
un ecran qui promet la gratuite serait exactement le genre de cout invisible
que le tableau de consommation existe pour rendre visible.

L'ARITHMETIQUE VIT AILLEURS, dans `sm2.py`, qui ne connait ni base ni horloge.
Ici on ne fait que lire, ecrire, et convertir un intervalle en date.
"""

from __future__ import annotations

from datetime import datetime, time, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..errors import ErreurApplicative
from ..models import Carte, Quiz
from .enonces import cle_enonce
from .sm2 import NOTES, Etat, etat_initial, prochaine_date, suivant
from .study import cours_de

#: Plafond du nombre de cartes rendues pour une session de revision. Au-dela,
#: la session n'est plus tenable d'une traite et l'etudiant abandonne au
#: milieu — ce qui, pour la repetition espacee, est pire que de ne pas
#: commencer : les cartes deja vues restent marquees comme revisees.
PAR_SESSION = 20

#: Au-dela de cet intervalle, une carte est consideree comme ACQUISE. Vingt et
#: un jours est le seuil d'Anki ; il n'a rien de theorique, mais il faut bien
#: un palier pour distinguer « revue trois fois cette semaine » de « sue ».
INTERVALLE_ACQUIS = 21


def _aujourd_hui() -> datetime:
    """
    Minuit UTC du jour courant.

    Une carte est due AUJOURD'HUI, pas a 14 h 32. Si l'echeance portait
    l'heure de la derniere revision, un etudiant qui revise a 21 h un soir
    retrouverait ses cartes a 21 h le lendemain, et pas avant — alors qu'il
    s'y remet apres le dejeuner.
    """
    return datetime.combine(datetime.now(timezone.utc).date(), time.min, timezone.utc)


def _echeance(etat: Etat) -> datetime:
    jour = prochaine_date(etat, _aujourd_hui().date())
    return datetime.combine(jour, time.min, timezone.utc)


def _etat_de(carte: Carte) -> Etat:
    # `facilite` revient en Decimal depuis PostgreSQL (colonne NUMERIC) et en
    # float depuis SQLite. SM-2 melange ce nombre a des flottants : sans cette
    # conversion, PostgreSQL leverait une TypeError que les tests, qui
    # tournent sur SQLite, ne verraient jamais.
    return Etat(
        facilite=float(carte.facilite),
        intervalle=carte.intervalle,
        repetitions=carte.repetitions,
    )


def materialiser(session: Session, course_id: str, owner_id: str) -> dict:
    """
    Fabrique les cartes manquantes du cours depuis ses quiz. AUCUN APPEL.

    Idempotent : relancer sur un cours deja traite ne cree rien et ne touche a
    aucune progression. C'est la raison d'etre de la contrainte (cours, cle) —
    regenerer un quiz ne doit pas dupliquer une carte revisee depuis trois
    semaines, avec deux avancements concurrents.
    """
    cours_de(session, course_id, owner_id)

    quiz = session.scalars(
        select(Quiz).where(Quiz.course_id == course_id).order_by(Quiz.created_at)
    ).all()
    if not quiz:
        raise ErreurApplicative(
            "VALIDATION_ERROR",
            "Ce cours n'a pas encore de quiz : les cartes en sont derivees.",
            {"courseId": course_id},
        )

    connues = set(
        session.scalars(select(Carte.cle).where(Carte.course_id == course_id)).all()
    )

    creees = 0
    ignorees = 0
    for un_quiz in quiz:
        for question in un_quiz.payload.get("questions", []):
            cle = cle_enonce(question["question"])
            if not cle or cle in connues:
                ignorees += 1
                continue
            connues.add(cle)

            options = question["options"]
            index = question["correctIndex"]
            if not 0 <= index < len(options):
                # Une ligne ancienne, ecrite avant le schema de validation
                # actuel. On la saute plutot que de fabriquer une carte dont
                # le verso serait faux : une carte fausse revisee vingt fois
                # est pire que pas de carte du tout.
                ignorees += 1
                continue

            session.add(
                Carte(
                    course_id=course_id,
                    cle=cle,
                    recto=question["question"],
                    verso=options[index],
                    explication=question["explanation"],
                    citation=question.get("sourceQuote") or None,
                    facilite=2.5,
                    intervalle=0,
                    repetitions=0,
                    # Une carte neuve est due tout de suite : sans cela, un
                    # etudiant qui vient de fabriquer son jeu verrait un ecran
                    # vide et conclurait que la fonction ne marche pas.
                    due_le=_aujourd_hui(),
                    revisions=0,
                )
            )
            creees += 1

    session.commit()
    return {"creees": creees, "ignorees": ignorees, "appels": 0}


def a_reviser(session: Session, course_id: str, owner_id: str) -> list[Carte]:
    """Les cartes dues, les plus en retard d'abord."""
    cours_de(session, course_id, owner_id)
    return list(
        session.scalars(
            select(Carte)
            .where(Carte.course_id == course_id, Carte.due_le <= _aujourd_hui())
            .order_by(Carte.due_le, Carte.created_at)
            .limit(PAR_SESSION)
        ).all()
    )


def etat_du_jeu(session: Session, course_id: str, owner_id: str) -> dict:
    """
    Le compte des cartes, par categorie.

    « Dues » et « neuves » se recouvrent volontairement : une carte neuve est
    due. Les presenter comme deux parts d'un total donnerait une somme
    superieure au total, donc l'interface les montre comme deux lectures du
    meme jeu, pas comme une repartition.
    """
    cours_de(session, course_id, owner_id)

    def compter(*conditions) -> int:
        return (
            session.scalar(
                select(func.count())
                .select_from(Carte)
                .where(Carte.course_id == course_id, *conditions)
            )
            or 0
        )

    return {
        "total": compter(),
        "dues": compter(Carte.due_le <= _aujourd_hui()),
        "neuves": compter(Carte.repetitions == 0),
        "acquises": compter(Carte.intervalle >= INTERVALLE_ACQUIS),
    }


def reviser(session: Session, carte_id: str, owner_id: str, bouton: str) -> Carte:
    """Applique une note a une carte et calcule sa prochaine echeance."""
    if bouton not in NOTES:
        raise ErreurApplicative(
            "VALIDATION_ERROR",
            "Note inconnue.",
            {"attendu": sorted(NOTES), "recu": bouton},
        )

    carte = session.get(Carte, carte_id)
    if carte is None:
        raise ErreurApplicative("NOT_FOUND", "Carte introuvable.")
    # La carte n'a pas de proprietaire a elle : c'est le cours qui en porte un.
    cours_de(session, carte.course_id, owner_id)

    note = NOTES[bouton]
    apres = suivant(_etat_de(carte), note)

    carte.facilite = apres.facilite
    carte.intervalle = apres.intervalle
    carte.repetitions = apres.repetitions
    carte.due_le = _echeance(apres)
    carte.revisions += 1
    carte.derniere_note = note

    session.commit()
    session.refresh(carte)
    return carte


def reinitialiser(session: Session, course_id: str, owner_id: str) -> int:
    """
    Remet tout le jeu a zero. Destructif, donc explicite.

    Utile apres un examen passe, quand l'etudiant veut reprendre le cours a
    neuf. Les cartes ne sont pas supprimees — seulement leur avancement — pour
    ne pas avoir a les refabriquer.
    """
    cours_de(session, course_id, owner_id)
    depart = etat_initial()
    cartes = list(
        session.scalars(select(Carte).where(Carte.course_id == course_id)).all()
    )
    for carte in cartes:
        carte.facilite = depart.facilite
        carte.intervalle = depart.intervalle
        carte.repetitions = depart.repetitions
        carte.due_le = _aujourd_hui()
        carte.revisions = 0
        carte.derniere_note = None
    session.commit()
    return len(cartes)
