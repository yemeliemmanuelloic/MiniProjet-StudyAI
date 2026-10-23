"""
Bibliotheque de cours.

Importer un cours, c'est enregistrer du texte. Les trois modules IA vivent
dans routers/study.py. UNE EXCEPTION depuis le 23 octobre (decision 043) :
un enregistrement, un PDF scanne ou une photo n'ont pas de texte ; ils sont
lus par un modele (Whisper, Gemini), avec l'accord explicite de l'etudiant,
et cette lecture compte dans son quota d'analyses.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import parametres
from ..db import obtenir_session
from ..debit import limiter_appels_modele
from ..llm import pipeline
from ..errors import ErreurApplicative
from ..models import Cours, Message, Quiz, Resume
from ..schemas.api import (
    ComptesSortie,
    CoursEntree,
    CoursResumeSortie,
    CoursSortie,
    ModeleApi,
)
from ..security import Authentifie
from ..services.extraction import AUDIO, IMAGES, extraire, verifier_format
from ..services.pdf import SEUIL_TEXTE_UTILE
from ..services.study import cours_de, empreinte

routeur = APIRouter(prefix="/api/courses", tags=["Cours"])

BaseDeDonnees = Annotated[Session, Depends(obtenir_session)]

# La limite porte sur le fichier transmis, pas sur le texte extrait, et un
# diaporama est tres defavorable sur ce rapport : seance1-Introduction.pptx
# pese 4,6 Mo pour 29 000 caracteres de texte, soit 160 octets par caractere
# utile — le reste est en images. Ce support passait sous l'ancien plafond de
# 8 Mo, mais sans marge : un diaporama un peu plus illustre serait refuse pour
# une raison qui n'a rien a voir avec son contenu.
TAILLE_MAX_FICHIER = 25 * 1024 * 1024


class ListeCours(ModeleApi):
    courses: list[CoursResumeSortie]


class UnCours(ModeleApi):
    course: CoursSortie


@routeur.get("", response_model=ListeCours)
def lister(identifiant: Authentifie, session: BaseDeDonnees) -> ListeCours:
    """Liste des cours de l'etudiant, sans le contenu : inutile et volumineux."""
    def compteur(modele: type) -> object:
        # Les colonnes sont nommees explicitement : sans `label`, SQLAlchemy
        # expose la sous-requete sous le nom de l'attribut Python et non sous
        # celui de la colonne, ce qui casse la jointure a l'execution.
        return (
            select(
                modele.course_id.label("cours"), func.count().label("total")
            )
            .group_by(modele.course_id)
            .subquery()
        )

    sous_resumes = compteur(Resume)
    sous_quiz = compteur(Quiz)
    sous_messages = compteur(Message)

    lignes = session.execute(
        select(
            Cours,
            func.coalesce(sous_resumes.c.total, 0),
            func.coalesce(sous_quiz.c.total, 0),
            func.coalesce(sous_messages.c.total, 0),
        )
        .outerjoin(sous_resumes, sous_resumes.c.cours == Cours.id)
        .outerjoin(sous_quiz, sous_quiz.c.cours == Cours.id)
        .outerjoin(sous_messages, sous_messages.c.cours == Cours.id)
        .where(Cours.owner_id == identifiant)
        .order_by(Cours.created_at.desc())
    ).all()

    return ListeCours(
        courses=[
            CoursResumeSortie(
                id=cours.id,
                title=cours.title,
                subject=cours.subject,
                char_count=cours.char_count,
                created_at=cours.created_at,
                compte=ComptesSortie(summaries=nr, quizzes=nq, messages=nm),
            )
            for cours, nr, nq, nm in lignes
        ]
    )


@routeur.get("/{course_id}", response_model=UnCours)
def detail(course_id: str, identifiant: Authentifie, session: BaseDeDonnees) -> UnCours:
    return UnCours(course=CoursSortie.model_validate(cours_de(session, course_id, identifiant)))


def _verifier_longueur(contenu: str) -> str:
    """
    Refuse un cours trop long au lieu de le couper.

    DEFAUT CORRIGE le 13 octobre : la ligne precedente etait
    `contenu[: parametres.MAX_COURSE_CHARS]`. Un cours de 476 000 caracteres
    etait accepte avec un HTTP 201 serein, et 276 000 caracteres partaient en
    silence. C'est exactement le defaut que le decoupage avait corrige plus
    loin dans la chaine — mais a l'import, la ou l'utilisateur regarde.

    Refuser plutot que tronquer : l'etudiant sait ce qu'il doit faire, au lieu
    de croire son cours complet.
    """
    if len(contenu) > parametres.MAX_COURSE_CHARS:
        trop = len(contenu) - parametres.MAX_COURSE_CHARS
        raise ErreurApplicative(
            "VALIDATION_ERROR",
            f"Ce cours fait {len(contenu)} caracteres, soit {trop} de trop : la "
            f"limite est de {parametres.MAX_COURSE_CHARS}. Decoupez-le en "
            f"plusieurs cours — le resume et le quiz y gagneront en precision.",
            {"caracteres": len(contenu), "limite": parametres.MAX_COURSE_CHARS},
        )
    return contenu


@routeur.post("", response_model=UnCours, status_code=201)
def creer(entree: CoursEntree, identifiant: Authentifie, session: BaseDeDonnees) -> UnCours:
    contenu = _verifier_longueur(entree.content.strip())

    cours = Cours(
        owner_id=identifiant,
        title=entree.title,
        subject=entree.subject,
        content=contenu,
        char_count=len(contenu),
        hash=empreinte(contenu),
    )
    session.add(cours)
    session.commit()
    session.refresh(cours)
    return UnCours(course=CoursSortie.model_validate(cours))


#: Limite des fichiers joints tels quels a une requete Gemini (environ 20 Mo
#: pour la requete entiere, base64 compris : 14 Mo de fichier y tiennent).
TAILLE_MAX_LECTURE = 14 * 1024 * 1024

_NATURE = {"enregistrement": "un enregistrement", "document": "un document scanne ou une photo"}


def _consentement_requis(nature: str) -> ErreurApplicative:
    destinataire = "Groq (Whisper)" if nature == "enregistrement" else "Google (Gemini)"
    return ErreurApplicative(
        "VALIDATION_ERROR",
        f"Ce fichier est {_NATURE[nature]} : pour en obtenir le texte, il doit "
        f"etre envoye tel quel a {destinataire}, AVANT tout masquage des "
        "donnees personnelles. Confirmez pour continuer.",
        {"consentement_requis": nature},
    )


def _lire_par_modele(identifiant: str, contenu: bytes, type_mime: str) -> str:
    if len(contenu) > TAILLE_MAX_LECTURE:
        raise ErreurApplicative(
            "VALIDATION_ERROR",
            "Document trop volumineux pour etre lu par l'IA (14 Mo maximum). "
            "Decoupez-le, ou reduisez la resolution des images.",
        )
    limiter_appels_modele(identifiant)
    return pipeline.lire_document_image(contenu, type_mime)


def _assez_de_texte(texte: str) -> str:
    """Une lecture par le modele doit rendre de quoi faire un cours."""
    texte = texte.strip()
    if len(texte) < SEUIL_TEXTE_UTILE:
        raise ErreurApplicative(
            "VALIDATION_ERROR",
            "Trop peu de texte a ete reconnu dans ce fichier pour en faire un cours.",
            {"caracteres": len(texte)},
        )
    return texte


def _texte_du_fichier(
    identifiant: str, nom: str | None, extension: str, contenu: bytes, consentement: bool
) -> str:
    """Le texte d'un fichier : lu localement, ou par un modele avec accord."""
    if extension in AUDIO:
        if not consentement:
            raise _consentement_requis("enregistrement")
        limiter_appels_modele(identifiant)
        return _assez_de_texte(pipeline.transcrire_audio(contenu, nom or f"cours{extension}"))
    if extension in IMAGES:
        if not consentement:
            raise _consentement_requis("document")
        return _assez_de_texte(_lire_par_modele(identifiant, contenu, IMAGES[extension]))
    try:
        return extraire(nom, contenu)
    except ErreurApplicative as erreur:
        # Un PDF sans couche texte est un scan : il peut etre lu par le
        # modele, mais seulement si l'etudiant l'a accepte.
        if not erreur.details.get("scanne") or not consentement:
            raise
        return _assez_de_texte(_lire_par_modele(identifiant, contenu, "application/pdf"))


@routeur.post("/import", response_model=UnCours, status_code=201)
def importer(
    identifiant: Authentifie,
    session: BaseDeDonnees,
    file: Annotated[UploadFile, File()],
    title: Annotated[str | None, Form()] = None,
    subject: Annotated[str | None, Form()] = None,
    consentement: Annotated[bool, Form()] = False,
) -> UnCours:
    """
    Import d'un support : PDF a couche texte, Word (.docx) ou PowerPoint (.pptx).

    L'extraction n'appelle PAS le modele — c'est une lecture locale et gratuite.
    Le format est reconnu a l'extension, et verifie par le lecteur lui-meme :
    voir services/extraction.py, qui explique pourquoi le type MIME annonce par
    le navigateur n'est pas fiable pour les formats Office.
    """
    # Deux controles avant de lire le moindre octet : le format, puis la
    # taille. Un .zip de 24 Mo est refuse sans avoir ete mis en tampon.
    extension = verifier_format(file.filename)

    # La taille est verifiee AVANT la lecture : sinon un fichier de 200 Mo est
    # entierement mis en tampon avant d'etre refuse.
    if file.size is not None and file.size > TAILLE_MAX_FICHIER:
        raise ErreurApplicative(
            "VALIDATION_ERROR", "Fichier trop volumineux (25 Mo maximum)."
        )
    contenu = file.file.read()
    if len(contenu) > TAILLE_MAX_FICHIER:
        raise ErreurApplicative(
            "VALIDATION_ERROR", "Fichier trop volumineux (25 Mo maximum)."
        )

    texte = _verifier_longueur(
        _texte_du_fichier(identifiant, file.filename, extension, contenu, consentement)
    )
    nom = (title or "").strip() or (file.filename or "Cours").removesuffix(extension)

    cours = Cours(
        owner_id=identifiant,
        title=nom[:300],
        subject=(subject or "").strip() or None,
        content=texte,
        char_count=len(texte),
        hash=empreinte(texte),
    )
    session.add(cours)
    session.commit()
    session.refresh(cours)
    return UnCours(course=CoursSortie.model_validate(cours))


@routeur.delete("/{course_id}", status_code=204)
def supprimer(course_id: str, identifiant: Authentifie, session: BaseDeDonnees) -> None:
    cours = cours_de(session, course_id, identifiant)
    session.delete(cours)
    session.commit()
