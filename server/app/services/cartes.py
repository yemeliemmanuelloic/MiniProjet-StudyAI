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

L'ARITHMETIQUE VIT AILLEURS, dans `fsrs.py` (decision 040 ; SM-2 jusqu'au
22 octobre), qui ne connait ni base ni horloge. Ici on ne fait que lire,
ecrire, mesurer le temps ecoule et convertir un intervalle en date.
"""

from __future__ import annotations

from datetime import datetime, time, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..errors import ErreurApplicative
from ..models import Carte, Quiz
from .enonces import SEUIL_REDITE, cle_enonce, sac_de_mots, similarite
from . import fsrs
from .fsrs import NOTES, Memoire
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


def _jours_ecoules(carte: Carte, aujourd_hui: datetime) -> int:
    """Jours entiers depuis la derniere revision ; 0 si elle est inconnue."""
    if carte.derniere_revision is None:
        return 0
    derniere = carte.derniere_revision
    if derniere.tzinfo is None:  # SQLite rend des dates sans fuseau
        derniere = derniere.replace(tzinfo=timezone.utc)
    return max(0, (aujourd_hui.date() - derniere.date()).days)


def _meme_reponse(a: frozenset[str], b: frozenset[str]) -> bool:
    """
    Deux versos apprennent-ils la meme chose ?

    L'inclusion, et pas seulement l'egalite : « 100€ » et « 100€/nuit » sont
    la meme reponse ecrite deux fois. Le risque de l'inclusion — « Paris »
    avale « Paris, Texas » — est borne par le fait qu'elle n'intervient
    qu'apres une similarite d'enonce deja elevee.
    """
    if not a or not b:
        return False
    return a <= b or b <= a


def _memoire_de(carte: Carte) -> Memoire | None:
    """Memoire FSRS de la carte, `None` si elle n'a jamais ete revue."""
    if carte.stabilite is None or carte.difficulte is None:
        return None
    return Memoire(stabilite=float(carte.stabilite), difficulte=float(carte.difficulte))


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

    # Deux filtres, et le second a failli etre faux.
    #
    # L'egalite de cle ne reconnait que deux enonces identiques apres
    # normalisation. Trois quiz successifs sur un meme cours posent la meme
    # question autrement : « Quel est le prix de base par nuit pour une
    # chambre standard » revient trois fois, avec la meme reponse. Mesure sur
    # un cours reel : 13 cartes, 5 paires au-dessus du seuil, toutes de
    # vraies redites.
    #
    # MAIS LA SIMILARITE DES ENONCES NE SUFFIT PAS A CONCLURE. Premiere
    # version de ce filtre, elle seule : dix tests sont tombes d'un coup.
    # Les questions d'un meme gabarit — « Question numero 1 », « Question
    # numero 2 » — partagent six mots sur sept, donc 0,86 de similarite, et
    # le filtre les ecartait toutes. C'est exactement la faute refusee en
    # DECISIONS 018 : un item valable supprime sans que personne le sache.
    #
    # LA REPONSE TRANCHE. Deux cartes ne font doublon que si elles
    # APPRENNENT LA MEME CHOSE. On exige donc, en plus, que les versos se
    # recouvrent — egaux, ou l'un contenu dans l'autre (« 100€ » et
    # « 100€/nuit »). Les questions d'un meme gabarit ont des reponses
    # differentes et survivent.
    #
    # NE PAS CREER N'EST PAS SUPPRIMER : les deux cartes porteraient la meme
    # reponse, donc aucune connaissance ne se perd. Le compte des cartes
    # ecartees est RENDU, pas tu.
    connues = set(
        session.scalars(select(Carte.cle).where(Carte.course_id == course_id)).all()
    )
    deja: list[tuple[frozenset[str], frozenset[str]]] = [
        (frozenset(c.cle.split()), sac_de_mots(c.verso))
        for c in session.scalars(
            select(Carte).where(Carte.course_id == course_id)
        ).all()
    ]

    creees = 0
    ignorees = 0
    for un_quiz in quiz:
        for question in un_quiz.payload.get("questions", []):
            cle = cle_enonce(question["question"])
            if not cle or cle in connues:
                ignorees += 1
                continue

            options = question["options"]
            index = question["correctIndex"]
            if not 0 <= index < len(options):
                # Une ligne ancienne, ecrite avant le schema de validation
                # actuel. On la saute plutot que de fabriquer une carte dont
                # le verso serait faux : une carte fausse revisee vingt fois
                # est pire que pas de carte du tout.
                ignorees += 1
                continue

            sac = sac_de_mots(question["question"])
            reponse = sac_de_mots(options[index])
            if any(
                similarite(sac, enonce) >= SEUIL_REDITE and _meme_reponse(reponse, verso)
                for enonce, verso in deja
            ):
                ignorees += 1
                continue

            connues.add(cle)
            deja.append((sac, reponse))

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


def remettre_les_erreurs(session: Session, course_id: str, ratees: list[dict]) -> int:
    """
    Les questions ratees a un quiz ou a un examen blanc reviennent en cartes,
    a reviser AUJOURD'HUI (decision 048). AUCUN APPEL.

    Une erreur est une information sur la memoire, la plus fiable qui soit :
    l'etudiant vient de l'echouer. Trois cas :
      - pas encore de carte pour cette question : elle est creee ;
      - une carte deja revue : l'erreur compte comme un oubli (note FSRS 1),
        sa stabilite baisse, elle revient aujourd'hui ;
      - une carte jamais revue : elle est simplement due aujourd'hui.
    La carte existante est retrouvee comme dans `materialiser` : meme cle, ou
    meme question reformulee avec la meme reponse.

    Ce n'est pas une revision de carte : le compteur de revisions n'avance pas.
    Rend le nombre de cartes remises en revision. L'appelant a deja verifie
    les droits sur le cours.
    """
    if not ratees:
        return 0
    aujourd_hui = _aujourd_hui()
    cartes = list(session.scalars(select(Carte).where(Carte.course_id == course_id)).all())
    par_cle = {c.cle: c for c in cartes}
    index = [(sac_de_mots(c.recto), sac_de_mots(c.verso), c) for c in cartes]

    vues: set[str] = set()
    for question in ratees:
        cle = cle_enonce(question["question"])
        options = question["options"]
        bonne = question["correctIndex"]
        if not cle or cle in vues or not 0 <= bonne < len(options):
            continue
        vues.add(cle)

        carte = par_cle.get(cle)
        if carte is None:
            sac, reponse = sac_de_mots(question["question"]), sac_de_mots(options[bonne])
            carte = next(
                (
                    c
                    for enonce, verso, c in index
                    if similarite(sac, enonce) >= SEUIL_REDITE and _meme_reponse(reponse, verso)
                ),
                None,
            )

        if carte is None:
            carte = Carte(
                course_id=course_id,
                cle=cle,
                recto=question["question"],
                verso=options[bonne],
                explication=question["explanation"],
                citation=question.get("sourceQuote") or None,
                facilite=2.5,
                intervalle=0,
                repetitions=0,
                revisions=0,
            )
            session.add(carte)
            par_cle[cle] = carte
            index.append((sac_de_mots(carte.recto), sac_de_mots(carte.verso), carte))
        else:
            avant = _memoire_de(carte)
            if avant is not None:
                apres = fsrs.revision(avant, NOTES["oublie"], _jours_ecoules(carte, aujourd_hui))
                carte.stabilite = round(apres.stabilite, 4)
                carte.difficulte = round(apres.difficulte, 4)
                carte.derniere_revision = aujourd_hui
                carte.derniere_note = NOTES["oublie"]
            carte.repetitions = 0
            carte.intervalle = 0
        carte.due_le = aujourd_hui

    session.commit()
    return len(vues)


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
    aujourd_hui = _aujourd_hui()
    avant = _memoire_de(carte)
    apres = (
        fsrs.premiere_revision(note)
        if avant is None
        else fsrs.revision(avant, note, _jours_ecoules(carte, aujourd_hui))
    )
    jours = fsrs.intervalle(apres.stabilite)

    carte.stabilite = round(apres.stabilite, 4)
    carte.difficulte = round(apres.difficulte, 4)
    carte.derniere_revision = aujourd_hui
    carte.intervalle = jours
    # Meme sens qu'avec SM-2 : un oubli remet la serie de reussites a zero,
    # et la carte compte de nouveau parmi les « neuves ».
    carte.repetitions = 0 if note == 1 else carte.repetitions + 1
    carte.due_le = aujourd_hui + timedelta(days=jours)
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
    cartes = list(
        session.scalars(select(Carte).where(Carte.course_id == course_id)).all()
    )
    for carte in cartes:
        carte.facilite = 2.5
        carte.intervalle = 0
        carte.repetitions = 0
        carte.stabilite = None
        carte.difficulte = None
        carte.derniere_revision = None
        carte.due_le = _aujourd_hui()
        carte.revisions = 0
        carte.derniere_note = None
    session.commit()
    return len(cartes)
