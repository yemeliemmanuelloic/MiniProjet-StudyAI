"""
Extraction du texte d'un support de cours : PDF, Word ou PowerPoint.

Aucun appel au modele ici. C'est une operation locale et gratuite, et cette
separation merite d'etre nommee en soutenance : on confond souvent
« l'application lit un diaporama » et « l'IA lit un diaporama ».

POURQUOI CES TROIS FORMATS. Les supports de ce module sont distribues en
.pptx (le cours) et en .docx (les ateliers) ; le PDF est l'exception. Se
limiter au PDF obligeait l'etudiant a convertir chaque fichier a la main
avant de pouvoir s'en servir — un travail que la machine fait mieux.

LE CHOIX DU LECTEUR SE FAIT SUR L'EXTENSION, PAS SUR LE TYPE MIME. Le
navigateur annonce un type que le systeme d'exploitation lui souffle, et
Windows envoie regulierement application/octet-stream pour un .pptx selon
l'application qui a cree le fichier. L'extension, elle, est ce que
l'etudiant voit. Le format reel est verifie juste apres, par le lecteur
lui-meme : python-docx et python-pptx refusent une archive qui n'est pas le
paquet attendu. L'extension oriente, le lecteur tranche.
"""

from __future__ import annotations

import io
import re

from ..errors import ErreurApplicative
from .pdf import SEUIL_TEXTE_UTILE, extraire_texte as _lire_pdf

# python-pptx represente un saut de ligne interne (<a:br>) par \x0b dans
# .text. Non traduit, ce caractere part tel quel vers le modele.
_SAUT_INTERNE = re.compile(r"[\x0b\x0c]")
_LIGNES_VIDES = re.compile(r"\n{3,}")

#: Caracteres invisibles, et pourquoi ils ne sont pas un detail cosmetique.
#: Prompt Engineering.pptx contient des espaces de largeur nulle (​) au
#: milieu des mots — invisibles a l'oeil, mais ils brisent un mot en deux pour
#: toute comparaison de chaines. Consequence directe sur ce projet : une
#: citation de quiz fidele echoue au controle d'ancrage, et le decoupage en
#: mots de BM25 produit des jetons fantomes. Les espaces insecables, eux, sont
#: ramenes a l'espace ordinaire : c'est ce qui permet au masquage de
#: reconnaitre « +216 55 123 456 » ecrit avec des insecables.
_INVISIBLES = re.compile(r"[​‌‍﻿­]")
_ESPACES_INSECABLES = re.compile(r"[   ]")

#: Un cadre de texte ne contenant qu'un nombre court est un numero de diapo.
#: Sans ce filtre, les 54 diapos de Chapitre5.pptx injectent 54 chiffres
#: orphelins au milieu du cours. La borne de longueur protege le cas « 3 » mais
#: laisse passer « 2026 » : un nombre de quatre chiffres reste ecarte, ce qui est
#: assume — un cadre de texte isole ne contenant que « 2026 » n'apporte rien.
_NUMERO_SEUL = re.compile(r"^\d{1,4}$")


def _propre(texte: str) -> str:
    texte = _INVISIBLES.sub("", texte)
    texte = _ESPACES_INSECABLES.sub(" ", texte)
    return _SAUT_INTERNE.sub("\n", texte).strip()


# --- Word --------------------------------------------------------------------


def _blocs_docx(document):
    """
    Parcourt le corps du document DANS SON ORDRE REEL.

    DEFAUT EVITE : `document.paragraphs` ignore silencieusement tout ce qui se
    trouve dans un tableau, et `document.tables` ignore les paragraphes. Lire
    l'un puis l'autre perd l'ordre, lire seulement le premier perd le contenu.
    Sur Atelier 3.docx, le tableau porte 271 caracteres sur 1 602, soit 17 % du
    support — et dans un atelier, un tableau est justement la grille de
    notation ou la liste des livrables, ce que l'etudiant interrogera.
    """
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    for enfant in document.element.body.iterchildren():
        if enfant.tag.endswith("}p"):
            yield Paragraph(enfant, document)
        elif enfant.tag.endswith("}tbl"):
            yield Table(enfant, document)


def _rendre_tableau(tableau) -> str:
    lignes: list[str] = []
    for rangee in tableau.rows:
        cellules: list[str] = []
        for cellule in rangee.cells:
            valeur = _propre(cellule.text).replace("\n", " ")
            # Une cellule fusionnee horizontalement est rendue autant de fois
            # qu'elle couvre de colonnes : on ne garde que la premiere.
            if cellules and cellules[-1] == valeur:
                continue
            cellules.append(valeur)
        # Les cellules vides de bord sont retirees : l'en-tete d'Atelier 3.docx
        # est un tableau dont la premiere cellule ne contient qu'un logo, et le
        # rendu commencait par une barre verticale orpheline. Les cellules vides
        # INTERIEURES sont conservees : dans une grille de notation, une case
        # vide est une information.
        while cellules and not cellules[0]:
            cellules.pop(0)
        while cellules and not cellules[-1]:
            cellules.pop()
        if cellules:
            lignes.append(" | ".join(cellules))
    return "\n".join(lignes)


def _lire_docx(contenu: bytes) -> str:
    import docx
    from docx.table import Table

    try:
        document = docx.Document(io.BytesIO(contenu))
    except Exception as erreur:
        raise ErreurApplicative(
            "VALIDATION_ERROR", "Fichier Word illisible ou endommage."
        ) from erreur

    morceaux: list[str] = []
    for bloc in _blocs_docx(document):
        rendu = (
            _rendre_tableau(bloc) if isinstance(bloc, Table) else _propre(bloc.text)
        )
        if rendu:
            morceaux.append(rendu)

    return "\n\n".join(morceaux)


# --- PowerPoint --------------------------------------------------------------


def _formes_ordonnees(formes):
    """
    Rend les formes dans l'ordre de lecture, et non dans l'ordre d'empilement.

    DEFAUT EVITE : `slide.shapes` suit l'ordre z, c'est-a-dire l'ordre dans
    lequel l'auteur a depose les formes. Sur la diapo 2 de Chapitre5.pptx, cela
    donne titre, puis NUMERO DE PAGE (en bas), puis image, puis corps du texte.
    Le resume heriterait d'un texte ou chaque titre est suivi d'un chiffre.
    Trier par (haut, gauche) retablit l'ordre que l'oeil suit.

    Un groupe est traite comme un bloc, a la position du groupe : ses enfants
    ont des coordonnees exprimees dans le repere du groupe, qui ne sont pas
    comparables a celles de la diapo.
    """
    rangees = sorted(formes, key=lambda f: (f.top or 0, f.left or 0))
    for forme in rangees:
        if forme.shape_type is not None and str(forme.shape_type).startswith("GROUP"):
            yield from _formes_ordonnees(forme.shapes)
        else:
            yield forme


def _texte_forme(forme) -> str:
    if getattr(forme, "has_table", False):
        return "\n".join(
            " | ".join(_propre(c.text).replace("\n", " ") for c in rangee.cells)
            for rangee in forme.table.rows
        )
    if not forme.has_text_frame:
        return ""
    texte = _propre(forme.text_frame.text)
    if _NUMERO_SEUL.match(texte):
        return ""
    return texte


def _lire_pptx(contenu: bytes) -> str:
    import pptx

    try:
        presentation = pptx.Presentation(io.BytesIO(contenu))
    except Exception as erreur:
        raise ErreurApplicative(
            "VALIDATION_ERROR", "Fichier PowerPoint illisible ou endommage."
        ) from erreur

    diapos: list[str] = []
    for numero, diapo in enumerate(presentation.slides, start=1):
        corps = [t for forme in _formes_ordonnees(diapo.shapes) if (t := _texte_forme(forme))]

        # LES NOTES SONT INCLUSES, et c'est une decision de fond. Sur un
        # diaporama de cours, les puces sont telegraphiques et l'explication
        # vit dans les notes de l'orateur : 42 diapos sur 50 en portent dans
        # seance1-Introduction.pptx. Les ecarter, c'est resumer le squelette
        # d'un cours en ignorant le cours.
        if diapo.has_notes_slide:
            notes = _propre(diapo.notes_slide.notes_text_frame.text)
            if notes:
                corps.append(f"[Notes de l'orateur] {notes}")

        if corps:
            # Le numero de diapo est conserve en tete : c'est la seule reference
            # que l'etudiant peut rouvrir dans son propre fichier, et le tuteur
            # s'en sert pour citer ses sources.
            diapos.append(f"--- Diapositive {numero} ---\n" + "\n".join(corps))

    return "\n\n".join(diapos)


# --- Texte brut ---------------------------------------------------------------


def _lire_texte(contenu: bytes) -> str:
    """
    Lit un fichier texte ou Markdown.

    POURQUOI UN LECTEUR DEDIE pour ce qui est deja du texte : l'encodage. Un
    fichier produit sous Windows est souvent en cp1252, et le decoder en UTF-8
    leve une exception sur le premier caractere accentue — soit, dans un cours
    francais, a la premiere ligne. Un `.read().decode()` optimiste echouerait
    donc precisement sur les supports de ce module.

    L'ordre des tentatives n'est pas indifferent : UTF-8 d'abord parce qu'un
    texte valide en UTF-8 l'est rarement par hasard, cp1252 ensuite parce
    qu'il accepte presque n'importe quel octet et ne leve donc jamais. Le
    tester en premier reviendrait a ne jamais essayer UTF-8.
    """
    for encodage in ("utf-8-sig", "utf-8", "cp1252"):
        try:
            return contenu.decode(encodage)
        except UnicodeDecodeError:
            continue
    # latin-1 accepte tout octet : dernier recours plutot qu'un refus.
    return contenu.decode("latin-1", errors="replace")


# --- Repartition -------------------------------------------------------------

LECTEURS = {
    ".pdf": _lire_pdf,
    ".docx": _lire_docx,
    ".pptx": _lire_pptx,
    # Le Markdown n'est pas converti : ses marques (#, *, -) sont du texte que
    # le modele lit tres bien, et les retirer couterait une dependance pour
    # perdre la structure des titres.
    ".txt": _lire_texte,
    ".md": _lire_texte,
}

#: Les formats binaires d'avant 2007. Aucune bibliotheque Python pure ne les
#: lit ; refuser en nommant le remede vaut mieux qu'un echec obscur.
ANCIENS = {
    ".doc": "Word",
    ".ppt": "PowerPoint",
    ".odt": "LibreOffice",
    ".odp": "LibreOffice",
}

#: Formats sans couche texte, lus par un modele avec l'accord de l'etudiant
#: (decision 043). L'audio et la video sont transcrits par Whisper ; les
#: images, lues par Gemini. Le type MIME est fixe ici, pas pris du navigateur.
AUDIO = {
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
    ".webm": "audio/webm",
    ".mp4": "video/mp4",
    ".mpeg": "video/mpeg",
    ".mpga": "audio/mpeg",
}
IMAGES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".heic": "image/heic",
}

EXTENSIONS = tuple(LECTEURS) + tuple(AUDIO) + tuple(IMAGES)


def extension_de(nom: str | None) -> str:
    point = (nom or "").rfind(".")
    return (nom or "")[point:].lower() if point != -1 else ""


def verifier_format(nom_fichier: str | None) -> str:
    """
    Verifie que l'extension est lisible, et rend l'extension reconnue.

    Separe de extraire() pour pouvoir etre appele AVANT la lecture des octets :
    refuser un format inconnu apres avoir mis 25 Mo en tampon annulerait la
    correction apportee le 13 octobre sur le controle de taille.
    """
    extension = extension_de(nom_fichier)

    if extension in ANCIENS:
        raise ErreurApplicative(
            "VALIDATION_ERROR",
            f"Le format {extension} n'est pas lisible. Ouvrez le fichier dans "
            f"{ANCIENS[extension]} et enregistrez-le en "
            f"{'.docx' if extension in ('.doc', '.odt') else '.pptx'}.",
            {"extension": extension},
        )

    if extension not in LECTEURS and extension not in AUDIO and extension not in IMAGES:
        raise ErreurApplicative(
            "VALIDATION_ERROR",
            "Format non reconnu. Formats acceptes : PDF, Word (.docx), "
            "PowerPoint (.pptx), texte (.txt), Markdown (.md), enregistrements "
            "audio ou video (.mp3, .m4a, .wav, .mp4...) et photos (.jpg, .png...).",
            {"extension": extension, "acceptes": list(EXTENSIONS)},
        )

    return extension


def extraire(nom_fichier: str | None, contenu: bytes) -> str:
    """
    Extrait le texte d'un support, en choisissant le lecteur sur l'extension.

    Leve VALIDATION_ERROR si le format n'est pas reconnu, si le fichier est
    endommage, ou si le texte obtenu est trop maigre pour etre exploitable.
    """
    extension = verifier_format(nom_fichier)
    texte = LECTEURS[extension](contenu)

    # Le lecteur PDF pose deja ce controle, avec son propre message : un PDF
    # sans texte est un PDF scanne, ce qui n'a pas d'equivalent ici.
    if extension != ".pdf":
        texte = _LIGNES_VIDES.sub("\n\n", texte).strip()
        if len(texte) < SEUIL_TEXTE_UTILE:
            raise ErreurApplicative(
                "VALIDATION_ERROR",
                "Aucun texte exploitable dans ce fichier. Un document qui ne "
                "contient que des images n'est pas lisible : collez le texte "
                "a la main.",
                {"caracteres": len(texte)},
            )

    return texte
