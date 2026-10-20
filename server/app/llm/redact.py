"""
Anonymisation — le coeur technique du projet.

Regle du projet : jamais de donnees personnelles brutes envoyees telles quelles
au LLM. Ce module remplace ces donnees par des jetons avant l'appel, et
restaure les valeurs reelles a l'affichage.

ATTENTION, honnetete methodologique : il s'agit d'une PSEUDONYMISATION, pas
d'une anonymisation au sens du RGPD. Un faisceau d'informations residuelles
(parcours, dates, secteur) pourrait theoriquement permettre une
reidentification. Le rapport doit le dire, pas le masquer.
"""

from __future__ import annotations

import re
from typing import Any, TypedDict

TypeJeton = str  # NOM | EMAIL | TEL | ADRESSE | URL | ETABLISSEMENT | DATE_NAISSANCE | SECRET


class ValeursConnues(TypedDict, total=False):
    """Valeurs du profil, connues exactement : detection fiable plutot que probabiliste."""

    fullName: str | None
    phone: str | None
    city: str | None


# Etablissements frequents ; a completer selon le corpus.
ETABLISSEMENTS = [
    "ESPRIT",
    "INSAT",
    "ENIT",
    "ENSI",
    "ISET",
    "FST",
    "Universite",
    "University",
]

# Secrets. Un support de cours contient parfois une clef oubliee dans une note —
# cas constate le 1er octobre sur SkillMatch lors de la premiere verification
# reelle : la fausse clef AWS du jeu de donnees partait vers le fournisseur.
#
# Masquer un secret ne protege pas une donnee personnelle : ca evite de
# divulguer un identifiant appartenant a un tiers. C'est une obligation
# distincte, et plus grave.
SECRETS: list[re.Pattern[str]] = [
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),  # AWS
    re.compile(r"\bsk-ant-[A-Za-z0-9_-]{20,}\b"),  # Anthropic (avant sk- generique)
    re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"),  # OpenAI
    re.compile(r"\bhf_[A-Za-z0-9]{20,}\b"),  # Hugging Face
    re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b"),  # Google
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b"),  # GitHub
    re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b"),  # Slack
    re.compile(r"\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?)://\S+", re.I),
    # Lignes du type « mot de passe : xxx », « password=xxx », « token: xxx »
    re.compile(
        r"\b(?:mot de passe|password|passwd|secret|token|api[_ -]?key|cle)\s*[:=]\s*\S{6,}",
        re.I,
    ),
]

ANNEE = re.compile(r"(?:19|20)\d{2}")


def _est_un_telephone(trouve: str) -> bool:
    """
    Distingue un numero d'une suite de chiffres anodine.

    Deux garde-fous, nes de defauts constates :
      - moins de huit chiffres : ce n'est pas un numero ;
      - uniquement des annees (« 2022-2026 », « 2024 2025 2026 ») : c'est une
        information pedagogique utile, la masquer detruit du contenu.
    """
    groupes = re.findall(r"\d+", trouve)
    if sum(len(g) for g in groupes) < 8:
        return False
    if len(groupes) >= 2 and all(ANNEE.fullmatch(g) for g in groupes):
        return False
    return True

MOTIFS: list[tuple[TypeJeton, re.Pattern[str]]] = [
    ("EMAIL", re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")),
    ("URL", re.compile(r"\bhttps?://\S+|\b(?:www\.|linkedin\.com|github\.com)/\S+", re.I)),
    (
        "DATE_NAISSANCE",
        re.compile(r"\b(?:0?[1-9]|[12]\d|3[01])[/.-](?:0?[1-9]|1[0-2])[/.-](?:19|20)\d{2}\b"),
    ),
    # Formats nationaux et internationaux, groupements varies : « 55 123 456 »
    # (Tunisie, 2-3-3), « 06 12 34 56 78 » (France, 2-2-2-2-2), « 0123456789 »,
    # avec ou sans indicatif.
    #
    # Defaut constate le 12 octobre par le test de bout en bout : la version
    # precedente n'acceptait que des groupes de DEUX chiffres et laissait donc
    # passer « +216 55 123 456 ». Elle ne s'en sortait sur SkillMatch que parce
    # que le numero y etait connu d'avance par le profil du candidat — ce qui
    # n'existe pas ici. Le filtre _est_un_telephone ecarte les faux positifs.
    (
        "TEL",
        re.compile(r"(?:\+\d{1,3}[\s.-]?)?(?:\(\d{1,4}\)[\s.-]?)?\d{2,4}(?:[\s.-]?\d{2,4}){2,4}\b"),
    ),
    (
        "ADRESSE",
        re.compile(
            r"\b\d{1,4}[,\s]+(?:rue|avenue|av\.|boulevard|bd|impasse|route)\s+[^\n,]{2,40}",
            re.I,
        ),
    ),
]


def masquer(texte: str, connues: ValeursConnues | None = None) -> tuple[str, dict[str, str]]:
    """
    Remplace les donnees personnelles par des jetons numerotes et stables :
    une meme valeur recoit toujours le meme jeton dans un meme appel.

    Retourne le texte masque et la carte jeton -> valeur reelle. Cette carte
    vit en memoire le temps d'une requete et n'est jamais persistee.
    """
    connues = connues or {}
    carte: dict[str, str] = {}
    compteurs: dict[str, int] = {}
    vus: dict[str, str] = {}

    def jeton_pour(type_jeton: TypeJeton, valeur: str) -> str:
        if valeur in vus:
            return vus[valeur]
        suivant = compteurs.get(type_jeton, 0) + 1
        compteurs[type_jeton] = suivant
        jeton = f"[{type_jeton}_{suivant}]"
        vus[valeur] = jeton
        carte[jeton] = valeur
        return jeton

    sortie = texte

    # 1. Valeurs connues du profil : detection exacte plutot que probabiliste.
    #    C'est ce qui rend le masquage du nom fiable, la ou une heuristique
    #    echouerait sur un nom rare ou homonyme d'un mot commun.
    nom = connues.get("fullName")
    if nom:
        for partie in [p for p in nom.split() if len(p) > 1]:
            sortie = re.sub(
                rf"\b{re.escape(partie)}\b",
                lambda _m: jeton_pour("NOM", nom),
                sortie,
                flags=re.I,
            )

    telephone = connues.get("phone")
    if telephone:
        sortie = re.sub(
            re.escape(telephone), lambda _m: jeton_pour("TEL", telephone), sortie
        )

    ville = connues.get("city")
    if ville:
        sortie = re.sub(
            rf"\b{re.escape(ville)}\b",
            lambda _m: jeton_pour("ADRESSE", ville),
            sortie,
            flags=re.I,
        )

    # 2. Secrets d'abord : une chaine de connexion contient une adresse et un
    #    mot de passe, il faut la neutraliser avant que d'autres motifs la
    #    decoupent en morceaux.
    for motif in SECRETS:
        sortie = motif.sub(lambda m: jeton_pour("SECRET", m.group(0)), sortie)

    # 3. Motifs generiques.
    for type_jeton, motif in MOTIFS:

        def remplacer(m: re.Match[str], _type: str = type_jeton) -> str:
            trouve = m.group(0)
            if _type == "TEL" and not _est_un_telephone(trouve):
                return trouve
            return jeton_pour(_type, trouve)

        sortie = motif.sub(remplacer, sortie)

    # 4. Etablissements de formation.
    #    La suite capturee (« Universite de Tunis ») s'arrete a un jeton deja
    #    pose (« [ ») et au tiret long. Sans cette borne, trouve le 20 octobre
    #    sur le cours de demonstration : « ESPRIT — +216… — courriel… »
    #    devenait un seul [ETABLISSEMENT_1] qui avalait [TEL_1] et [EMAIL_1].
    #    Rien ne fuyait, mais la preuve de masquage ne montrait plus rien.
    for nom_etablissement in ETABLISSEMENTS:
        sortie = re.sub(
            rf"\b{re.escape(nom_etablissement)}\b[^\n,.;\[—–]{{0,30}}",
            lambda m: jeton_pour("ETABLISSEMENT", m.group(0).strip()),
            sortie,
            flags=re.I,
        )

    return sortie, carte


def restaurer(valeur: Any, carte: dict[str, str]) -> Any:
    """Restaure les valeurs reelles dans une sortie validee, recursivement."""
    if isinstance(valeur, str):
        sortie = valeur
        for jeton, reel in carte.items():
            sortie = sortie.replace(jeton, reel)
        return sortie
    if isinstance(valeur, list):
        return [restaurer(element, carte) for element in valeur]
    if isinstance(valeur, dict):
        return {cle: restaurer(element, carte) for cle, element in valeur.items()}
    return valeur


def taux_de_fuite(masque: str, connues: ValeursConnues) -> float:
    """
    Proportion de valeurs personnelles connues encore presentes dans la charge
    utile. Metrique du banc d'essai, et garde-fou en test.
    """
    valeurs = [
        v for v in (connues.get("fullName"), connues.get("phone"), connues.get("city")) if v
    ]
    if not valeurs:
        return 0.0
    fuites = [v for v in valeurs if v.lower() in masque.lower()]
    return len(fuites) / len(valeurs)
