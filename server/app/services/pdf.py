"""
Extraction du texte d'un PDF.

Aucun appel au modele ici : c'est une operation locale et gratuite, separee
des trois modules IA. Elle merite d'etre nommee en soutenance, parce qu'on
confond souvent « l'application lit un PDF » et « l'IA lit un PDF ».

PyMuPDF plutot qu'une bibliotheque plus simple : sur un support de cours, la
mise en page a deux colonnes est frequente, et un extracteur naif melange les
colonnes ligne a ligne, produisant un texte illisible — que le modele resumera
pourtant sans broncher. Le mode "blocks" respecte l'ordre de lecture.
"""

from __future__ import annotations

import pymupdf

from ..errors import ErreurApplicative

# En deca, il n'y a pas de couche texte exploitable : le PDF est une image.
SEUIL_TEXTE_UTILE = 200


def extraire_texte(contenu: bytes) -> str:
    try:
        document = pymupdf.open(stream=contenu, filetype="pdf")
    except Exception as erreur:  # pragma: no cover - depend du fichier fourni
        raise ErreurApplicative(
            "VALIDATION_ERROR", "Fichier PDF illisible ou endommage."
        ) from erreur

    morceaux: list[str] = []
    with document:
        for page in document:
            # sort=True retablit l'ordre de lecture a partir de la geometrie des
            # blocs, au lieu de suivre l'ordre d'ecriture dans le fichier.
            morceaux.append(page.get_text("text", sort=True))

    texte = "\n\n".join(m.strip() for m in morceaux if m.strip()).strip()

    if len(texte) < SEUIL_TEXTE_UTILE:
        raise ErreurApplicative(
            "VALIDATION_ERROR",
            "Aucun texte exploitable. Un PDF scanne (image) n'est pas supporte.",
        )

    return texte
