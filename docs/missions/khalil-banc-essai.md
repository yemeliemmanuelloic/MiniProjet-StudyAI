# Lot Khalil — Banc d'essai des modules IA

**Acquis d'apprentissage visé** : AA5, évaluer la qualité d'une solution
assistée par IA.
**Échéance** : jeudi 15 octobre, pour que les chiffres entrent dans le rapport.
**Branche** : `banc-essai`

---

## Pourquoi ce lot compte

C'est **le seul chapitre du rapport qui ne contient aujourd'hui aucune
mesure**. On sait combien de jetons coûte un résumé et combien de temps il
prend ; on ne sait pas s'il est bon.

Et c'est ce qui sépare un projet qui *utilise* un LLM d'un projet qui
*l'évalue*. Un résultat négatif mesuré vaut mieux qu'une affirmation
flatteuse.

La table `benchmark_runs` existe déjà en base (voir `docs/DATABASE.md`) et
n'attend que d'être alimentée.

---

## Ce qu'il faut produire

### 1. Un corpus d'évaluation — `server/banc/corpus/`

Cinq à huit supports de cours réels, pris dans le module :

- `Seance 5/Atelier 5.pdf` — court, 6 229 caractères
- `Seance 2/Prompt Engineering.pdf` — long, 26 040 caractères, 4 segments
- `Seance 1/Atelier1_...pdf` — très court, 3 308 caractères
- `Fiche module ....pdf` — 9 103 caractères
- un cours d'une autre matière, pour ne pas mesurer que de l'IA
- un cas dégradé : PDF scanné, ou texte de 200 caractères

Pour chaque cours, écrire à la main **cinq questions** dont vous connaissez la
réponse, et **deux questions hors cours**. C'est le travail le plus long, et
c'est lui qui donne de la valeur aux mesures.

### 2. Un script — `server/banc/executer.py`

Il parcourt le corpus, appelle les trois modules via
`app.llm.pipeline`, et enregistre une ligne dans `benchmark_runs`.

```python
from app.llm import pipeline
sortie = pipeline.resumer_cours(texte, "standard")
# sortie.telemetrie : model, version_prompt, temperature,
#                     tokens_in, tokens_out, latence_ms, appels
```

**Attention au quota.** Un résumé de cours long coûte 5 appels. Un passage
complet sur 6 cours × 3 modules peut dépasser le palier gratuit en une
exécution. Prévoir une option `--module resume` pour n'exécuter qu'une partie,
et enregistrer les résultats au fur et à mesure.

### 3. Cinq métriques

| Métrique | Comment la mesurer | Pourquoi elle compte |
|---|---|---|
| **Taux de conformité au schéma** | part des appels validés sans relance | mesure directement l'efficacité des prompts |
| **Taux de fuite** | `redact.taux_de_fuite()` sur des cours où on a injecté des coordonnées connues | prouve l'anonymisation autrement qu'en l'affirmant |
| **Ancrage du quiz** | part des `sourceQuote` **réellement présentes** dans le cours — à vérifier par recherche de chaîne, pas à l'œil | détecte les citations inventées |
| **Justesse du refus** | sur les questions hors cours, part de `grounded: false` ; sur les questions couvertes, part de `grounded: true` | les deux erreurs comptent : refuser à tort est aussi grave qu'inventer |
| **Coût et latence** | jetons et millisecondes, par module, cours court contre cours long | justifie le découpage et son coût |

La troisième est la plus intéressante : elle se vérifie **automatiquement**.
Si `sourceQuote` n'apparaît pas littéralement dans le texte du cours, le modèle
a inventé une citation — et c'est exactement ce que le prompt interdit.

### 4. Un chapitre — `docs/EVALUATION.md`

Un tableau par métrique, et surtout **une conclusion**. Les questions
auxquelles il doit répondre :

- Les prompts tiennent-ils leurs promesses, ou seulement la plupart du temps ?
- Le découpage dégrade-t-il la qualité du résumé par rapport à un cours court ?
- Le tuteur refuse-t-il correctement, ou refuse-t-il trop ?
- Combien coûte réellement un cours de soixante pages ?

---

## Si tu veux aller plus loin

La comparaison **BM25 contre plongements sémantiques** pour la sélection des
passages du tuteur. `docs/DECISIONS.md` (décision 005) explique pourquoi on
n'a pas implémenté les plongements : sur un corpus de la taille d'un cours, le
gain attendu est faible.

**Le mesurer vaudrait mieux que le supposer.** Avec un jeu de questions dont
on connaît le passage qui contient la réponse, on peut calculer pour chaque
méthode la part des questions où le bon passage est retrouvé. Si l'écart est
faible, la décision est validée par une mesure et non par une intuition —
c'est exactement ce qu'on attend d'un chapitre d'évaluation.

---

## Ce qu'il ne faut pas faire

- Mesurer sur des cours inventés. Le corpus doit être réel.
- Présenter une moyenne sans dire sur combien d'exemples elle porte.
- Conclure « ça marche bien ». Donner un chiffre et dire ce qu'il révèle.
- Lancer le banc d'essai la veille : le quota ne pardonne pas.

## Démarrage

```bash
git checkout -b banc-essai
mkdir -p server/banc/corpus
# premier commit : le corpus et les questions de référence
```

Lis `docs/AGENTS.md` et `docs/TESTING.md` avant de commencer.
