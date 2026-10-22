"""
Outils de diffusion progressive (reponses du tuteur au fil de l'eau, 23 octobre).

Le modele repond en JSON (`{"answer": "...", "grounded": ..., "sources": [...]}`)
et ce JSON arrive par morceaux. L'etudiant ne doit voir ni accolades ni
guillemets : seulement le texte de « answer », au fur et a mesure. Deux
difficultes, une classe chacune :

  - ExtracteurChaine : retrouve la valeur d'un champ chaine dans un JSON
    incomplet, et la decode (echappements \\n, \\", \\u00e9...) morceau par
    morceau, sans jamais emettre un echappement coupe en deux ;
  - RestaurateurFlux : remet les valeurs reelles a la place des jetons de
    pseudonymisation ([EMAIL_1]...). Un jeton peut etre coupe entre deux
    morceaux : on retient le texte tant qu'un « [ » n'est pas referme, pour
    ne jamais afficher « [EMA » puis « IL_1] ».

Ni l'un ni l'autre ne valident quoi que ce soit : la sortie complete est
validee par le schema a la fin, comme pour une reponse non diffusee.
"""

from __future__ import annotations

import re

_ECHAPPEMENTS = {'"': '"', "\\": "\\", "/": "/", "b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "\t"}


class ExtracteurChaine:
    """Extrait progressivement la valeur d'un champ chaine d'un objet JSON."""

    def __init__(self, champ: str) -> None:
        self._motif = re.compile(r'"' + re.escape(champ) + r'"\s*:\s*"')
        self._tampon = ""  # JSON recu tant que la valeur n'a pas commence
        self._dans_valeur = False
        self._termine = False
        self._echappement = ""  # echappement en cours (« \\ », « \\u00 »...)

    @property
    def termine(self) -> bool:
        return self._termine

    def ajouter(self, morceau: str) -> str:
        """Rend le texte decode de la valeur contenu dans ce morceau."""
        if self._termine:
            return ""
        if not self._dans_valeur:
            self._tampon += morceau
            trouve = self._motif.search(self._tampon)
            if not trouve:
                return ""
            self._dans_valeur = True
            morceau = self._tampon[trouve.end():]
            self._tampon = ""
        return self._decoder(morceau)

    def _decoder(self, morceau: str) -> str:
        sortie: list[str] = []
        for c in morceau:
            if self._termine:
                break
            if self._echappement:
                self._echappement += c
                if self._echappement.startswith("\\u"):
                    if len(self._echappement) == 6:
                        try:
                            sortie.append(chr(int(self._echappement[2:], 16)))
                        except ValueError:
                            pass
                        self._echappement = ""
                    continue
                sortie.append(_ECHAPPEMENTS.get(c, c))
                self._echappement = ""
                continue
            if c == "\\":
                self._echappement = "\\"
            elif c == '"':
                self._termine = True
            else:
                sortie.append(c)
        return "".join(sortie)


class RestaurateurFlux:
    """Remet les valeurs reelles a la place des jetons, sans couper un jeton."""

    # Un jeton ressemble a [EMAIL_1] : au-dela de cette longueur, un « [ »
    # ouvert n'est pas un debut de jeton, on cesse de le retenir.
    LONGUEUR_MAX_JETON = 40

    def __init__(self, carte: dict[str, str]) -> None:
        self._carte = carte
        self._reste = ""

    def _restaurer(self, texte: str) -> str:
        for jeton, reel in self._carte.items():
            texte = texte.replace(jeton, reel)
        return texte

    def ajouter(self, morceau: str) -> str:
        texte = self._reste + morceau
        ouvert = texte.rfind("[")
        if ouvert != -1 and "]" not in texte[ouvert:] and len(texte) - ouvert < self.LONGUEUR_MAX_JETON:
            self._reste, texte = texte[ouvert:], texte[:ouvert]
        else:
            self._reste = ""
        return self._restaurer(texte)

    def vider(self) -> str:
        """Le texte retenu en fin de flux, restaure."""
        texte, self._reste = self._reste, ""
        return self._restaurer(texte)
