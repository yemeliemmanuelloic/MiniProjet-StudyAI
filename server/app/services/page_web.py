"""
Import d'un cours depuis une page web (decision 051).

L'etudiant colle un lien ; le serveur va chercher la page et en tire le
texte. AUCUN APPEL AU MODELE : la lecture est locale, comme pour un .docx.

LE RISQUE, ET POURQUOI CE MODULE EST SI MEFIANT. Aller chercher une adresse
fournie par l'utilisateur, c'est preter le serveur a qui veut : sans garde-
fou, « http://169.254.169.254/ » lirait les secrets de l'hebergeur, et
« http://localhost:5432 » sonderait la base. D'ou, a CHAQUE requete et a
chaque redirection :
  - http ou https seulement, ports standards, aucun identifiant dans l'URL ;
  - toutes les adresses IP du nom doivent etre PUBLIQUES (ni boucle locale,
    ni reseau prive, ni lien local, ni adresse reservee) ;
  - les redirections sont suivies a la main, trois au plus, chacune
    reverifiee ;
  - 5 Mo au plus, lus en flux et coupes au-dela ; 10 secondes au plus.
Risque residuel assume : un nom qui changerait d'adresse entre la
verification et la connexion (« DNS rebinding »). Le fermer demanderait de se
connecter a l'IP verifiee, ce qui casse la verification du certificat TLS.

L'EXTRACTION n'ajoute aucune dependance : le module html.parser de Python
suffit. On retient le contenu principal (<main>, <article>) quand il en a
assez, et on ecarte menus, en-tetes, pieds de page, formulaires et scripts.
"""

from __future__ import annotations

import ipaddress
import re
import socket
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit

import httpx

from ..config import parametres
from ..errors import ErreurApplicative
from .extraction import extraire
from .pdf import SEUIL_TEXTE_UTILE

TAILLE_MAX = 5 * 1024 * 1024
DELAI_S = 10.0
REDIRECTIONS_MAX = 3


def _entetes() -> dict[str, str]:
    """
    Un robot poli s'identifie, avec une adresse ou le joindre : Wikipedia,
    entre autres, refuse (403) les programmes anonymes — constate le
    29 octobre. L'adresse est celle du site, la meme que CLIENT_ORIGIN.
    """
    return {
        "User-Agent": f"StudyAI/1.0 (+{parametres.CLIENT_ORIGIN}; import d'un support de cours)",
        "Accept": "text/html,application/xhtml+xml,text/plain,application/pdf;q=0.9",
    }
TYPES_HTML = ("text/html", "application/xhtml+xml")


def _refus(message: str, **details) -> ErreurApplicative:
    return ErreurApplicative("VALIDATION_ERROR", message, details)


# --- Garde-fous reseau ------------------------------------------------------------


def _resoudre(hote: str, port: int) -> list[str]:
    """Toutes les adresses IP du nom. Isolee pour etre remplacee en test."""
    try:
        return list({info[4][0] for info in socket.getaddrinfo(hote, port, type=socket.SOCK_STREAM)})
    except socket.gaierror as erreur:
        raise _refus("Ce site est introuvable : verifiez l'adresse.") from erreur


def verifier_adresse(url: str) -> str:
    """L'URL si elle est sure ; une VALIDATION_ERROR explicite sinon."""
    morceaux = urlsplit(url.strip())
    if morceaux.scheme not in ("http", "https") or not morceaux.hostname:
        raise _refus("Collez une adresse complete, commencant par https:// ou http://.")
    if morceaux.username or morceaux.password:
        raise _refus("Une adresse contenant un identifiant ou un mot de passe est refusee.")
    try:
        port = morceaux.port
    except ValueError as erreur:
        raise _refus("Le port de cette adresse est invalide.") from erreur
    if port not in (None, 80, 443):
        raise _refus("Seules les adresses web ordinaires (ports 80 et 443) sont acceptees.")

    adresses = _resoudre(morceaux.hostname, port or (443 if morceaux.scheme == "https" else 80))
    for brute in adresses:
        ip = ipaddress.ip_address(brute.split("%", 1)[0])
        if not ip.is_global or ip.is_multicast:
            raise _refus("Cette adresse n'est pas une page publique : elle est refusee.")
    return url.strip()


def _requete(url: str) -> tuple[int, dict[str, str], bytes]:
    """
    UNE requete, sans suivre les redirections, corps limite a TAILLE_MAX.
    Isolee pour etre remplacee en test : aucun test ne sort sur le reseau.
    """
    try:
        with httpx.Client(timeout=DELAI_S, follow_redirects=False, headers=_entetes()) as client:
            with client.stream("GET", url) as reponse:
                entetes = {k.lower(): v for k, v in reponse.headers.items()}
                if reponse.is_redirect or reponse.status_code >= 400:
                    return reponse.status_code, entetes, b""
                annoncee = entetes.get("content-length", "")
                if annoncee.isdigit() and int(annoncee) > TAILLE_MAX:
                    raise _refus("Cette page est trop volumineuse (5 Mo maximum).")
                corps = bytearray()
                for morceau in reponse.iter_bytes():
                    corps += morceau
                    if len(corps) > TAILLE_MAX:
                        raise _refus("Cette page est trop volumineuse (5 Mo maximum).")
                return reponse.status_code, entetes, bytes(corps)
    except httpx.TimeoutException as erreur:
        raise _refus("La page n'a pas repondu a temps (10 secondes).") from erreur
    except httpx.HTTPError as erreur:
        raise _refus("Impossible de joindre cette page.") from erreur


def telecharger(url: str) -> tuple[str, dict[str, str], bytes]:
    """La page, apres les redirections, chacune reverifiee."""
    courante = verifier_adresse(url)
    for _ in range(REDIRECTIONS_MAX + 1):
        statut, entetes, corps = _requete(courante)
        if 300 <= statut < 400 and "location" in entetes:
            courante = verifier_adresse(urljoin(courante, entetes["location"]))
            continue
        if statut >= 400:
            raise _refus(f"La page a repondu par une erreur ({statut}).", status=statut)
        return courante, entetes, corps
    raise _refus("Trop de redirections pour cette adresse.")


# --- Extraction du texte ---------------------------------------------------------

IGNORES = {"script", "style", "noscript", "template", "svg", "nav", "header", "footer",
           "aside", "form", "iframe", "button", "select", "canvas"}
BLOCS = {"p", "div", "section", "article", "main", "h1", "h2", "h3", "h4", "h5", "h6",
         "li", "br", "tr", "table", "ul", "ol", "blockquote", "pre", "dd", "dt",
         "figcaption", "hr"}
PRINCIPAUX = {"main", "article"}
VIDES = {"br", "hr", "img", "input", "meta", "link", "source", "wbr"}


class _Lecteur(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.ignore = 0
        self.principal = 0
        self.dans_titre = False
        self.titre = ""
        self.tout: list[str] = []
        self.principal_txt: list[str] = []

    def _ecrire(self, texte: str) -> None:
        self.tout.append(texte)
        if self.principal:
            self.principal_txt.append(texte)

    def handle_starttag(self, tag, attrs):
        if tag == "title":
            self.dans_titre = True
        if tag in VIDES:
            if tag in BLOCS and not self.ignore:
                self._ecrire("\n")
            return
        if tag in IGNORES:
            self.ignore += 1
        if tag in PRINCIPAUX:
            self.principal += 1
        if tag in BLOCS and not self.ignore:
            self._ecrire("\n- " if tag == "li" else "\n")

    def handle_endtag(self, tag):
        if tag == "title":
            self.dans_titre = False
        if tag in VIDES:
            return
        if tag in IGNORES and self.ignore:
            self.ignore -= 1
        if tag in BLOCS and not self.ignore:
            self._ecrire("\n")
        if tag in PRINCIPAUX and self.principal:
            self.principal -= 1

    def handle_data(self, data):
        # En HTML, un retour a la ligne du source n'est qu'un espace : seules
        # les balises de bloc coupent les lignes.
        data = re.sub(r"\s+", " ", data)
        if self.dans_titre:
            self.titre += data
        elif not self.ignore:
            self._ecrire(data)


def _nettoyer(morceaux: list[str]) -> str:
    lignes = []
    for ligne in "".join(morceaux).split("\n"):
        propre = re.sub(r"\s+", " ", ligne).strip()
        if propre and propre != "-":
            lignes.append(propre)
    return "\n".join(lignes)


def texte_html(html: str) -> tuple[str, str]:
    """Le texte de la page et son titre ; le contenu principal s'il suffit."""
    lecteur = _Lecteur()
    lecteur.feed(html)
    lecteur.close()
    principal = _nettoyer(lecteur.principal_txt)
    texte = principal if len(principal) >= SEUIL_TEXTE_UTILE else _nettoyer(lecteur.tout)
    return texte, re.sub(r"\s+", " ", lecteur.titre).strip()


def _decoder(corps: bytes, type_contenu: str) -> str:
    trouve = re.search(r"charset=([\w-]+)", type_contenu, re.I)
    for encodage in ([trouve.group(1)] if trouve else []) + ["utf-8", "cp1252"]:
        try:
            return corps.decode(encodage)
        except (LookupError, UnicodeDecodeError):
            continue
    return corps.decode("utf-8", errors="replace")


def lire(url: str) -> tuple[str, str]:
    """(texte, titre propose) de la page. AUCUN APPEL AU MODELE."""
    finale, entetes, corps = telecharger(url)
    type_contenu = entetes.get("content-type", "").lower()
    nom_par_defaut = urlsplit(finale).hostname or "Page web"

    if type_contenu.startswith("application/pdf") or (not type_contenu and corps[:5] == b"%PDF-"):
        return extraire("page.pdf", corps), nom_par_defaut
    if type_contenu.startswith(TYPES_HTML):
        texte, titre = texte_html(_decoder(corps, type_contenu))
    elif type_contenu.startswith("text/plain"):
        texte, titre = _decoder(corps, type_contenu).strip(), ""
    else:
        raise _refus(
            "Ce lien ne mene ni a une page web, ni a un texte, ni a un PDF.",
            type=type_contenu.split(";")[0],
        )

    if len(texte) < SEUIL_TEXTE_UTILE:
        raise _refus(
            "Trop peu de texte sur cette page pour en faire un cours. Si elle "
            "s'affiche par un programme (application web), copiez-collez son texte.",
            caracteres=len(texte),
        )
    return texte, titre or nom_par_defaut
