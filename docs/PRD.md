# Définition du produit

> **Base de ce document.** Le sujet remis par l'enseignant le 8 octobre 2026
> (`docs/StudyAI.png`) tient en une présentation et un tableau de trois
> modules. C'est **l'intégralité de ce qui a été communiqué** : il n'y a pas
> d'autre énoncé à attendre.
>
> Les sections 1 à 3 reproduisent fidèlement ce sujet. Tout ce qui suit est
> **déduit** de l'énoncé général du mini-projet et de décisions de cadrage
> prises par l'équipe. Les hypothèses retenues sont listées en section 9 :
> elles sont assumées, pas en attente de validation.

---

## 1. Le produit

**StudyAI** — application web d'aide à l'étude.

L'étudiant importe ou saisit ses cours ; l'IA l'aide à réviser : elle **résume**
le cours, génère un **quiz QCM** pour s'auto-évaluer, et répond à ses
**questions** dans un chatbot.

**Problème visé** (formulation de l'enseignant) : les étudiants perdent du temps
à résumer leurs cours et à s'auto-évaluer. StudyAI automatise ces tâches.

**Plateforme** : application web, front-end + back-end, comme l'exige l'énoncé
du mini-projet.

---

## 2. Utilisateur

Un seul type d'utilisateur : **l'étudiant**. Pas de rôle enseignant, pas
d'administrateur. C'est une décision de cadrage, pas un oubli — voir
`DECISIONS.md`.

Conséquence sur la sécurité : la seule règle d'accès est la **propriété**. Un
étudiant ne voit que ses cours. Elle est vérifiée par le serveur à chaque
requête, jamais par le navigateur.

---

## 3. Les trois modules IA

Reproduction fidèle du tableau de l'enseignant, avec la réalisation en regard.

| Module | Entrée (sujet) | Sortie (sujet) | Réalisé |
|---|---|---|---|
| 1. Résumé automatique | Texte du cours / PDF | Résumé rédigé du cours | Résumé en prose + points clés + mots-clés + avertissements |
| 2. Génération de quiz QCM | Génère questions, options, bonne réponse, explication | QCM : question, 4 options, bonne réponse, explication | Idem **+ citation du cours** pour chaque question |
| 3. Chatbot sur le cours | Question de l'étudiant + texte du cours | Réponse basée uniquement sur le cours | Idem **+ indicateur d'ancrage et sources citées** |

Les trois ajouts (`warnings`, `sourceQuote`, `grounded`) ne sont pas de
l'enrichissement gratuit : ce sont les garde-fous qui rendent l'ancrage au cours
**vérifiable** plutôt que promis. Voir `PROMPTS.md`.

---

## 4. Parcours utilisateur

```
Inscription / Connexion
        ↓
   Mes cours  ──── (vide) ──→  Ajouter un cours
        ↓                       ├── coller du texte
        ↓                       └── importer un PDF
  Fiche du cours
        ├── onglet Résumé   → niveau de détail, génération, synthèse
        ├── onglet Quiz     → nombre + difficulté, réponses, correction
        └── onglet Tuteur   → questions / réponses ancrées
```

L'onglet actif figure dans l'URL (`?onglet=quiz`) : un rafraîchissement en
pleine démonstration ne ramène pas au début.

---

## 5. Critères d'acceptation

### Module 1 — Résumé

- Produit une synthèse en prose d'au moins 80 caractères, 3 à 12 points clés et
  au plus 15 mots-clés.
- N'ajoute aucune connaissance extérieure au cours, même exacte.
- Conserve la terminologie du cours.
- Un cours long est résumé **en entier**, par agrégation de résumés partiels.
- Un même cours au même niveau n'est pas réanalysé (cache).

### Module 2 — Quiz

- Exactement 4 options par question, une seule correcte.
- Chaque question porte une **citation littérale du cours**.
- La bonne réponse et l'explication **ne descendent pas au navigateur** avant
  soumission.
- La correction est faite côté serveur.
- Sur un cours long, les questions proviennent de parties échelonnées.

### Module 3 — Tuteur

- Répond uniquement à partir du cours.
- Déclare `grounded: false` et laisse les sources vides quand le cours ne permet
  pas de répondre.
- Traite le texte du cours comme une donnée, jamais comme une instruction.

### Module 4 — Espace révision *(hors sujet initial, ajouté par l'équipe)*

- Affiche l'historique des tentatives, la moyenne, le meilleur et le dernier
  score, et la courbe d'évolution.
- Remonte les questions **ratées au moins deux fois**, avec l'extrait du cours.
- N'appelle aucun modèle : tout vient de la table des tentatives.

### Transversal

- Aucune donnée personnelle brute envoyée au modèle.
- Toute sortie validée avant affichage.
- Les cinq cas d'échec du modèle affichés distinctement (clé absente, délai
  dépassé, quota, sortie non conforme, service indisponible).

---

## 6. Hors périmètre

Décidé, pas oublié :

- Pas de compte enseignant, pas de partage de cours entre étudiants.
- Pas d'OCR : un PDF scanné est refusé avec un message explicite.
- Pas de révision espacée ni de planning de révision.
- Pas de recherche sémantique par plongements — voir `DECISIONS.md`, décision 005.
- Pas de mode hors ligne.
- Pas de paiement, pas de quota par utilisateur.

---

## 7. Contraintes

**Temps** : sujet reçu le 8 octobre, soutenance semaine du 19-23 octobre.

**Effectif** : trois étudiants pour un énoncé qui en demande cinq à six. Risque
ouvert, à arbitrer avec l'enseignant.

**Coût** : palier gratuit de Gemini. Les limites ne sont plus publiées par
Google et semblent avoir baissé en 2026 ; le découpage des cours longs
multiplie les appels. D'où le cache des résumés et le plafonnement du nombre
d'appels par module.

**Technique** : application web front + back obligatoire ; appel API vers un
LLM ; les trois exigences de l'énoncé (anonymisation, validation, gestion des
erreurs d'API).

---

## 8. Livrables attendus par l'énoncé

| Livrable | État au 12 octobre |
|---|---|
| Code source versionné | Dépôt local, 3 commits — **pas encore de dépôt distant** |
| Démonstration fonctionnelle | Application exécutable, les 3 modules testés en réel |
| Présentation des prompts | `PROMPTS.md` |
| Rapport technique | `ARCHITECTURE.md` + `DATABASE.md` + `API.md` + `PROMPTS.md` à assembler |

---

## 9. Hypothèses retenues

Le sujet StudyAI est bref et ne traite pas ces points. Plutôt que de les
laisser ouverts, l'équipe tranche et l'écrit. Chaque hypothèse est défendable
en soutenance ; si l'enseignant attendait autre chose, la décision et son
motif sont au moins tracés.

**H1 — Le sujet StudyAI prime sur les exemples de l'énoncé général.**
Le tableau des trois modules est la spécification. Les exemples de l'énoncé
général (génération de CV, documentation automatique, chatbot FAQ) ne sont que
des illustrations.

**H2 — Les trois exigences transversales de l'énoncé général s'appliquent.**
Anonymisation avant envoi, validation des sorties, gestion des erreurs d'appel
API. Le sujet StudyAI ne les répète pas, mais rien n'indique qu'il en dispense,
et ce sont des critères d'évaluation explicites.

**H3 — L'équipe reste à trois.**
L'énoncé demande cinq à six étudiants. Nous sommes trois : Emmanuel Yemeli,
Med Rayen Ben Dhia, Yacoubi Khalil. Le périmètre n'est pas réduit pour autant ;
la répartition des lots en tient compte (voir `missions/`). Le point est
mentionné en ouverture de soutenance plutôt que dissimulé.

**H4 — Le rapport technique suit le plan de l'énoncé.**
Aucun format n'a été imposé. Le rapport reprend donc les quatre chapitres
nommés par l'énoncé : architecture front-end/back-end, choix des frameworks,
API et modèles IA, prompts utilisés. Il est assemblé depuis `docs/`.

**H5 — Le déploiement est un bonus, pas un livrable.**
L'énoncé écrit « idéalement déployée ». La démonstration se fera en local,
depuis le navigateur. Un déploiement sera tenté s'il reste du temps, après le
rapport.

**H6 — Un seul fournisseur de modèle est évalué.**
Gemini en palier gratuit. La bascule vers Anthropic est implémentée et
démontrable, mais le banc d'essai porte sur un seul modèle faute de budget.
