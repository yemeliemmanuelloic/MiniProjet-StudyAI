# Instructions pour l'agent de codage

Ce fichier est lu **en premier**, avant toute modification de code. Il existe pour
une raison simple : sans lui, chaque nouvelle session redécouvre le projet et
réinvente des décisions déjà prises, différemment.

---

## 1. Contexte

**Projet** : StudyAI — assistant de révision. L'étudiant importe un cours, l'IA
le résume, génère un QCM d'auto-évaluation et répond à ses questions.

**Cadre** : mini-projet du module *IA for Software Engineering* (IASE0001,
5SAE9, A.U. 2026-2027) à ESPRIT. Noté à 100 % sur ce projet.

**Équipe** : Emmanuel Yemeli, Med Rayen Ben Dhia, Yacoubi Khalil — **trois
personnes alors que l'énoncé en demande cinq à six**. Point non résolu avec
l'enseignant, à ne pas oublier.

**Échéance** : soutenance semaine 7 (19-23 octobre 2026), démonstration live de
15 minutes.

**Ne pas confondre avec SkillMatch**, qui occupe le dossier voisin. SkillMatch
est le projet de stage ingénieur d'Emmanuel, pas ce mini-projet. Les deux
partagent une partie de leur architecture, jamais leurs documents.

---

## 2. Source de vérité

Avant une modification non triviale, lire le document concerné dans `docs/` :

| Document | Question à laquelle il répond |
|---|---|
| `PRD.md` | Que construit-on, et qu'exclut-on ? |
| `ARCHITECTURE.md` | Comment le système est-il structuré ? |
| `DATABASE.md` | Quelles données, quelles relations ? |
| `API.md` | Quels contrats HTTP ? |
| `SECURITY.md` | Qu'est-ce qui doit être protégé ? |
| `TESTING.md` | Comment sait-on que ça marche ? |
| `PROMPTS.md` | **Livrable noté** : les prompts envoyés au modèle |
| `DECISIONS.md` | Pourquoi ces choix, et quelles alternatives écartées ? |

En cas de contradiction entre un document et le code : **signaler, ne pas
trancher seul**.

---

## 3. Les quatre règles qui ne se négocient pas

**1. Le module LLM ne s'appelle que par `app/llm/pipeline.py`.**
Trois fonctions publiques : `resumer_cours`, `generer_quiz`,
`repondre_question`. Elles prennent le texte brut et rendent une sortie
validée. Tout le reste — anonymisation, découpage, appels, validation,
réhydratation — est interne au paquet.
Ne jamais importer `app/llm/client.py` en dehors de `app/llm/`. Ce serait
rendre possible un appel au modèle sans masquage, et la règle de
confidentialité ne serait plus garantie par la structure mais par la vigilance.

**2. Ce qui ne valide pas n'existe pas.**
Toute sortie du modèle passe par un schéma Pydantic de `app/schemas/llm.py`.
Une sortie non conforme déclenche **une** relance, puis une erreur
`LLM_INVALID_OUTPUT`. Jamais de stockage ni d'affichage d'une sortie non
validée.

**3. Les prompts sont versionnés, jamais modifiés en place.**
Une évolution crée une version à côté (`_V2`), avec une note expliquant ce qui
change et pourquoi. Sans cela, les mesures du banc d'essai ne comparent plus
rien.

**4. Un cours n'est jamais tronqué en silence.**
S'il dépasse la capacité, il est découpé. Si une limite subsiste malgré tout,
elle apparaît dans les `warnings` du résumé, visible par l'étudiant.

---

## 4. Conventions

**Langue** : commentaires, noms de variables et messages utilisateur en
français, **sans accents dans le code Python et TypeScript** (l'encodage de la
console Windows de l'équipe les mange). Les fichiers Markdown, eux, sont
accentués normalement.

**Nommage** : `snake_case` en Python, `camelCase` dans le JSON de l'API et dans
le front. La conversion est automatique (`alias_generator=to_camel`) — ne pas
la faire à la main.

**Commentaires** : expliquer *pourquoi*, pas *quoi*. Un commentaire qui
paraphrase la ligne suivante est à supprimer. Les commentaires qui documentent
un défaut constaté et sa correction sont précieux : les garder.

**Dépendances** : ne pas en ajouter sans nécessité démontrée. Le projet appelle
les fournisseurs de modèle en HTTP direct plutôt que par leurs SDK, exprès.

---

## 5. Démarche attendue

Avant d'implémenter :

1. lire le ou les documents concernés ;
2. lire le code existant avant de le modifier ;
3. identifier les fichiers touchés, les changements de base et d'API ;
4. identifier les tests à écrire ;
5. proposer un plan court.

Après avoir implémenté :

```bash
cd server && .venv/Scripts/python.exe -m pytest tests -q
cd client && npx tsc --noEmit && npm run build
```

Puis relire le diff, et mettre à jour la documentation si le comportement
documenté a changé.

---

## 6. Ce qu'il ne faut pas faire

- Lancer une migration, un script d'amorçage ou une commande qui modifie
  l'environnement **sans demander**. Reproche déjà formulé par Emmanuel : il
  veut garder la main sur ces opérations.
- Inventer une exigence produit. Si le sujet du prof ne la couvre pas, le dire.
- Déclarer une fonctionnalité terminée sans l'avoir exécutée. Sur ce projet,
  **toutes** les erreurs réelles ont été trouvées à l'exécution, aucune à la
  relecture.
- Toucher au dossier SkillMatch.

---

## 7. État au 12 octobre 2026

Back FastAPI complet (14 routes), front React complet, 68 tests, 3 commits.
Les trois modules ont été exécutés avec de vrais appels à Gemini sur de vrais
supports de cours.

Il manque : le projet Supabase (une base SQLite locale sert en attendant), le
dépôt GitHub distant, les maquettes Figma, et les lots de Rayen et Khalil.
