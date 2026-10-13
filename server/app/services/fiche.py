"""
Fiche de revision imprimable.

Rassemble ce que l'application sait deja d'un cours — le resume le plus
recent, les questions ratees plusieurs fois, la progression — en un document
qu'on emporte avec soi. C'est le seul endroit du projet ou StudyAI produit
quelque chose qui quitte l'ecran.

AUCUN APPEL AU MODELE : tout le contenu existe deja en base.

POURQUOI reportlab plutot que la chaine Markdown -> Chrome de tools/md2pdf.py,
qui produit pourtant les documents du projet : cet outil convient a une
conversion lancee a la main, pas a une requete HTTP. Il depend de la presence
de Chrome sur la machine hote, et met plusieurs secondes. reportlab est une
bibliotheque Python pure, sans dependance systeme, et rend la main en quelques
dizaines de millisecondes. Voir docs/DECISIONS.md, decision 014.
"""

from __future__ import annotations

import io
from datetime import datetime, timezone

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..errors import ErreurApplicative
from ..models import Resume
from .revision import progression
from .study import cours_de

MARQUE = colors.HexColor("#c8102e")
TEXTE = colors.HexColor("#111827")
SECONDAIRE = colors.HexColor("#6b7280")
BORDURE = colors.HexColor("#e5e7eb")


def _styles() -> dict[str, ParagraphStyle]:
    """
    Styles du document.

    `textColor` est passe explicitement a chaque style plutot que mis dans un
    socle commun : reportlab refuse un argument fourni deux fois, et un socle
    qui le contient rend impossible de le surcharger.
    """
    base = getSampleStyleSheet()

    def style(nom, **options):
        return ParagraphStyle(
            nom,
            fontName=options.pop("fontName", "Helvetica"),
            alignment=TA_LEFT,
            **options,
        )

    return {
        "titre": ParagraphStyle(
            "titre", parent=base["Title"], fontName="Helvetica-Bold",
            fontSize=20, leading=25, textColor=TEXTE, alignment=TA_LEFT, spaceAfter=2,
        ),
        "soustitre": style("soustitre", fontSize=9.5, leading=13, textColor=SECONDAIRE),
        "section": ParagraphStyle(
            "section", parent=base["Heading2"], fontName="Helvetica-Bold",
            fontSize=12.5, leading=16, textColor=MARQUE, spaceBefore=16, spaceAfter=6,
        ),
        "corps": style("corps", fontSize=10, leading=15, textColor=TEXTE),
        "puce": style("puce", fontSize=10, leading=15, textColor=TEXTE, spaceAfter=3),
        "citation": style(
            "citation", fontSize=8.5, leading=12, textColor=SECONDAIRE,
            leftIndent=10, spaceAfter=8,
        ),
        "pied": style("pied", fontSize=8, leading=11, textColor=SECONDAIRE),
    }


def _echapper(texte: str) -> str:
    """reportlab interprete un sous-ensemble de XML dans les paragraphes."""
    return (
        texte.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    )


def construire(session: Session, course_id: str, owner_id: str) -> bytes:
    """
    Produit la fiche de revision d'un cours, en PDF.

    Echoue explicitement si le cours n'a jamais ete analyse : un document vide
    serait pire qu'un message d'erreur, parce que l'etudiant croirait que la
    fonction ne marche pas.
    """
    cours = cours_de(session, course_id, owner_id)

    resume = session.scalars(
        select(Resume)
        .where(Resume.course_id == course_id)
        .order_by(Resume.created_at.desc())
        .limit(1)
    ).first()
    progres = progression(session, course_id, owner_id)

    if resume is None and progres["attemptCount"] == 0:
        raise ErreurApplicative(
            "VALIDATION_ERROR",
            "Ce cours n'a encore ni resume ni quiz : la fiche serait vide. "
            "Generez un resume ou passez un quiz d'abord.",
        )

    s = _styles()
    tampon = io.BytesIO()
    document = SimpleDocTemplate(
        tampon,
        pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=18 * mm, bottomMargin=18 * mm,
        title=f"Fiche de revision — {cours.title}",
        author="StudyAI",
    )

    bloc: list = [
        Paragraph(_echapper(cours.title), s["titre"]),
        Paragraph(
            _echapper(
                f"{cours.subject or 'Sans matiere'}  ·  fiche de revision generee le "
                f"{datetime.now(timezone.utc).strftime('%d/%m/%Y')}  ·  StudyAI"
            ),
            s["soustitre"],
        ),
        Spacer(1, 8),
        HRFlowable(width="100%", thickness=1.5, color=MARQUE, spaceAfter=4),
    ]

    # --- Progression ---
    if progres["attemptCount"]:
        bloc.append(Paragraph("Ou vous en etes", s["section"]))
        bloc.append(
            Paragraph(
                f"{progres['attemptCount']} tentative(s)  ·  moyenne "
                f"<b>{progres['averageScore']} %</b>  ·  meilleur score "
                f"{progres['bestScore']} %  ·  derniere tentative "
                f"{progres['lastScore']} %",
                s["corps"],
            )
        )

    # --- Resume ---
    if resume is not None:
        charge = resume.payload
        bloc.append(Paragraph("L'essentiel du cours", s["section"]))
        bloc.append(Paragraph(_echapper(charge.get("abstract", "")), s["corps"]))

        points = charge.get("keyPoints") or []
        if points:
            bloc.append(Spacer(1, 8))
            bloc.append(
                ListFlowable(
                    [ListItem(Paragraph(_echapper(p), s["puce"])) for p in points],
                    bulletType="bullet", bulletColor=MARQUE, leftIndent=14,
                )
            )

        mots = charge.get("keywords") or []
        if mots:
            bloc.append(Spacer(1, 6))
            bloc.append(
                Paragraph(
                    "<b>Notions a retenir :</b> " + _echapper(", ".join(mots)),
                    s["corps"],
                )
            )

        for avertissement in charge.get("warnings") or []:
            bloc.append(Spacer(1, 4))
            bloc.append(Paragraph("⚠ " + _echapper(avertissement), s["citation"]))

    # --- A revoir ---
    faibles = progres["weakQuestions"]
    if faibles:
        bloc.append(Paragraph("A revoir en priorite", s["section"]))
        bloc.append(
            Paragraph(
                "Questions ratees au moins deux fois, avec le passage du cours "
                "dont elles sont tirees.",
                s["soustitre"],
            )
        )
        bloc.append(Spacer(1, 8))
        for q in faibles:
            bloc.append(
                Paragraph(
                    f"<b>{_echapper(q['question'])}</b>  "
                    f"<font color='#b91c1c'>({q['wrongCount']} echecs)</font>",
                    s["corps"],
                )
            )
            if q["sourceQuote"]:
                bloc.append(
                    Paragraph("« " + _echapper(q["sourceQuote"]) + " »", s["citation"])
                )
    elif progres["attemptCount"]:
        bloc.append(Paragraph("A revoir en priorite", s["section"]))
        bloc.append(
            Paragraph(
                "Aucune question n'a ete ratee deux fois ou plus. Rien a reviser en "
                "priorite sur ce cours.",
                s["corps"],
            )
        )

    # La fiche ne contient JAMAIS les bonnes reponses : une fiche de revision
    # qui donne les reponses ne sert a rien.
    bloc.append(Spacer(1, 18))
    bloc.append(HRFlowable(width="100%", thickness=0.5, color=BORDURE, spaceAfter=6))
    bloc.append(
        Paragraph(
            "Cette fiche ne contient pas les bonnes reponses du quiz : elle sert a "
            "reviser, pas a reciter. Retrouvez-les dans l'application, apres une "
            "nouvelle tentative.",
            s["pied"],
        )
    )

    document.build(bloc)
    return tampon.getvalue()
