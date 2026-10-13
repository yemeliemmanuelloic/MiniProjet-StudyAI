"""
Banc d'essai des trois modules IA — support de l'acquis AA5.

Mesure ce que la suite de tests ne peut pas mesurer : non pas que le code
fonctionne, mais que les sorties du modele valent quelque chose.

CINQ METRIQUES
  1. conformite au schema   part des appels valides sans relance
  2. taux de fuite          donnees personnelles connues encore presentes
                            dans la charge reellement envoyee
  3. ancrage du quiz        part des sourceQuote REELLEMENT presentes dans le
                            cours — verifiable automatiquement, c'est la plus
                            interessante des cinq
  4. justesse du refus      sur une question couverte, le tuteur doit repondre ;
                            sur une question hors sujet, il doit refuser.
                            Les deux erreurs comptent.
  5. cout et latence        jetons et millisecondes, par module et par taille

REPRISE
Chaque resultat est enregistre des qu'il est obtenu. Si le quota s'epuise en
cours de route, ce qui a ete mesure est conserve ; relancer la commande
reprend ou elle s'etait arretee.

    python -m banc.executer --module resume
    python -m banc.executer --module chat --support atelier-5-testing
    python -m banc.executer --module tout --refaire
"""

from __future__ import annotations

import argparse
import re
import sys
import time
import unicodedata
from typing import Any

from sqlalchemy import select

from app.config import parametres
from app.db import FabriqueSession
from app.errors import ErreurApplicative
from app.llm import pipeline
from app.llm.redact import taux_de_fuite
from app.llm.tasks import TACHE_CHAT, TACHE_QUIZ, TACHE_RESUME
from app.models import EssaiBanc

from .corpus import CORPUS, MOTIFS_SONDE, SONDE, VALEURS_SONDE, Support, verifier

VERSION_CORPUS = "2026-10-13"

# Les fournisseurs limitent le nombre d'appels par minute. Une pause courte
# entre deux appels coute quelques secondes et evite de perdre une execution
# entiere sur un 429.
PAUSE = 2.0


def _normaliser(texte: str) -> str:
    """Minuscules, sans accents, espaces normalises — pour comparer des citations."""
    sans_accent = "".join(
        c for c in unicodedata.normalize("NFD", texte.lower())
        if unicodedata.category(c) != "Mn"
    )
    return re.sub(r"\s+", " ", sans_accent).strip()


def _mots(texte: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", _normaliser(texte))


FENETRE = 6


def _ancree_souplement(citation: str, mots_cours: list[str]) -> bool:
    """
    Ancrage tolerant : une suite de six mots de la citation se retrouve-t-elle
    dans le cours ?

    Le test strict — la citation entiere, caractere pour caractere — rejette
    des citations pourtant fideles : le texte extrait d'un PDF comporte des
    ruptures de colonnes, des tirets et des espaces qui n'existent pas dans le
    document d'origine. Mesure du 13 octobre : sur quatre citations rejetees
    par le test strict, trois se retrouvaient bien dans le cours.

    Les deux mesures sont conservees. La stricte majore la fidelite exigee, la
    souple mesure l'ancrage reel.
    """
    mots = _mots(citation)
    if len(mots) < FENETRE:
        return " ".join(mots) in " ".join(mots_cours)
    texte_cours = " ".join(mots_cours)
    return any(
        " ".join(mots[i : i + FENETRE]) in texte_cours
        for i in range(len(mots) - FENETRE + 1)
    )


def _accentue(texte: str) -> bool:
    return any(c in texte for c in "éèêëàâîïôöùûçÉÈÀÇ")


def _enregistrer(tache: str, support: str, modele: str, version: str, mesures: dict) -> None:
    with FabriqueSession() as session:
        session.add(
            EssaiBanc(
                task=tache,
                corpus_version=f"{VERSION_CORPUS}/{support}",
                prompt_version=version,
                model=modele,
                metrics=mesures,
            )
        )
        session.commit()


def _deja_fait(tache: str, support: str, version: str) -> bool:
    with FabriqueSession() as session:
        return (
            session.scalars(
                select(EssaiBanc).where(
                    EssaiBanc.task == tache,
                    EssaiBanc.corpus_version == f"{VERSION_CORPUS}/{support}",
                    EssaiBanc.prompt_version == version,
                )
            ).first()
            is not None
        )


# --- Module 1 : resume --------------------------------------------------------


def mesurer_resume(support: Support) -> dict[str, Any]:
    texte = SONDE + support.texte()
    depart = time.monotonic()
    sortie = pipeline.resumer_cours(texte, "standard")
    t = sortie.telemetrie

    # Le taux de fuite se mesure sur ce qui est REELLEMENT parti, pas sur ce
    # qu'on croit avoir masque.
    envoye = sortie.charge_envoyee
    fuites = [nom for nom, motif in MOTIFS_SONDE if motif in envoye]

    donnees = sortie.donnees
    return {
        "caracteres_cours": len(texte),
        "segments": sortie.segments,
        "appels": t.appels,
        "relance": t.relance,
        "conforme_sans_relance": not t.relance,
        "jetons_entree": t.tokens_in,
        "jetons_sortie": t.tokens_out,
        "latence_ms": t.latence_ms,
        "latence_totale_ms": int((time.monotonic() - depart) * 1000),
        # Deux mesures distinctes, et la distinction compte :
        #   - les MOTIFS formels (courriel, telephone, etablissement, clef) que
        #     l'anonymisation sait reconnaitre : doit valoir [] ;
        #   - le taux de fuite sur les valeurs connues, domine par le NOM, que
        #     le projet documente comme non detecte faute de profil. Cette
        #     mesure chiffre donc une limite assumee, elle ne la decouvre pas.
        "taux_de_fuite": taux_de_fuite(envoye, VALEURS_SONDE),
        "fuites_detectees": fuites,
        "nom_present_en_clair": VALEURS_SONDE["fullName"] in envoye,
        "types_masques": sortie.types_masques,
        "points_cles": len(donnees.get("keyPoints", [])),
        "abstract_accentue": _accentue(donnees.get("abstract", "")),
        "avertissements": len(donnees.get("warnings", [])),
    }


# --- Module 2 : quiz ----------------------------------------------------------


def mesurer_quiz(support: Support, nombre: int = 5) -> dict[str, Any]:
    texte = support.texte()
    reference = _normaliser(texte)
    mots_cours = _mots(texte)

    sortie = pipeline.generer_quiz(texte, nombre, "standard")
    t = sortie.telemetrie
    questions = sortie.donnees["questions"]

    # L'ancrage : la citation figure-t-elle REELLEMENT dans le cours ?
    # C'est le seul moyen automatique de detecter une citation inventee.
    ancrees = [q for q in questions if _normaliser(q["sourceQuote"]) in reference]
    souples = [q for q in questions if _ancree_souplement(q["sourceQuote"], mots_cours)]
    positions = [q["correctIndex"] for q in questions]

    return {
        "questions_demandees": nombre,
        "questions_produites": len(questions),
        "segments": sortie.segments,
        "appels": t.appels,
        "relance": t.relance,
        "conforme_sans_relance": not t.relance,
        "jetons_entree": t.tokens_in,
        "jetons_sortie": t.tokens_out,
        "latence_ms": t.latence_ms,
        "citations_ancrees": len(ancrees),
        "taux_ancrage_strict": round(len(ancrees) / len(questions), 3) if questions else 0.0,
        "taux_ancrage_souple": round(len(souples) / len(questions), 3) if questions else 0.0,
        "citations_non_ancrees": [
            q["sourceQuote"][:160]
            for q in questions
            if not _ancree_souplement(q["sourceQuote"], mots_cours)
        ],
        "citations_reformatees": [
            q["sourceQuote"][:160]
            for q in questions
            if _normaliser(q["sourceQuote"]) not in reference
            and _ancree_souplement(q["sourceQuote"], mots_cours)
        ],
        "positions_bonne_reponse": positions,
        "options_toutes_distinctes": all(len(set(q["options"])) == 4 for q in questions),
        "explications_accentuees": sum(1 for q in questions if _accentue(q["explanation"])),
    }


# --- Module 3 : tuteur --------------------------------------------------------


def mesurer_chat(support: Support, pause: float) -> dict[str, Any]:
    texte = support.texte()
    details = []
    jetons_e = jetons_s = latence = 0
    relances = 0

    for question in support.questions:
        sortie = pipeline.repondre_question(texte, question.texte)
        t = sortie.telemetrie
        d = sortie.donnees
        jetons_e += t.tokens_in
        jetons_s += t.tokens_out
        latence += t.latence_ms
        relances += 1 if t.relance else 0

        details.append(
            {
                "question": question.texte,
                "couverte": question.couverte,
                "proche": question.proche,
                "ancre": d["grounded"],
                "correct": d["grounded"] == question.couverte,
                "sources": len(d["sources"]),
                "reponse_accentuee": _accentue(d["answer"]),
            }
        )
        print(
            f"      {'OK ' if details[-1]['correct'] else 'NON'} "
            f"{'couverte  ' if question.couverte else ('PROCHE    ' if question.proche else 'eloignee  ')} — "
            f"ancre={d['grounded']} — {question.texte[:58]}"
        )
        time.sleep(pause)

    couvertes = [d for d in details if d["couverte"]]
    hors = [d for d in details if not d["couverte"]]
    # Le cas difficile : proche du domaine, mais absent du support.
    proches = [d for d in details if d.get("proche")]
    loin = [d for d in hors if not d.get("proche")]

    return {
        "questions": len(details),
        "appels": len(details),
        "relances": relances,
        "conforme_sans_relance": relances == 0,
        "jetons_entree": jetons_e,
        "jetons_sortie": jetons_s,
        "latence_moyenne_ms": round(latence / len(details)) if details else 0,
        "rappel_sur_questions_couvertes": (
            round(sum(d["correct"] for d in couvertes) / len(couvertes), 3) if couvertes else None
        ),
        "justesse_du_refus": (
            round(sum(d["correct"] for d in hors) / len(hors), 3) if hors else None
        ),
        "refus_questions_eloignees": (
            round(sum(d["correct"] for d in loin) / len(loin), 3) if loin else None
        ),
        "refus_questions_proches": (
            round(sum(d["correct"] for d in proches) / len(proches), 3) if proches else None
        ),
        "sources_citees_en_moyenne": (
            round(sum(d["sources"] for d in couvertes) / len(couvertes), 2) if couvertes else 0
        ),
        "detail": details,
    }


# --- Orchestration ------------------------------------------------------------

MESURES = {
    "resume": (mesurer_resume, TACHE_RESUME),
    "quiz": (mesurer_quiz, TACHE_QUIZ),
    "chat": (mesurer_chat, TACHE_CHAT),
}


def main() -> int:
    analyseur = argparse.ArgumentParser(description=__doc__)
    analyseur.add_argument("--module", default="tout", choices=[*MESURES, "tout"])
    analyseur.add_argument("--support", default=None, help="nom d'un support du corpus")
    analyseur.add_argument("--refaire", action="store_true", help="ignorer les mesures deja faites")
    analyseur.add_argument("--pause", type=float, default=PAUSE)
    analyseur.add_argument("--questions-quiz", type=int, default=5)
    options = analyseur.parse_args()

    anomalies = verifier()
    if anomalies:
        print("Corpus invalide — aucune mesure ne sera lancee :", file=sys.stderr)
        for a in anomalies:
            print("  -", a, file=sys.stderr)
        return 1

    supports = [s for s in CORPUS if options.support in (None, s.nom)]
    modules = list(MESURES) if options.module == "tout" else [options.module]

    print(f"Modele   : {parametres.LLM_MODEL} ({parametres.LLM_PROVIDER})")
    print(f"Corpus   : {VERSION_CORPUS} — {len(supports)} support(s)")
    print(f"Modules  : {', '.join(modules)}\n")

    faits = ignores = echecs = 0
    for module in modules:
        mesurer, tache = MESURES[module]
        for support in supports:
            if not options.refaire and _deja_fait(module, support.nom, tache.version_prompt):
                print(f"  — {module:<7} {support.nom:<22} deja mesure, ignore")
                ignores += 1
                continue

            print(f"  > {module:<7} {support.nom}")
            try:
                if module == "chat":
                    mesures = mesurer(support, options.pause)
                elif module == "quiz":
                    mesures = mesurer(support, options.questions_quiz)
                else:
                    mesures = mesurer(support)
            except ErreurApplicative as erreur:
                print(f"    ECHEC {erreur.code} — {erreur.message}", file=sys.stderr)
                _enregistrer(
                    module, support.nom, parametres.LLM_MODEL, tache.version_prompt,
                    {"echec": erreur.code, "message": erreur.message},
                )
                echecs += 1
                if erreur.code in ("LLM_QUOTA_EXCEEDED", "LLM_KEY_MISSING"):
                    print("    quota ou clef : on s'arrete ici, le reste est conserve.", file=sys.stderr)
                    return 2
                continue

            _enregistrer(module, support.nom, parametres.LLM_MODEL, tache.version_prompt, mesures)
            faits += 1
            resume = {k: v for k, v in mesures.items() if not isinstance(v, (list, dict))}
            print(f"    {resume}\n")
            time.sleep(options.pause)

    print(f"\nTermine : {faits} mesure(s), {ignores} ignoree(s), {echecs} echec(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
