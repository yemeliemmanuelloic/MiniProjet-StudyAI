# Feuille de route jusqu'à la soutenance

**Révisé le** : mardi 13 octobre 2026.
**Soutenance** : semaine 7, du 19 au 23 octobre. 15 minutes de démonstration
live + questions, présence des trois membres requise.

Il reste **six à dix jours** selon le créneau. Ce document existe pour une
raison : le seul risque sérieux n'est plus que les livrables notés manquent —
ils sont acquis — mais que l'effort se disperse sur des fonctionnalités
supplémentaires alors que ce qui se voit à l'écran reste en retrait de ce qui
tourne derrière.

---

## Ce qui est déjà fait

| | État |
|---|---|
| Back FastAPI, **23 routes** | fait, 162 tests |
| Front React, **10 écrans** | fait, vérifié en navigateur — **aucun test automatique** |
| Les 3 modules IA | **exécutés en réel** sur de vrais supports de cours |
| Découpage des cours longs | fait, 19 tests |
| Anonymisation | fait, 23 tests |
| Import PDF, `.docx`, `.pptx` | fait, 16 tests — tableaux Word et notes de l'orateur inclus |
| Examen blanc multi-cours | fait, 32 tests — **zéro appel au modèle** |
| Recherche et tuteur transversaux | fait, 17 tests |
| Tableau de consommation | fait, 13 tests |
| Banc d'essai (AA5) | fait — 56 appels réels, 5 métriques |
| **162 tests, CI verte** | fait |
| Dépôt GitHub privé | fait — `MiniProjet-StudyAI`, CI verte |
| Maquettes Figma | fait — 17 écrans, 3 schémas |
| Documentation (19 documents + PDF) | fait |

**Les quatre livrables de l'énoncé sont couverts.** Ce qui reste n'est plus du
développement obligatoire : c'est rendre visible et défendable ce qui existe.

---

## MAINTENANT — le chantier en cours

> Révisé le **13 octobre**. Les trois livrables notés sont acquis : application
> web complète, trois modules IA exécutés en réel, rapport technique assemblé.
> Ce qui suit vise ce qui se **voit** et ce qui se **défend**, pas l'ajout de
> fonctionnalités pour elles-mêmes.

**Il n'y a plus de calendrier en jours.** Le code est produit rapidement ; ce
qui limite réellement, c'est le temps de **relecture** — tout ce qui est livré
doit pouvoir être expliqué en soutenance — et le **risque de régression**, le
front n'ayant aucun test. On avance donc par étapes commitées séparément, et
on s'arrête quand ce qui s'ajoute ne peut plus être défendu.

| # | Étape | Pourquoi maintenant |
|---|---|---|
| 1 | **Les messages d'erreur atteignent l'écran** | Le serveur compose « Format non reconnu. Formats acceptés : PDF, Word, PowerPoint » ; l'interface affiche « Certaines informations sont invalides ». Tout le travail de DECISIONS 016 est invisible |
| 2 | **Refonte visuelle** — voir `docs/PROMPT-REFONTE-VISUELLE.md` | Mené **en parallèle**, à la demande du commanditaire : l'interface est pâle. Cinq causes mesurées, du fond de page indiscernable des cartes à l'échelle typographique écrasée |
| 3 | **Tests du front** | Vitest + Testing Library. Débloque tout le reste : sans eux, chaque changement d'interface n'est vérifié que par une capture d'écran |
| 4 | Petits correctifs d'usage | État vide manquant sur Recherche ; deux boutons primaires rivaux ; expiration de session muette ; chargements qui ne disent rien ; import `.txt`/`.md` |
| 5 | **Traduction FR / EN** | Dictionnaire typé, sans dépendance. Corrige au passage les **accents de l'interface** — « Aucun resume pour ce cours », « 8 caracteres minimum » : les prompts ont été accentués en v3, l'interface jamais |
| 6 | ~~**Flashcards à répétition espacée**~~ **FAIT** | Seul vrai manque face aux produits du marché, et réalisable à **zéro appel** : une carte se dérive d'une question de quiz déjà en base. Voir DECISIONS 025 |
| 7 | Documentation, PDF, Figma | Dans le même commit que le code, comme toujours |

### Hors de ma portée, et le plus rentable des huit

**Répéter la démonstration**, cache pré-chauffé la veille. Personne ne peut le
faire à la place de celui qui parlera.

---

## ENSUITE — seulement si les sept étapes sont closes

| Tâche | Note |
|---|---|
| Plan de révision daté | Zéro appel. Relie tentatives, examens et progression au lieu d'ajouter une fonctionnalité de plus |
| Lecture à voix haute du résumé | Zéro appel, API du navigateur. Effet de démonstration réel, utilité discutable |
| Déploiement | Les paliers gratuits s'endorment : 30 s de réveil. À ne pas utiliser pour la démonstration elle-même |
| Plongements comparés à BM25 | `DECISIONS.md` 005 explique pourquoi ce n'est pas prioritaire |

---

## ABANDONNÉ — décidé, pas oublié

- OCR des PDF scannés. Message d'erreur explicite à la place.
- Comptes enseignants, partage de cours.
- Révision espacée, planning.
- Bascule réelle vers Anthropic : implémentée et démontrable, mais non évaluée
  faute de budget.

---

## Déroulé de la soutenance — 15 minutes

Préparé d'avance, chronométré, et **répété**. Une démonstration live qui
improvise perd cinq minutes sur un détail.

| Temps | Contenu | Qui |
|---|---|---|
| 0-1 min | Le problème, le produit en une phrase. Mentionner l'effectif de trois | Emmanuel |
| 1-3 min | Import d'un cours court, résumé, télémétrie à l'écran | Rayen |
| 3-5 min | **« Ce qui a été envoyé au modèle »** — montrer les jetons de masquage | Rayen |
| 5-8 min | Quiz, réponse fausse volontaire, correction côté serveur avec citation du cours | Khalil |
| 8-10 min | Tuteur : une question couverte, puis une question hors cours → « hors du cours » | Khalil |
| 10-12 min | Cours long : le découpage, le résumé par agrégation, les 5 appels | Emmanuel |
| 12-13 min | Un cas d'erreur provoqué (clé retirée → `LLM_KEY_MISSING`) | Emmanuel |
| 13-15 min | Banc d'essai : les chiffres | Khalil |

**Les trois moments qui distinguent le projet** : la vue de transparence, le
refus du tuteur sur une question hors cours, et le traitement d'un cours long
sans troncature. Ils doivent passer même si le temps manque.

**Pannes à anticiper** : quota Gemini épuisé (prévoir un résumé déjà en cache,
le montrer), réseau absent (captures d'écran de secours), PDF récalcitrant
(avoir le texte collé en secours).

---

## Risques

| Risque | Gravité | Parade |
|---|---|---|
| Quota Gemini épuisé pendant la démo | élevée | Cache des résumés ; générer les sorties la veille ; `SEGMENT_CHARS` à 24 000 pour diviser les appels par trois |
| Contribution Git déséquilibrée | élevée | Lots indépendants pour Rayen et Khalil, à démarrer **cette semaine** |
| Effectif de trois | moyenne | Assumé et annoncé en ouverture (hypothèse H3 du PRD) |
| ~~Banc d'essai jamais alimenté~~ | — | **Levé.** 12 mesures en base, chapitre rédigé |
| Supabase non configuré | faible | SQLite fonctionne, la démo est possible sans |
