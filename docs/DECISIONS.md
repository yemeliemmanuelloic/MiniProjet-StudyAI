# Décisions techniques

Chaque décision est consignée avec son contexte, les alternatives écartées et
ce qu'elle coûte. Le but est double : ne pas rediscuter dix fois la même
chose, et pouvoir répondre en soutenance à « pourquoi ce choix ? » autrement
que par « c'est ce qu'on connaissait ».

---

## 001 — Back-end en Python / FastAPI

**Date** : 12 octobre 2026 · **État** : accepté

**Contexte.** La première version du back était en Node/TypeScript, héritée de
SkillMatch. L'énoncé autorise explicitement Node comme Django ou Flask : les
deux sont conformes.

**Décision.** Migrer vers Python 3.12+ / FastAPI / Pydantic / SQLAlchemy.

**Alternatives.**

- *Rester sur Node* — zéro coût immédiat, mais extraction PDF faible et
  écosystème moins mûr pour le traitement de textes longs.
- *Next.js en monolithe* — le chemin le plus court vers un déploiement, écarté
  parce que l'énoncé insiste sur « front-end **+** back-end » et qu'un
  monolithe se défend moins bien en deux tiers à l'oral.

**Raisons.** La documentation OpenAPI est produite automatiquement et sert de
pièce au rapport. PyMuPDF respecte l'ordre de lecture sur les mises en page à
deux colonnes, fréquentes dans un support de cours. Et tous les ateliers du
module sont en Python : le correcteur lit du Python toute l'année.

**Conséquences.** Positif : `/docs` gratuit, extraction PDF correcte, tests
rapides. Coût : deux écosystèmes au lieu d'un, et les types du front doivent
rester cohérents avec les schémas du back à la main. Égalité réelle sur la
validation — Pydantic et Zod se valent, prétendre le contraire serait
malhonnête.

---

## 002 — Découper les cours longs plutôt que les tronquer

**Date** : 12 octobre 2026 · **État** : accepté

**Contexte.** La version précédente coupait à 20 000 caractères et envoyait le
début. Un cours de soixante pages était donc résumé à partir de son premier
tiers, **sans aucun signalement**. Le pire genre de défaut : le résultat a
l'air correct.

**Décision.** Découper en segments respectant les paragraphes, puis les
phrases, avec recouvrement. Résumé par agrégation, quiz sur segments
échelonnés, tuteur sur segments sélectionnés.

**Alternatives.**

- *Augmenter simplement la limite* — les modèles actuels encaissent de très
  longs contextes, mais la qualité se dégrade au milieu, et le coût croît.
- *Laisser tronquer en l'annonçant* — honnête mais inutile.

**Conséquences.** Positif : plus rien ne disparaît en silence ; si une limite
subsiste, elle apparaît dans les `warnings`. Coût : **le nombre d'appels est
multiplié**. Atténué par le cache des résumés, le plafonnement par module, et
le choix de la taille de segment — voir décision 012.

---

## 003 — Sessions synchrones plutôt qu'asynchrones

**Date** : 12 octobre 2026 · **État** : accepté

**Contexte.** FastAPI invite à écrire des routes `async`. Le pooler de
transactions de Supabase interdit les requêtes préparées, ce qui demande une
configuration délicate en asyncpg et produit des pannes difficiles à
diagnostiquer.

**Décision.** Routes `def`, sessions SQLAlchemy synchrones. FastAPI les exécute
dans un pool de fils d'exécution.

**Raison.** Le gain serait nul à notre échelle : quelques étudiants, et un
appel au modèle de plusieurs secondes qui domine de toute façon la latence.

**Conséquence.** À très forte charge il faudrait reconsidérer. Ce n'est pas le
cas d'usage.

---

## 004 — Appeler les fournisseurs en HTTP direct, sans SDK

**Date** : 12 octobre 2026 · **État** : accepté

**Décision.** `httpx` plutôt que `google-generativeai` et `anthropic`.

**Raisons.** La requête est visible dans le code, donc explicable en
soutenance. La traduction des défaillances dans notre taxonomie est entièrement
maîtrisée — un SDK masque les codes HTTP derrière ses propres exceptions. Et
une dépendance de moins par fournisseur.

**Conséquence.** Il faut suivre soi-même les évolutions d'API. Acceptable :
deux fournisseurs, deux points d'entrée.

---

## 005 — Recherche lexicale (BM25) plutôt que plongements

**Date** : 12 octobre 2026 · **État** : accepté, à réexaminer

**Contexte.** Le tuteur doit choisir quels passages envoyer. Deux approches :
comparer les **mots** (BM25) ou comparer le **sens** (plongements).

**Décision.** BM25 pour l'instant.

**Alternatives.**

- *Plongements par l'API Gemini* — même clé, aucune dépendance nouvelle,
  déploiement inchangé. Consomme du quota.
- *Plongements locaux via Hugging Face* — ne consomme aucun quota, mais ajoute
  PyTorch et un modèle de plusieurs centaines de méga-octets, ce qui rend
  l'hébergement gratuit improbable. Or l'énoncé demande une application
  « idéalement déployée ».

**Raison.** Sur un corpus de la taille d'un cours — vingt à soixante pages —
la recherche sémantique rapporte peu. Trois segments couvrent déjà une grande
partie du document, et le modèle lit très bien ce qu'on lui donne. La sélection
n'a pas besoin d'être brillante pour que la réponse soit bonne. Les plongements
amélioreraient un maillon qui n'est pas celui qui limite la qualité.

**Limite assumée.** Une question qui n'emploie aucun mot du cours sera mal
servie. Documenté dans `services/segmentation.py`.

**À réexaminer.** La comparaison BM25 / plongements, mesurée sur un jeu de
questions dont on connaît la bonne réponse, est un excellent sujet pour le banc
d'essai (AA5). Un résultat négatif mesuré vaut mieux qu'une fonctionnalité
ajoutée sans preuve.

---

## 006 — Anonymiser une fois, avant le découpage

**Date** : 12 octobre 2026 · **État** : accepté

**Contexte.** Avec le découpage, le masquage pouvait se faire segment par
segment.

**Décision.** Masquer le cours **entier** d'abord, découper ensuite.

**Raison.** Des jetons numérotés indépendamment par segment donneraient
`[NOM_1]` désignant une personne dans un segment et une autre dans le suivant.
L'agrégation mélangerait les identités.

**Conséquence.** La question de l'étudiant et l'historique doivent être masqués
dans le **même** passage que le cours, pour partager la table de jetons. D'où
l'astuce de la cloison : les trois textes sont assemblés avec un séparateur
unique, masqués ensemble, puis redécoupés.

---

## 007 — Un seul type d'utilisateur

**Date** : 10 octobre 2026 · **État** : accepté

**Décision.** Pas de rôle enseignant, pas d'administrateur.

**Raison.** Le sujet ne décrit qu'un étudiant qui importe ses cours. Ajouter
des rôles serait inventer une exigence.

**Conséquence.** Pas de garde par rôle : la seule règle d'accès est la
propriété, vérifiée côté serveur. Le code en est simplifié, et la sécurité plus
facile à démontrer.

---

## 008 — Garder le masquage des noms malgré sa faible utilité

**Date** : 12 octobre 2026 · **État** : accepté

**Contexte.** Le module d'anonymisation vient de SkillMatch, où l'entrée était
un CV. Dans un support de cours, le risque est tout autre.

**Décision.** Conserver le module entier, mais **requalifier sa justification**
dans le rapport : les secrets et les coordonnées de tiers, pas les données de
l'étudiant.

**Raison.** L'énoncé l'exige explicitement. Et le risque réel est démontrable :
un fichier distribué dans ce module contient un jeton Hugging Face en clair.

**Limite écrite.** Les patronymes ne sont pas détectés, et un test le
documente. Mieux vaut l'énoncer que le laisser découvrir.

---

## 009 — Base SQLite acceptée en plus de PostgreSQL

**Date** : 12 octobre 2026 · **État** : accepté

**Décision.** Déclarer les colonnes JSON en `JSONB` avec une variante `JSON`,
et ne passer les options psycopg qu'en PostgreSQL.

**Raison.** Permet d'exécuter la suite de tests de bout en bout sans base
distante ni conteneur. Une chaîne de traitement qu'on ne peut pas exécuter en
test n'est vérifiée par personne.

**Effet de bord utile.** L'application entière tourne en local sans Supabase,
ce qui a débloqué la démonstration pendant que le projet Supabase n'existait
pas encore.

---

## 010 — Ports distincts de SkillMatch

**Date** : 12 octobre 2026 · **État** : accepté

StudyAI : front **5174**, back **3002**. SkillMatch garde 5173 et 3001. Les
deux projets doivent pouvoir tourner en même temps.

---

## 011 — Mélanger les options du quiz côté serveur

**Date** : 13 octobre 2026 · **État** : accepté

**Contexte.** À la première série de quiz enregistrés en base, **cinq bonnes
réponses sur six se trouvaient en position A**. Un QCM dont la réponse est
presque toujours la première n'évalue rien : l'étudiant apprend la position,
pas le cours. Le défaut n'était visible qu'en regardant les données, pas en
lisant une question isolée.

**Décision.** Redistribuer la position de la bonne réponse dans le code, après
validation et avant enregistrement (`pipeline.melanger_options`).

**Alternative écartée.** Ajouter au prompt « varie la position de la bonne
réponse ». Ce serait confier une garantie à l'obéissance du modèle, alors
qu'une ligne de code la rend certaine. Même raisonnement que pour la règle
d'anonymisation : ce qui doit être garanti est porté par la structure, pas par
la consigne.

**Conséquence.** Un test unitaire vérifie que les positions varient **et** que
le mélange ne change jamais *quelle* réponse est correcte. Un test existant,
qui supposait une position fixe, a dû être réécrit : il testait la doublure du
modèle, pas la correction.

---

## 012 — Segments de 24 000 caractères plutôt que 8 000

**Date** : 13 octobre 2026 · **État** : accepté

**Contexte.** La taille des segments gouverne directement la consommation de
quota : un résumé coûte un appel par segment, plus un appel d'agrégation. Or
Google ne publie plus les limites du palier gratuit de Gemini, et plusieurs
sources rapportent des baisses importantes courant 2026. Tomber à court de
requêtes pendant la démonstration est le risque le plus concret du projet.

**Décision.** Porter `SEGMENT_CHARS` de 8 000 à 24 000.

**Mesure sur le même cours** (`Prompt Engineering.pdf`, 26 040 caractères) :

| `SEGMENT_CHARS` | Segments | Appels | Jetons | Latence | Points clés |
|---|---|---|---|---|---|
| 8 000 | 4 | 5 | 9 389 + 2 299 | 22 392 ms | 10 |
| 24 000 | 2 | 3 | 7 391 + 1 398 | 18 735 ms | 8 |

**Raison.** 40 % d'appels en moins pour un résumé un peu moins granulaire. La
valeur initiale de 8 000 était prudente : elle datait d'avant toute mesure, et
les modèles actuels encaissent des contextes bien plus larges.

**Ce que ça coûte.** Un grain de synthèse plus grossier — huit points clés au
lieu de dix. Sur un cours de vingt-six mille caractères, l'écart est réel mais
sans conséquence pédagogique.

**Ce que ça ne change pas.** Aucun contenu n'est perdu dans les deux cas : le
cours est traité en entier, et une éventuelle amputation reste signalée dans
les `warnings`.

**Réversible.** C'est une variable d'environnement. Un groupe disposant d'un
quota confortable peut revenir à 8 000 sans toucher au code.
