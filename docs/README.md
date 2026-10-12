# Documentation StudyAI

Ces documents sont la **source de vérité** du projet. En cas de contradiction
avec le code, l'écart est signalé et tranché — il n'est pas ignoré.

## Par où commencer

| Vous êtes… | Lisez dans cet ordre |
|---|---|
| **Un agent de codage** | `AGENTS.md` d'abord, toujours |
| **Un membre de l'équipe** | `PRD.md` → `ARCHITECTURE.md` → le document de votre lot |
| **L'enseignant / un correcteur** | `PRD.md` → `PROMPTS.md` → `ARCHITECTURE.md` → `SECURITY.md` |

## Les documents

| Fichier | Question |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Comment l'agent de codage doit-il se comporter ? |
| [`PRD.md`](PRD.md) | Que construit-on, et qu'exclut-on ? |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Comment le système est-il structuré ? |
| [`DATABASE.md`](DATABASE.md) | Quelles données, quelles relations ? |
| [`API.md`](API.md) | Quels contrats HTTP ? |
| [`SECURITY.md`](SECURITY.md) | Qu'est-ce qui doit être protégé, et contre quoi ? |
| [`TESTING.md`](TESTING.md) | Comment sait-on que ça marche ? |
| [`PROMPTS.md`](PROMPTS.md) | **Livrable noté** — les prompts envoyés au modèle |
| [`DECISIONS.md`](DECISIONS.md) | Pourquoi ces choix, et quelles alternatives écartées ? |
| [`depannage-windows.md`](depannage-windows.md) | Pannes rencontrées sous Windows et leurs correctifs |

## Correspondance avec les livrables de l'énoncé

| Livrable exigé | Où |
|---|---|
| Présentation des prompts et/ou modèles IA | `PROMPTS.md` |
| Rapport technique — architecture front/back | `ARCHITECTURE.md` |
| Rapport technique — choix des frameworks | `DECISIONS.md` 001, 003, 004 |
| Rapport technique — API et modèles IA | `API.md`, `PROMPTS.md` |
| Rapport technique — prompts utilisés | `PROMPTS.md` |

Le rapport final s'assemble à partir de ces documents ; il ne les réécrit pas.

## Ce qui n'est volontairement pas documenté

- **Design system** : les jetons visuels sont dans `client/src/index.css`, et
  aucune valeur de couleur n'est écrite ailleurs. Un document séparé ferait
  doublon.
- **Flux UX** : trois pages, le parcours tient dans le `PRD.md`.
- **Déploiement, supervision, journal des versions** : l'application n'est pas
  déployée. Écrire ces documents maintenant produirait du vide.

## Règle d'entretien

Une modification du comportement met à jour le document correspondant, dans le
**même commit**.

| Changement | Document |
|---|---|
| Comportement produit | `PRD.md` |
| Structure, dépendances | `ARCHITECTURE.md` |
| Schéma de base | `DATABASE.md` + une migration |
| Route ou contrat | `API.md` |
| Règle de sécurité | `SECURITY.md` |
| Prompt | `PROMPTS.md` + nouvelle version du prompt |
| Arbitrage technique | `DECISIONS.md` |

---

*Dernière mise à jour : 12 octobre 2026.*
