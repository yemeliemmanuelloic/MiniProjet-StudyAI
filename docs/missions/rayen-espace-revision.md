# Lot Rayen — Espace révision

**Échéance** : jeudi 15 octobre.
**Branche** : `espace-revision`

---

## Pourquoi ce lot

Aujourd'hui, StudyAI génère un quiz, le corrige… et oublie tout. L'étudiant ne
sait pas s'il progresse, ni sur quoi il se trompe. Or la table
`quiz_attempts` **enregistre déjà chaque tentative** : le score, le total, la
date, et les réponses données. Ces données existent et personne ne les
affiche.

C'est le lot le plus visible en démonstration : il transforme un outil de
génération en outil de révision.

**Il n'appelle aucun modèle.** Donc : pas de consommation de quota, pas de
dépendance au réseau, et un développement qu'on peut tester à volonté. C'est
voulu — ça te rend indépendant des deux autres lots.

---

## Ce qu'il faut produire

### 1. Back — deux routes

Dans `server/app/routers/study.py`, en suivant exactement le style des routes
existantes (dépendance `Authentifie`, vérification de propriété par
`study.cours_de`, modèle de réponse Pydantic).

**`GET /api/courses/{id}/attempts`** — l'historique des tentatives d'un cours.

```json
{ "attempts": [
    { "id": "…", "quizId": "…", "score": 4, "total": 5,
      "difficulty": "standard", "createdAt": "…" }
] }
```

**`GET /api/courses/{id}/progress`** — la synthèse.

```json
{
  "attemptCount": 7,
  "averageScore": 68,
  "bestScore": 90,
  "lastScore": 80,
  "trend": [60, 60, 75, 80, 90],
  "weakQuestions": [
    { "question": "…", "wrongCount": 3, "sourceQuote": "…" }
  ]
}
```

`weakQuestions` est le cœur du lot : parcourir les tentatives, croiser
`answers` avec le `correctIndex` du quiz correspondant, et remonter les
questions **ratées plusieurs fois**. C'est ce qui dit à l'étudiant quoi
réviser.

⚠️ Même règle que pour le quiz : `correctIndex` ne descend pas au navigateur.
Tu renvoies la question et sa citation, pas la bonne réponse.

### 2. Front — un quatrième onglet

Un onglet **« Progression »** dans `client/src/pages/CoursDetailPage.tsx`, à
côté de Résumé, Quiz et Tuteur, avec un composant
`client/src/components/ProgressionPanel.tsx`.

Il affiche :

- le nombre de tentatives, la moyenne, le meilleur score ;
- une **courbe simple** des scores dans le temps — en SVG écrit à la main, pas
  de bibliothèque de graphiques ; dix points ne justifient pas 200 Ko de
  dépendance ;
- la liste des questions ratées plusieurs fois, avec l'extrait du cours ;
- un **état vide** soigné : « Aucune tentative pour ce cours. Lancez un quiz
  dans l'onglet Quiz. » Un écran blanc passe toujours pour un bug.

Réutilise les composants de `client/src/components/ui.tsx` — `Bouton`,
`Pastille`, `Alerte`, `EtatVide`, `Score`, `Chargement`. **N'écris aucune
couleur en dur** : tout passe par les variables de `index.css`.

### 3. Tests

Dans `server/tests/test_api.py`, en suivant le style existant (voir
`conftest.py` pour les fixtures `client`, `etudiant`, `faux_modele`) :

- une progression vide renvoie des compteurs à zéro, pas une erreur ;
- après deux tentatives, la moyenne est correcte ;
- une question ratée deux fois apparaît dans `weakQuestions` ;
- **un étudiant ne voit pas la progression d'un autre** (403) ;
- `correctIndex` n'apparaît nulle part dans la réponse.

Le dernier est le plus important : c'est la règle du projet.

---

## Si tu veux aller plus loin

**Export PDF d'une fiche de révision** : le résumé du cours plus les questions
ratées, en un document imprimable. L'outil existe déjà —
`tools/md2pdf.py` convertit du Markdown en PDF. Il suffirait de produire le
Markdown côté serveur.

À ne faire **qu'après** que les trois points ci-dessus fonctionnent et soient
testés.

---

## Ce qu'il ne faut pas faire

- Calculer la moyenne côté navigateur. Le serveur est seul juge, ici comme
  ailleurs.
- Ajouter une bibliothèque de graphiques.
- Modifier les fichiers des autres lots (`llm/`, `segmentation.py`).
- Livrer sans état vide.

## Démarrage

```bash
git checkout -b espace-revision
cd server && .venv/Scripts/python.exe -m pytest tests -q   # doit passer avant de commencer
```

Lis `docs/AGENTS.md`, puis `docs/API.md` pour les conventions de contrat, et
`docs/DATABASE.md` pour la table `quiz_attempts`.
