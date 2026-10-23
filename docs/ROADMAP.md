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

## Déroulé de la soutenance — mardi 20 octobre, 15 minutes

> Réécrit le 18 octobre **après** une vérification complète (GO), selon
> `docs/archives/PROMPT-VERIFICATION-DEMO.md`. Chaque étape ci-dessous a été exercée
> sur les données réelles, sauf mention contraire. Le pré-chauffage de la
> veille est dans `docs/archives/DEMO-VEILLE.md` : **sans lui, ce déroulé ne tient pas.**

**14 minutes prévues, une de marge.** Répartition : Emmanuel 4 min 30,
Rayen 4 min 30, Khalil 5 min.

| Temps | Qui | À l'écran | La phrase à dire | Plan B |
|---|---|---|---|---|
| 0:00-1:00 | Emmanuel | Page « Mes cours » | « Un étudiant perd du temps à résumer et à s'auto-évaluer ; StudyAI le fait à partir de son propre cours, et nous sommes trois à l'avoir construit. » | — |
| 1:00-3:00 | Rayen | Cours **Atelier SGBL**, onglet Résumé, rail de droite | « Le résumé s'appuie sur le cours seul ; à droite, le modèle, la version du prompt et la latence de chaque sortie. » | Le résumé est déjà en cache : il s'affiche sans appel |
| 3:00-4:30 | Rayen | Cours **Démo — données personnelles**, « Ce qui a été envoyé au modèle » | « Voici le texte exact parti chez le fournisseur : le courriel et le téléphone sont devenus des jetons, avant tout envoi. » | Capture n° 1 |
| 4:30-6:30 | Khalil | Atelier 5, onglet Quiz : générer, répondre faux, valider | « Chaque question cite le passage du cours dont elle vient ; le corrigé se lit aussi sans la couleur, par ✓ et ✕. » | En cas d'échec du fournisseur, le message s'affiche proprement : le dire, puis passer à l'examen blanc, qui ne dépend pas du modèle |
| 6:30-8:00 | Khalil | Atelier 5, onglet Tuteur : « Combien coûte un abonnement à GitHub Copilot ? » | « Le modèle connaît la réponse. Il refuse quand même, parce que le cours n'en parle pas. » | La réponse sourcée et le refus sont déjà dans l'historique de la conversation |
| 8:00-10:00 | Emmanuel | Cartes de SGBL (Espace, puis 3) ; Examen blanc (composer, rendre) ; page Consommation | « Ces fonctions ne coûtent aucun appel : elles réutilisent ce que le quiz a déjà produit. Le compteur n'a pas bougé. » | Aucun : tout est local |
| 10:00-11:30 | Emmanuel | Cours **Chapitre 2 — Prompt Engineering**, onglet Résumé | « Ce cours fait 26 000 caractères. Il n'est pas tronqué : il est découpé en deux, résumé partie par partie, puis fusionné. » | Résumé déjà en cache |
| 11:30-12:30 | Rayen | Second onglet, ouvert sur l'instance **sans clé** (port 5176) : générer un quiz | « Sans clé d'API, l'application ne plante pas : elle dit ce qui manque, et le reste reste utilisable. » | Capture n° 2 |
| 12:30-14:00 | Khalil | Chapitre d'évaluation | « 100 % de sorties conformes sans relance, refus correct sur les 7 questions proches du domaine. Et un modèle plus grand testé : quatre fois plus lent, en échec six fois sur huit sur le palier gratuit. » | Capture n° 3 |

### Ce qui n'a pas été vérifié, et qu'il faut vérifier soi-même la veille

- **La connexion avec le vrai mot de passe** du compte de démonstration : la
  vérification a utilisé un jeton de session, pas le formulaire.
- **L'import par l'interface** : le cours long a été importé par l'API
  pendant la vérification. Le pré-chauffage le refait par l'interface, ce qui
  vaut vérification.

### Trois questions que le jury posera probablement

- **« Où est le machine learning ? »** — Nous n'avons pas entraîné de modèle ;
  nous en intégrons un par API, comme l'énoncé le prévoit (page 5). Notre
  travail porte sur ce qui entoure l'appel. Voir le rapport, sections 3.4 et 6.
- **« Pourquoi du JSON ? »** — L'énoncé le montre dans son propre exemple, et
  c'est ce qui permet de valider, de corriger, de mesurer et de réutiliser
  sans nouvel appel. Rapport, section 6.2.
- **« 14 opérations, mais 2 appels au compteur ? »** — Les opérations
  antérieures au 13 octobre n'enregistraient pas leur nombre d'appels ; le
  tableau le dit au lieu de l'inventer.

---

## Risques

| Risque | Gravité | Parade |
|---|---|---|
| Quota Gemini épuisé pendant la démo | élevée | Cache des résumés ; générer les sorties la veille ; `SEGMENT_CHARS` à 24 000 pour diviser les appels par trois |
| Contribution Git déséquilibrée | élevée | Lots indépendants pour Rayen et Khalil, à démarrer **cette semaine** |
| Effectif de trois | moyenne | Assumé et annoncé en ouverture (hypothèse H3 du PRD) |
| ~~Banc d'essai jamais alimenté~~ | — | **Levé.** 12 mesures en base, chapitre rédigé |
| Supabase non configuré | faible | SQLite fonctionne, la démo est possible sans |
