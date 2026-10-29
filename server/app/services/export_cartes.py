"""
Export du jeu de cartes : Anki et PDF (decision 051).

Un etudiant qui revise deja avec Anki ne quittera pas ses habitudes pour un
nouvel outil ; lui laisser emporter ses cartes, c'est ce qui le fait essayer
StudyAI. Le PDF, lui, sert a reviser sur papier.

AUCUN APPEL AU MODELE : les cartes existent deja en base.

LE FORMAT ANKI est le texte a colonnes separees par des tabulations, avec
les en-tetes que reconnait Anki depuis la version 2.1.55 (separateur, HTML,
colonne des etiquettes). C'est le format que l'import d'Anki propose par
defaut ; le paquet .apkg demanderait de fabriquer une base SQLite au format
interne d'Anki, pour un gain nul a l'usage.
"""

from __future__ import annotations

import html
import io
import re
import unicodedata
from datetime import datetime, timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..errors import ErreurApplicative
from ..models import Carte, Cours
from .fiche import BORDURE, MARQUE, SECONDAIRE, TEXTE, _echapper
from .study import cours_de


def nom_de_fichier(titre: str) -> str:
    """Un nom de fichier ASCII : les en-tetes HTTP n'acceptent rien d'autre."""
    ascii_ = unicodedata.normalize("NFKD", titre).encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Za-z0-9]+", "-", ascii_).strip("-").lower()[:60] or "cours"


def _cartes(session: Session, course_id: str, owner_id: str) -> tuple[Cours, list[Carte]]:
    cours = cours_de(session, course_id, owner_id)
    cartes = list(
        session.scalars(
            select(Carte).where(Carte.course_id == course_id).order_by(Carte.created_at)
        ).all()
    )
    if not cartes:
        raise ErreurApplicative(
            "VALIDATION_ERROR",
            "Ce cours n'a pas encore de cartes a exporter.",
            {"courseId": course_id},
        )
    return cours, cartes


def _cellule(texte: str) -> str:
    """Un champ Anki : HTML echappe, sans tabulation ni retour a la ligne bruts."""
    return html.escape(texte.strip(), quote=False).replace("\t", " ").replace("\r", "").replace("\n", "<br>")


def anki(session: Session, course_id: str, owner_id: str) -> tuple[bytes, str]:
    cours, cartes = _cartes(session, course_id, owner_id)
    etiquette = "StudyAI::" + (nom_de_fichier(cours.title) or "cours")
    lignes = ["#separator:tab", "#html:true", "#tags column:3"]
    for c in cartes:
        verso = _cellule(c.verso)
        if c.explication:
            verso += "<br><br>" + _cellule(c.explication)
        if c.citation:
            verso += "<br><br><i>« " + _cellule(c.citation) + " »</i>"
        lignes.append("\t".join([_cellule(c.recto), verso, etiquette]))
    contenu = "\n".join(lignes) + "\n"
    return contenu.encode("utf-8"), f"cartes-{nom_de_fichier(cours.title)}.txt"


def pdf(session: Session, course_id: str, owner_id: str) -> tuple[bytes, str]:
    """Un tableau question / reponse : se plie en deux pour s'interroger."""
    cours, cartes = _cartes(session, course_id, owner_id)

    def style(nom: str, **options) -> ParagraphStyle:
        return ParagraphStyle(nom, fontName=options.pop("fontName", "Helvetica"), **options)

    titre = style("titre", fontName="Helvetica-Bold", fontSize=18, leading=23, textColor=TEXTE)
    sous = style("sous", fontSize=9, leading=12, textColor=SECONDAIRE)
    entete = style("entete", fontName="Helvetica-Bold", fontSize=9.5, leading=12, textColor=colors.white)
    question = style("question", fontName="Helvetica-Bold", fontSize=10, leading=14, textColor=TEXTE)
    reponse = style("reponse", fontSize=10, leading=14, textColor=TEXTE)
    detail = style("detail", fontSize=8.5, leading=12, textColor=SECONDAIRE)

    lignes = [[Paragraph("Question", entete), Paragraph("Réponse", entete)]]
    for c in cartes:
        cote_verso = [Paragraph(_echapper(c.verso), reponse)]
        if c.explication:
            cote_verso.append(Spacer(1, 3))
            cote_verso.append(Paragraph(_echapper(c.explication), detail))
        if c.citation:
            cote_verso.append(Spacer(1, 3))
            cote_verso.append(Paragraph(f"<i>« {_echapper(c.citation)} »</i>", detail))
        lignes.append([Paragraph(_echapper(c.recto), question), cote_verso])

    tableau = Table(lignes, colWidths=[82 * mm, 92 * mm], repeatRows=1)
    tableau.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), MARQUE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.6, BORDURE),
                ("LINEAFTER", (0, 1), (0, -1), 1.2, SECONDAIRE),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )

    tampon = io.BytesIO()
    document = SimpleDocTemplate(
        tampon,
        pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=18 * mm, bottomMargin=18 * mm,
        title=f"Cartes de revision — {cours.title}",
        author="StudyAI",
    )
    document.build(
        [
            Paragraph(_echapper(cours.title), titre),
            Paragraph(
                _echapper(
                    f"{len(cartes)} cartes de révision · exportées le "
                    f"{datetime.now(timezone.utc).strftime('%d/%m/%Y')} · StudyAI"
                ),
                sous,
            ),
            Spacer(1, 10),
            tableau,
        ]
    )
    return tampon.getvalue(), f"cartes-{nom_de_fichier(cours.title)}.pdf"
