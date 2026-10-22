"""
Execution d'une tache LLM unitaire : un prompt, un appel, une sortie validee.

Le pipeline impose, dans cet ordre :
  1. appel au modele    (avec delai maximal)
  2. parsing + schema   (ce qui ne valide pas n'existe pas)
  3. une seule relance   (au-dela, le cout depasse le benefice)
  4. telemetrie          (support du banc d'essai)

L'anonymisation n'est PAS ici : elle est faite une seule fois, en amont, par
app/llm/pipeline.py, sur le cours entier. C'est volontaire — masquer segment
par segment produirait des jetons numerotes independamment dans chaque appel
([NOM_1] ne designant pas la meme personne d'un segment a l'autre), et la
fusion des resultats melangerait les identites.
"""

from __future__ import annotations

import json
from collections.abc import Generator
from dataclasses import dataclass, replace
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError

from ..errors import ErreurApplicative
from .client import appeler_modele, appeler_modele_en_flux

M = TypeVar("M", bound=BaseModel)


@dataclass(frozen=True)
class Tache:
    nom: str
    version_prompt: str
    temperature: float
    max_tokens: int
    schema: type[BaseModel]


@dataclass(frozen=True)
class Telemetrie:
    model: str
    version_prompt: str
    temperature: float
    tokens_in: int
    tokens_out: int
    latence_ms: int
    relance: bool
    # Nombre d'appels reellement effectues : 1 pour un cours court, davantage
    # des que le cours est traite par segments.
    appels: int = 1

    def __add__(self, autre: "Telemetrie") -> "Telemetrie":
        """Cumule deux mesures : utilise quand un cours demande plusieurs appels."""
        return replace(
            self,
            model=autre.model or self.model,
            tokens_in=self.tokens_in + autre.tokens_in,
            tokens_out=self.tokens_out + autre.tokens_out,
            latence_ms=self.latence_ms + autre.latence_ms,
            relance=self.relance or autre.relance,
            appels=self.appels + autre.appels,
        )


@dataclass(frozen=True)
class Resultat:
    donnees: BaseModel
    telemetrie: Telemetrie
    # La charge utile exacte transmise au modele — alimente la vue de transparence.
    charge_envoyee: str


def _retirer_balises(texte: str) -> str:
    """Le modele encadre parfois son JSON d'un bloc de code malgre la consigne."""
    nettoye = texte.strip()
    if nettoye.startswith("```"):
        nettoye = nettoye.split("\n", 1)[-1] if "\n" in nettoye else nettoye[3:]
        if nettoye.rstrip().endswith("```"):
            nettoye = nettoye.rstrip()[:-3]
    return nettoye.strip()


def executer_tache(tache: Tache, system: str, user: str) -> Resultat:
    """Lance la tache, valide la sortie, relance une fois si elle ne valide pas."""
    relance = False
    dernier_grief = ""
    prompt = user

    for tentative in range(2):
        brut = appeler_modele(
            system=system,
            user=prompt,
            temperature=tache.temperature,
            max_tokens=tache.max_tokens,
        )
        nettoye = _retirer_balises(brut.text)

        try:
            charge = json.loads(nettoye)
        except json.JSONDecodeError:
            dernier_grief = "reponse non parsable en JSON"
        else:
            try:
                valide = tache.schema.model_validate(charge)
            except ValidationError as erreur:
                dernier_grief = json.dumps(
                    [
                        {"champ": ".".join(str(p) for p in e["loc"]), "probleme": e["msg"]}
                        for e in erreur.errors()[:6]
                    ],
                    ensure_ascii=False,
                )
            else:
                return Resultat(
                    donnees=valide,
                    telemetrie=Telemetrie(
                        model=brut.model,
                        version_prompt=tache.version_prompt,
                        temperature=tache.temperature,
                        tokens_in=brut.tokens_in,
                        tokens_out=brut.tokens_out,
                        latence_ms=brut.latence_ms,
                        relance=relance,
                    ),
                    charge_envoyee=f"{system}\n\n---\n\n{prompt}",
                )

        if tentative == 0:
            relance = True
            # On rend au modele l'erreur exacte du schema : il corrige bien
            # mieux une violation nommee qu'une consigne repetee.
            prompt = (
                f"{user}\n\nTa reponse precedente a ete rejetee : {dernier_grief}\n"
                "Renvoie uniquement le JSON valide, sans texte autour."
            )

    raise ErreurApplicative(
        "LLM_INVALID_OUTPUT",
        "L'analyse n'a pas pu etre produite.",
        {"tache": tache.nom, "grief": dernier_grief},
    )


def executer_tache_en_flux(
    tache: Tache, system: str, user: str
) -> Generator[str, None, Resultat]:
    """
    Diffuse la sortie BRUTE du modele, puis la valide d'un bloc (23 octobre).

    La validation ne change pas : le JSON complet passe par le schema, comme
    pour une reponse non diffusee. S'il est rejete, on ne relance pas en
    diffusion — le texte deja montre deviendrait incoherent : on retombe sur
    executer_tache(), qui relance avec le grief exact, et la sortie validee
    remplace a l'ecran ce qui avait ete diffuse.
    """
    flux = appeler_modele_en_flux(
        system=system, user=user, temperature=tache.temperature, max_tokens=tache.max_tokens
    )
    while True:
        try:
            morceau = next(flux)
        except StopIteration as fin:
            brut = fin.value
            break
        yield morceau

    telemetrie = Telemetrie(
        model=brut.model,
        version_prompt=tache.version_prompt,
        temperature=tache.temperature,
        tokens_in=brut.tokens_in,
        tokens_out=brut.tokens_out,
        latence_ms=brut.latence_ms,
        relance=False,
    )
    try:
        valide = tache.schema.model_validate(json.loads(_retirer_balises(brut.text)))
    except (json.JSONDecodeError, ValidationError):
        repli = executer_tache(tache, system, user)
        return Resultat(
            donnees=repli.donnees,
            telemetrie=telemetrie + replace(repli.telemetrie, relance=True),
            charge_envoyee=repli.charge_envoyee,
        )
    return Resultat(
        donnees=valide,
        telemetrie=telemetrie,
        charge_envoyee=f"{system}\n\n---\n\n{user}",
    )


def valeurs(modele: BaseModel) -> dict[str, Any]:
    """Sortie en camelCase : la forme attendue par le stockage et par le front."""
    return modele.model_dump(by_alias=True)
