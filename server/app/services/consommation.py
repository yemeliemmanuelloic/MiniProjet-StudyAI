"""
Ce que l'IA a coute : jetons, appels, latence, estimation en argent.

POURQUOI CETTE PAGE EXISTE. Toute la telemetrie etait deja enregistree a
chaque operation — modele, version de prompt, temperature, jetons en entree et
en sortie, latence — et n'apparaissait NULLE PART dans l'interface. Des
donnees collectees que personne ne regarde ne servent a rien ; pire, elles
donnent l'illusion d'une mesure.

Sur un module intitule « IA for Software Engineering », savoir ce qu'un appel
coute n'est pas un detail d'exploitation : c'est une partie du sujet. Et sur
un palier gratuit, c'est la seule facon pour l'etudiant de savoir ou il en est
avant de tomber sur un quota epuise en pleine revision.

AUCUN APPEL AU MODELE ici : tout est lu en base.

CE QUE CE MODULE NE SAIT PAS, et le dit :
  - le nombre d'appels des operations ANTERIEURES au 13 octobre. La colonne
    `calls` n'existait pas ; elles sont comptees a part plutot qu'estimees ;
  - le nombre de resumes servis depuis le cache. Rien ne l'enregistre. Nous
    ne l'inventons pas : la section « gratuit » ne montre que ce qui est
    reellement compte.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import parametres
from ..models import (
    CarteMentale,
    CopieOuverte,
    Cours,
    Examen,
    Message,
    Presentation,
    QuestionsOuvertes,
    Quiz,
    Traduction,
    Resume,
)

#: Les trois tables qui portent de la telemetrie, avec le nom lisible du
#: module et le lien vers le cours. L'examen blanc n'y figure pas : il ne
#: coute rien, et c'est justement ce que la page veut montrer.
MODULES = (
    ("Resume", Resume),
    ("Quiz", Quiz),
    ("Tuteur", Message),
    ("Presentation", Presentation),
    ("Carte mentale", CarteMentale),
    ("Questions ouvertes", QuestionsOuvertes),
    ("Correction", CopieOuverte),
    ("Traduction", Traduction),
)


def _cout(tokens_in: int, tokens_out: int) -> float:
    return round(
        tokens_in / 1_000_000 * parametres.PRIX_ENTREE_PAR_MILLION
        + tokens_out / 1_000_000 * parametres.PRIX_SORTIE_PAR_MILLION,
        6,
    )


def _ligne(nom: str, donnees) -> dict:
    operations, appels, sans_compte, entree, sortie, latence, maxi = donnees
    return {
        "module": nom,
        "operations": operations or 0,
        # Somme des appels CONNUS. Les lignes sans decompte sont comptees a
        # part : les additionner comme si elles valaient un appel donnerait un
        # total faux en l'annoncant exact.
        "calls": int(appels or 0),
        "operationsSansDecompte": sans_compte or 0,
        "tokensIn": int(entree or 0),
        "tokensOut": int(sortie or 0),
        "latenceMoyenneMs": round(latence) if latence else None,
        "latenceMaxMs": maxi,
        "cout": _cout(int(entree or 0), int(sortie or 0)),
    }


def tableau(session: Session, owner_id: str) -> dict:
    """Consommation de l'etudiant, par module, par cours et par modele."""
    par_module: list[dict] = []

    for nom, modele in MODULES:
        donnees = session.execute(
            select(
                func.count(modele.id),
                func.sum(modele.calls),
                # Compte des lignes dont le nombre d'appels est inconnu.
                func.count(modele.id) - func.count(modele.calls),
                func.sum(modele.tokens_in),
                func.sum(modele.tokens_out),
                func.avg(modele.latency_ms),
                func.max(modele.latency_ms),
            )
            .join(Cours, Cours.id == modele.course_id)
            .where(Cours.owner_id == owner_id, modele.tokens_in.isnot(None))
        ).one()
        par_module.append(_ligne(nom, donnees))

    total_entree = sum(l["tokensIn"] for l in par_module)
    total_sortie = sum(l["tokensOut"] for l in par_module)

    return {
        "parModule": par_module,
        "total": {
            "operations": sum(l["operations"] for l in par_module),
            "calls": sum(l["calls"] for l in par_module),
            "operationsSansDecompte": sum(
                l["operationsSansDecompte"] for l in par_module
            ),
            "tokensIn": total_entree,
            "tokensOut": total_sortie,
            "cout": _cout(total_entree, total_sortie),
        },
        "parCours": _par_cours(session, owner_id),
        "parModele": _par_modele(session, owner_id),
        "gratuit": _gratuit(session, owner_id),
        "tarif": {
            "entreeParMillion": parametres.PRIX_ENTREE_PAR_MILLION,
            "sortieParMillion": parametres.PRIX_SORTIE_PAR_MILLION,
            "devise": parametres.DEVISE,
            # Affiche a cote du montant : une estimation dont la source n'est
            # pas visible se lit comme un fait.
            "source": parametres.TARIF_SOURCE,
        },
    }


def _par_cours(session: Session, owner_id: str) -> list[dict]:
    """Quel cours a coute le plus cher. Les trois modules sont additionnes."""
    cumul: dict[str, dict] = {}

    for _, modele in MODULES:
        lignes = session.execute(
            select(
                Cours.id,
                Cours.title,
                func.sum(modele.tokens_in),
                func.sum(modele.tokens_out),
                func.count(modele.id),
            )
            .join(modele, modele.course_id == Cours.id)
            .where(Cours.owner_id == owner_id, modele.tokens_in.isnot(None))
            .group_by(Cours.id, Cours.title)
        ).all()

        for identifiant, titre, entree, sortie, operations in lignes:
            ligne = cumul.setdefault(
                identifiant,
                {
                    "courseId": identifiant,
                    "courseTitle": titre,
                    "tokensIn": 0,
                    "tokensOut": 0,
                    "operations": 0,
                },
            )
            ligne["tokensIn"] += int(entree or 0)
            ligne["tokensOut"] += int(sortie or 0)
            ligne["operations"] += operations

    for ligne in cumul.values():
        ligne["cout"] = _cout(ligne["tokensIn"], ligne["tokensOut"])

    return sorted(cumul.values(), key=lambda c: c["cout"], reverse=True)


def _par_modele(session: Session, owner_id: str) -> list[dict]:
    """
    Quel modele a produit quoi.

    Rarement plus d'une ligne aujourd'hui, mais c'est exactement le tableau
    qui servira le jour d'une comparaison entre deux fournisseurs : la bascule
    se fait par une variable d'environnement, et l'historique garde la trace
    de qui a repondu.
    """
    cumul: dict[str, dict] = {}

    for _, modele in MODULES:
        lignes = session.execute(
            select(
                modele.model,
                func.count(modele.id),
                func.sum(modele.tokens_in),
                func.sum(modele.tokens_out),
                func.avg(modele.latency_ms),
            )
            .join(Cours, Cours.id == modele.course_id)
            .where(Cours.owner_id == owner_id, modele.tokens_in.isnot(None))
            .group_by(modele.model)
        ).all()

        for nom, operations, entree, sortie, latence in lignes:
            if nom is None:
                continue
            ligne = cumul.setdefault(
                nom,
                {
                    "model": nom,
                    "operations": 0,
                    "tokensIn": 0,
                    "tokensOut": 0,
                    "_latences": [],
                },
            )
            ligne["operations"] += operations
            ligne["tokensIn"] += int(entree or 0)
            ligne["tokensOut"] += int(sortie or 0)
            if latence:
                ligne["_latences"].append((float(latence), operations))

    sortie_finale = []
    for ligne in cumul.values():
        latences = ligne.pop("_latences")
        poids = sum(n for _, n in latences)
        ligne["latenceMoyenneMs"] = (
            round(sum(v * n for v, n in latences) / poids) if poids else None
        )
        ligne["cout"] = _cout(ligne["tokensIn"], ligne["tokensOut"])
        sortie_finale.append(ligne)

    return sorted(sortie_finale, key=lambda m: m["operations"], reverse=True)


def _gratuit(session: Session, owner_id: str) -> dict:
    """
    Ce qui a ete rendu SANS appeler le modele.

    Uniquement des chiffres reellement comptes. Le nombre de resumes servis
    depuis le cache serait le plus parlant — et n'est enregistre nulle part.
    Nous ne l'estimons pas : une economie inventee n'est pas une economie.
    """
    examens, questions = session.execute(
        select(func.count(Examen.id), func.sum(Examen.total)).where(
            Examen.owner_id == owner_id
        )
    ).one()

    # PAS de phrase d'explication ici. Elle y figurait, et le client
    # l'affichait telle quelle : la page passait en anglais sauf ce
    # paragraphe, reste en francais. De la prose d'interface n'a rien a faire
    # dans une reponse d'API — le client la possede et la traduit.
    return {
        "examens": examens or 0,
        "questionsServies": int(questions or 0),
    }
