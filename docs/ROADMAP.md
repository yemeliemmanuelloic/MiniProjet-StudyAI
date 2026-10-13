# Feuille de route jusqu'à la soutenance

**Aujourd'hui** : lundi 12 octobre 2026.
**Soutenance** : semaine 7, du 19 au 23 octobre. 15 minutes de démonstration
live + questions, présence des trois membres requise.

Il reste **sept à onze jours** selon le créneau. Ce document existe pour une
raison : à trois sur un énoncé prévu pour cinq ou six, le seul risque sérieux
est de disperser l'effort sur des améliorations pendant que les livrables
notés manquent.

---

## Ce qui est déjà fait

| | État |
|---|---|
| Back FastAPI, 14 routes | fait, testé |
| Front React, 7 écrans | fait, testé en navigateur |
| Les 3 modules IA | **exécutés en réel** sur de vrais supports de cours |
| Découpage des cours longs | fait, 19 tests |
| Anonymisation | fait, 23 tests |
| 68 tests, CI verte | fait |
| Dépôt GitHub privé | fait — `MiniProjet-StudyAI`, CI verte |
| Maquettes Figma | fait — 16 écrans, 3 schémas |
| Documentation (9 documents) | fait |

**Les quatre livrables de l'énoncé sont donc déjà couverts à 80 %.** Ce qui
reste est de l'assemblage et de la préparation, pas du développement.

---

## MAINTENANT — à finir avant jeudi 15

Par ordre de priorité. Si le temps manque, on coupe par le bas.

| # | Tâche | Qui | Pourquoi c'est prioritaire |
|---|---|---|---|
| 1 | Projet Supabase + `.env` | Emmanuel | Seul point encore bloquant ; SQLite dépanne mais une démo sur base réelle est plus crédible |
| 2 | **Rapport technique assemblé** | Emmanuel | Livrable noté. Assemblé depuis `docs/`, pas réécrit |
| ~~3~~ | ~~Maquettes Figma~~ | Emmanuel | **Fait** — 16 écrans, voir `MAQUETTES.md` |
| 4 | Banc d'essai (AA5) | Khalil | Seul chapitre du rapport sans aucune mesure |
| ~~5~~ | ~~Espace révision~~ | — | **Fait.** Reste l'export PDF de la fiche de révision, toujours ouvert pour Rayen |
| 6 | Premiers commits de Rayen et Khalil | eux | **La note est pondérée par les commits Git** |

Le point 6 n'est pas une formalité administrative. L'énoncé dit :
*« la note de groupe peut être pondérée par la contribution de chaque membre
(commits Git, répartition des tâches) »*. Un dépôt où tout vient d'un seul
compte pénalise les deux autres.

---

## ENSUITE — vendredi 16 au dimanche 18

| Tâche | Qui |
|---|---|
| Intégration des lots de Rayen et Khalil | tous |
| Chapitre « évaluation » du rapport, avec les chiffres du banc d'essai | Khalil → Emmanuel |
| Jeu de démonstration : 3 cours préparés (court, long, PDF scanné pour l'erreur) | Rayen |
| Répétition chronométrée de la démonstration | tous |
| Relecture croisée du rapport | tous |

---

## PLUS TARD — seulement si tout le reste est fini

- Déploiement (front sur Netlify/Vercel, back sur Render/Railway).
- Plongements sémantiques comparés à BM25 — intéressant, mais `DECISIONS.md`
  explique pourquoi ce n'est pas prioritaire.
- Limitation de débit par utilisateur.
- Tests du front.

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
| Banc d'essai jamais alimenté | moyenne | C'est le seul chapitre du rapport sans mesures ; lot de Khalil, priorité 4 |
| Supabase non configuré | faible | SQLite fonctionne, la démo est possible sans |
