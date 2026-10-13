# Lot Rayen — Espace révision

> **État au 13 octobre : le socle est fait.** L'historique, la progression et
> les questions ratées fonctionnent, testés contre la base Supabase. Ce
> document reste le brief du lot, mis à jour : il décrit ce qui existe, puis
> ce qui reste à faire.
>
> Un mot franc sur le contexte : ce lot existait pour que tes commits
> apparaissent dans le dépôt, la note de groupe étant pondérée par la
> contribution de chacun. Le socle ayant été écrit sans toi, **la suite
> compte double** — c'est elle qui portera ton nom dans l'historique.

---

## Ce qui existe déjà

**Back** — `server/app/services/revision.py`, deux routes dans
`routers/study.py` :

| Route | Rend |
|---|---|
| `GET /api/courses/{id}/attempts` | l'historique des tentatives |
| `GET /api/courses/{id}/progress` | moyenne, meilleur, dernier, courbe, questions ratées |

**Front** — un quatrième onglet « Progression »
(`components/ProgressionPanel.tsx`) : anneau de score moyen, trois compteurs,
courbe d'évolution en SVG, liste des questions ratées avec l'extrait du cours,
et l'historique dépliable.

**Tests** — six, dans `TestProgression` de `tests/test_api.py`.

Deux règles à ne pas casser si tu touches à ce code :

1. **`correctIndex` ne descend jamais au navigateur**, ici comme dans le quiz.
   Un test le vérifie.
2. **Aucun appel au modèle.** Tout vient de la table `quiz_attempts`. C'est ce
   qui rend ce lot indépendant du quota et testable à volonté.

---

## Ce qui reste — l'export PDF de la fiche de révision

C'était la partie « si tu veux aller plus loin » du brief initial. Elle est
maintenant le cœur du lot, et elle a de la valeur en soutenance : montrer une
fiche imprimable produite depuis l'application, c'est concret.

### Ce qu'il faut produire

**Une route** `GET /api/courses/{id}/revision.pdf` qui rend un PDF contenant :

- le titre du cours et la date ;
- le résumé le plus récent — abstract, points clés, mots-clés ;
- les questions ratées au moins deux fois, avec leur extrait de cours ;
- la progression en une ligne : *n tentatives, moyenne x %, meilleur y %*.

**La chaîne existe déjà** : `tools/md2pdf.py` convertit du Markdown en PDF via
Chrome. Deux chemins possibles, à toi de trancher et de justifier ton choix
dans `docs/DECISIONS.md` :

- produire le Markdown côté serveur et réutiliser `md2pdf.py` — simple, mais
  dépend de Chrome sur la machine qui héberge ;
- produire le PDF directement en Python (`reportlab`, `weasyprint`) — une
  dépendance de plus, mais autonome.

**Un bouton** dans l'onglet Progression : « Télécharger ma fiche de révision ».

### Tests attendus

- la route renvoie bien un PDF (`content-type`, et l'octet de tête `%PDF`) ;
- un cours sans résumé ni tentative renvoie une erreur claire plutôt qu'un
  document vide ;
- **un étudiant ne peut pas télécharger la fiche d'un autre** (403).

---

## Démarrage

```bash
git checkout -b fiche-revision
cd server && .venv/Scripts/python.exe -m pytest tests -q   # 75 tests doivent passer
```

Lis `docs/AGENTS.md`, puis `docs/API.md` pour les conventions de contrat et
`server/app/services/revision.py` pour voir d'où viennent les données.

## Ce qu'il ne faut pas faire

- Appeler le modèle pour composer la fiche : tout le contenu existe déjà.
- Calculer quoi que ce soit côté navigateur. Le serveur reste seul juge.
- Faire fuiter `correctIndex` dans le PDF — une fiche de révision contenant
  les réponses ne sert à rien.
