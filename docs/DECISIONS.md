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

---

## 013 — Des erreurs qui disent quoi faire, et un garde-fou contre la page blanche

**Date** : 13 octobre 2026 · **État** : accepté

**Contexte.** Le bandeau d'erreur disait ce qui s'était passé — *« Le quota
d'analyses est atteint »* — et s'arrêtait là. L'étudiant restait devant un
rectangle rouge sans issue. Par ailleurs, une exception JavaScript dans un
composant démontait tout l'arbre React et laissait une **page blanche** : ni
message, ni recours, et rien pour comprendre.

**Décision.** Trois mesures.

1. `lib/erreurs.ts` associe à chaque code une **famille**, une **conduite à
   tenir** et un indicateur `reessayable`. Le bandeau affiche une icône, le
   message, le conseil, les actions possibles et le code technique.
2. Un **garde-fou React** (`components/GardeFou.tsx`) entoure les routes — mais
   pas l'en-tête, pour que l'utilisateur garde sa navigation même si une page
   s'effondre.
3. Une **page Figma dédiée** rend les onze codes tels qu'ils s'affichent.

**Le point qui compte.** `reessayable` reflète exactement la politique de
reprise du serveur : pas de bouton « Réessayer » sur un quota épuisé, une clef
refusée ou un délai dépassé, parce que **le serveur lui-même ne réessaie pas**
dans ces cas. L'interface ne promet rien que le back ne tienne.

**Alternative écartée.** Une page pleine par code d'erreur. Ce serait un recul :
quand un résumé échoue, l'étudiant doit garder son cours à l'écran et pouvoir
relancer. Le bandeau contextuel est le bon motif pour une erreur récupérable ;
les pages pleines sont réservées aux cas sans contexte à préserver — page
introuvable, session expirée, erreur inattendue.

**Défaut trouvé au passage.** Une panne réseau faisait rejeter `fetch` avec un
`TypeError`, qui n'a ni code ni message utilisable : l'interface sortait de son
propre contrat d'erreur dès que le serveur était injoignable, et affichait
« Failed to fetch ». Rattrapé dans `lib/api.ts`, avec un conseil spécifique.

---

## 014 — reportlab pour la fiche de révision, pas la chaîne Markdown → Chrome

**Date** : 13 octobre 2026 · **État** : accepté

**Contexte.** Le projet produit déjà des PDF avec `tools/md2pdf.py`, qui passe
par Chrome en mode sans interface. La fiche de révision aurait pu réutiliser
cette chaîne.

**Décision.** Produire la fiche avec `reportlab`, directement en Python.

**Raison.** `md2pdf.py` convient à une conversion lancée à la main, pas à une
requête HTTP : il dépend de la présence de Chrome sur la machine hôte et met
plusieurs secondes. reportlab rend la main en quelques dizaines de
millisecondes et n'a aucune dépendance système.

**Alternative écartée** : `weasyprint`, qui convertirait du HTML et permettrait
de réutiliser la charte. Il réclame GTK et Pango, pénibles à installer sous
Windows — et l'équipe travaille sous Windows.

**Conséquence.** Une dépendance de plus, et une mise en page décrite en Python
plutôt qu'en CSS. Les deux chaînes coexistent : Chrome pour les documents du
dépôt, reportlab pour ce que l'application sert à chaud.

---

## 015 — Accentuer les prompts, et lier le cache à leur version

**Date** : 13 octobre 2026 · **État** : accepté

**Contexte.** Défaut constaté en imprimant la première fiche de révision : les
sorties du modèle revenaient **en français sans accents**. « Ce cours presente
les ateliers du module… ». La cause n'était pas la bibliothèque PDF — vérifié,
reportlab rend les accents sans difficulté — mais le texte stocké en base.

Le modèle imitait le style des consignes, elles-mêmes écrites sans accents par
une convention de code destinée à la console Windows. Cette convention n'avait
aucune raison de s'appliquer à du texte envoyé au modèle.

**Décision.** Un fragment `LANGUE` partagé, **lui-même accentué**, ajouté aux
quatre prompts, qui passent en v3.

**Et une seconde décision, plus importante.** La version du prompt entre dans
la clé de cache des résumés. Sans elle, cette correction serait restée
invisible : les résumés déjà produits continuaient à s'afficher sans accents.
Toute amélioration future des consignes se propage désormais d'elle-même.

**Ce que ça coûte.** Un changement de prompt invalide le cache et relance les
analyses — donc consomme du quota. C'est le prix d'une correction qui prend
effet.

**Leçon.** Un défaut invisible à l'écran peut être criant à l'impression. Ce
sont les livrables qui sortent de l'écran — ici une fiche imprimée — qui
révèlent ce genre de chose.

---

## 016 — Refuser un cours trop long, et plafonner les appels au modèle

**Date** : 13 octobre 2026 · **État** : accepté

**Contexte.** Une revue du projet a trouvé deux trous que la documentation
contredisait.

**Le premier.** `routers/courses.py` coupait le contenu à `MAX_COURSE_CHARS`
sans rien dire. Mesuré : 476 000 caractères envoyés, 200 000 stockés,
**276 000 perdus**, HTTP 201, aucun avertissement. C'est exactement le défaut
que le découpage avait corrigé plus loin dans la chaîne — mais à l'import, là
où l'utilisateur regarde.

**Décision.** Refuser en 400, avec le nombre de caractères en trop et la
limite. Plutôt que tronquer avec un avertissement : l'étudiant sait quoi
faire, au lieu de croire son cours complet. Un cours de plus de 200 000
caractères — soixante pages — gagne de toute façon à être découpé.

**Le second.** `RATE_LIMITED` figurait dans la taxonomie depuis le début sans
qu'aucune route ne l'émette. Un double-clic suffisait à déclencher deux
générations de quiz ; dix clics épuisaient le quota du jour, au pire moment.

**Décision.** Une fenêtre glissante en mémoire, dix appels par minute et par
utilisateur, posée uniquement sur les trois routes qui appellent le modèle.
Consulter ses cours ou sa progression ne coûte rien et n'est pas plafonné.

**Ce que ça ne fait pas.** Ne protège pas d'un abus déterminé : un utilisateur
peut créer plusieurs comptes. L'objectif est d'éviter l'accident. Et sur
plusieurs instances, il faudrait un magasin partagé.

**Leçon.** Les deux défauts étaient des **écarts entre la documentation et le
code** : une garantie affirmée mais contournable, et un code d'erreur qui ne
pouvait pas survenir. Ce sont les plus dangereux, parce que personne ne les
surveille — on croit le problème traité.

---

## 017 — Lire aussi les `.docx` et les `.pptx`, et les lire correctement

**Date** : 13 octobre 2026 · **État** : accepté

**Contexte.** StudyAI n'acceptait que le PDF. Or les supports de ce module
sont distribués en **PowerPoint** pour les cours et en **Word** pour les
ateliers : sur les neuf fichiers de l'énoncé, aucun n'est un PDF. L'étudiant
devait donc convertir chaque fichier à la main avant de pouvoir s'en servir —
un travail que la machine fait mieux, et qui dégradait au passage la mise en
page.

**Décision.** Trois lecteurs derrière une seule entrée, `services/extraction.py`.
PyMuPDF pour le PDF, python-docx et python-pptx pour le reste : deux
bibliothèques **Python pures**, donc rien à installer sur le poste — le même
critère qui avait fait écarter weasyprint au profit de reportlab (décision 012).

### Le format est choisi sur l'extension, pas sur le type MIME

Le navigateur annonce le type que le système d'exploitation lui souffle, et
Windows envoie régulièrement `application/octet-stream` pour un `.pptx` selon
l'application qui a créé le fichier. **Mesuré** : deux des cinq supports
d'essai sont arrivés en `application/octet-stream`. Un contrôle sur le type
MIME les aurait refusés.

L'extension, elle, est ce que l'étudiant voit. Et elle n'est pas le dernier
mot : le format réel est vérifié juste après, par le lecteur lui-même —
python-docx refuse une archive qui n'est pas un paquet Word. *L'extension
oriente, le lecteur tranche.* Le même critère est appliqué côté navigateur
(`accept=".pdf,.docx,.pptx"`), de sorte que les deux filtres ne peuvent pas
diverger.

### Trois défauts d'extraction, trouvés en sondant les vrais fichiers

Aucun des trois n'aurait produit d'erreur. Tous les trois auraient dégradé
silencieusement la qualité des résumés — la pire catégorie de défaut sur ce
projet.

| Défaut | Mesure sur les supports du module |
|---|---|
| `document.paragraphs` **ignore les tableaux** | 271 caractères sur 1 602 dans `Atelier 3.docx`, soit **17 %** — et dans un atelier, le tableau est la grille de notation |
| `slide.shapes` suit l'ordre d'**empilement**, pas de lecture | Diapo 2 de `Chapitre5.pptx` : titre → **numéro de page** → image → corps. Les 54 diapos injectaient 54 chiffres orphelins |
| Espaces de **largeur nulle** (`\u200b`) au milieu des mots | Présents dans `Prompt Engineering.pptx`. Invisibles, mais ils brisent un mot pour toute comparaison de chaînes |

Le troisième mérite un mot : il n'est cosmétique qu'en apparence. Un caractère
invisible dans un mot fait échouer le contrôle d'**ancrage du quiz** sur une
citation parfaitement fidèle, et produit des jetons fantômes dans le découpage
en mots de **BM25**. C'est le même piège que l'ancrage strict du banc d'essai
(EVALUATION.md section 5) : la mesure et le texte doivent parler la même langue.

### Les notes de l'orateur sont incluses — et c'est une décision de fond

Sur un diaporama de cours, les diapositives sont télégraphiques et
l'explication vit dans les notes. **Mesuré sur `séance1-Introduction.pptx` :
42 diapositives sur 50 portent des notes, qui représentent 31 % du texte du
support.** Les écarter, c'était résumer le squelette d'un cours en ignorant le
cours.

Vérifié par un vrai appel : à la question « dans quels domaines autres que le
logiciel l'IA est-elle présente ? », le tuteur répond « santé, finance,
industrie » **et cite la note comme source**. Les trois mots sont absents des
diapositives et présents dans les notes — contrôlé par programme. Sans les
notes, le tuteur aurait refusé cette question, à juste titre et pour une
mauvaise raison.

**Le coût, honnêtement.** Certaines notes sont des mémos de production et non
de la pédagogie : `Chapitre5.pptx` contient « Logo EUR-ACE » et « Taille 54 ».
Elles entrent dans le cours. Nous ne les filtrons pas, parce qu'aucune règle ne
distingue un mémo d'une explication sans risquer d'écarter du contenu réel — et
parce que 31 % de contenu utile vaut mieux qu'une poignée de notes de mise en
page.

### Le plafond de taille passe de 8 à 25 Mo

Un diaporama est très défavorable sur le rapport octets/texte :
`séance1-Introduction.pptx` pèse 4,6 Mo pour 29 000 caractères utiles, soit
**160 octets par caractère** — le reste est en images. Ce support passait sous
l'ancien plafond, mais sans marge. Le format et la taille sont vérifiés
**avant** la lecture des octets, ce qui préserve la correction de la
décision 016.

**Leçon.** Les trois défauts d'extraction ont été trouvés en **sondant les
vrais fichiers avant d'écrire le lecteur**, pas en relisant la documentation
des bibliothèques. Un extracteur naïf aurait fonctionné sans jamais lever
d'erreur, en perdant un tiers du cours.

---

## 018 — Examen blanc multi-cours, et pourquoi il ne coûte rien

**Date** : 13 octobre 2026 · **État** : accepté

**Contexte.** La boucle de révision s'arrêtait à « un cours, un quiz ». Or
avant un examen réel, un étudiant révise **plusieurs chapitres à la fois**, et
veut savoir s'il tient dans le temps imparti. C'était la pièce manquante entre
« générer des questions » et « se préparer ».

### La propriété centrale : zéro appel au modèle

Les questions viennent des **quiz déjà générés**, qui sont en base. Composer
un examen de vingt questions sur quatre cours ne déclenche donc aucun appel :
l'étudiant peut en passer dix dans l'heure sans entamer son quota. Sur un
projet contraint par un palier gratuit, c'est la différence entre une
fonctionnalité utilisable et une démonstration unique.

La génération des questions manquantes existe, mais elle est **demandée
explicitement** (`completer: true`), annoncée comme payante dans l'interface,
et soumise au plafond de débit. Jamais déclenchée en silence.

Cette propriété est **vérifiée par un test**, pas seulement affirmée :
`test_composer_un_examen_n_appelle_pas_le_modele` compte les appels à la
doublure avant et après. Une affirmation de coût qui n'est pas testée est une
affirmation qui dérivera.

### Les questions sont figées dans la ligne, pas référencées

Un examen aurait pu stocker des couples (quiz, rang). Il stocke une copie des
questions. **Duplication assumée** : un quiz peut être régénéré ou supprimé, et
un examen passé la semaine dernière doit rester corrigible exactement tel qu'il
a été passé. Un examen dont la correction change après coup ne vaut rien comme
trace de révision. La normalisation cède devant la reproductibilité.

Pour la même raison, la table `exams` est rattachée à l'**étudiant** et non à
un cours : supprimer un cours ne doit pas emporter l'examen qui portait aussi
sur les trois autres.

### Le temps est mesuré, pas imposé

Le serveur fait foi sur la durée écoulée — il recalcule `remainingS` à chaque
lecture, donc trafiquer l'horloge du navigateur ne donne rien. Mais une copie
rendue en retard est **corrigée quand même**, et simplement marquée. Un outil
de révision n'a aucune raison de punir : l'étudiant veut savoir s'il a dépassé,
pas perdre son travail.

En revanche, une copie déjà rendue **ne peut pas l'être deux fois**. Sans ce
garde-fou, il suffirait de lire le corrigé puis de renvoyer le formulaire.

### Le déficit de questions est redistribué, et signalé

Demander dix questions sur deux cours dont l'un n'en a que trois en rend
**dix**, pas huit : le déficit est repris sur le cours qui a du stock, par
tours successifs pour ne pas faire porter tout le rattrapage au premier cours
venu. Et l'étudiant est averti que l'équilibre n'a pas été tenu, avec le
détail par cours.

### Un filtre mesuré, puis écarté

Deux quiz successifs sur le même cours reposent souvent la même question. Le
dédoublonnage compare les énoncés normalisés — accents, ponctuation et casse
retirés — ce qui attrape les reformulations de surface.

Il laisse passer les **doublons sémantiques**. Observé en conditions réelles :
« Quel est le prix de base par nuit pour une chambre standard *dans le fichier
booking_engine.py* ? » et « … *selon le cours* ? » se sont retrouvées dans le
même examen.

Un filtre par similarité de Jaccard semblait la réponse évidente.

> **Correction du 13 octobre, en fin de journée.** La première rédaction de
> cette décision justifiait le refus par une mesure : un doublon réel à 0,63
> contre deux questions légitimes à 0,75, donc des populations qui se
> chevauchent. **Ce contre-exemple à 0,75 était inventé** — écrit à la main
> pour éprouver l'idée, pas tiré des données. Justifier un refus par un
> chiffre fabriqué est précisément le défaut que ce projet reproche ailleurs.
> La mesure a été refaite sur les données réelles ; elle ne dit pas la même
> chose, et la conclusion a changé de raisons.

### Ce que disent les données réelles

Sur les 18 questions en base, soit 88 paires issues d'un même cours :

| Seuil de Jaccard | Paires supprimées | Faux positifs observés |
|---|---|---|
| 0,55 | 5 | **0** |
| 0,65 | 3 | **0** |
| 0,70 | 1 | **0** |

Les cinq paires au-dessus de 0,55 sont **toutes** de vrais doublons, jusqu'à
0,88 pour « Quel message d'erreur s'affiche… » contre « Quel est le message
d'erreur affiché… ». Aucune paire légitime n'atteint ce niveau dans les
données observées. **Le filtre est donc mieux fondé que la première rédaction
ne le prétendait.**

Une seconde piste a été mesurée puis écartée pour de bon : dédoublonner sur la
**citation source identique**, en supposant que deux questions tirées du même
passage testent le même fait. Résultat : **3 doublons pour 3 faux positifs**,
une pièce de monnaie. Deux questions parfaitement distinctes naissent
couramment du même passage — « quel langage pour les scénarios ? » et « quel
outil de test comportemental ? ».

### Pourquoi le filtre n'est quand même pas en place

Trois raisons, dont aucune n'est celle qui avait été écrite :

1. **L'échantillon est minuscule** : 18 questions, 2 cours, un seul domaine.
   Calibrer un seuil là-dessus est du surapprentissage. Rien ne garantit que
   la fenêtre propre 0,55–0,65 survive à un cours de droit ou de mathématiques.
2. **L'erreur du filtre serait invisible.** Un doublon qui passe, l'étudiant le
   voit et hausse les épaules. Une question légitime supprimée, personne ne
   sait qu'elle a existé. Le bénéfice se constate, le coût jamais : c'est la
   pire forme possible pour une heuristique, parce qu'elle aura toujours l'air
   de fonctionner.
3. **L'enjeu reste faible** : un doublon coûte une question gâchée sur vingt.

La fréquence, en revanche, avait été sous-estimée : **5 paires proches sur
18 questions**, soit près d'une question sur trois impliquée. Sur un examen de
dix questions, il faut s'attendre à un ou deux doublons.

### Ce qui a été fait à la place : déprioriser, pas supprimer

À la composition, chaque question est choisie en préférant celle qui ressemble
le moins à celles déjà retenues ; si le stock ne suffit pas, une question
proche est prise **quand même**. La raison n° 2 disparaît entièrement : rien
n'est perdu en silence, l'examen garde son compte exact, et un doublon
n'apparaît que faute d'alternative. Le seuil cesse d'être une suppression
irréversible pour devenir une préférence.

La diversité est calculée sur l'**examen entier**, pas cours par cours : une
question du second cours proche d'une question déjà retenue dans le premier
est dépriorisée elle aussi.

**Mesure, sur les 18 questions en base, 2 000 compositions par ligne :**

| Questions demandées | Doublons au hasard | Avec dépriorisation | Examens sans doublon |
|---|---|---|---|
| 5 | 0,33 | **0,00** | 70 % → **100 %** |
| 8 | 0,91 | **0,00** | 35 % → **100 %** |
| **10** | **1,47** | **0,00** | **16 % → 100 %** |
| 12 | 2,13 | **0,00** | 4 % → **100 %** |
| 14 | 2,94 | **0,00** | 0 % → **100 %** |

Au point d'usage normal — dix questions tirées de dix-huit — un examen sur six
seulement était exempt de doublon. **Aucune question perdue sur 10 000
compositions.**

Deux réserves, dites plutôt que tues. Le « 0,00 » n'est pas une garantie : il
tient parce que ce vivier est peu dense en répétitions, et sur un vivier plus
riche le glouton n'aurait pas toujours d'alternative. Ce qui est garanti, c'est
de ne jamais faire pire qu'un tirage au hasard. Et le gain disparaît en dessous
de 1,2× de marge de stock : l'étudiant qui demande autant de questions qu'il en
possède les prend toutes, doublons compris — ce qui est le comportement
correct.

### Les tests ne protégeaient d'abord que la fonction, pas son branchement

Six tests couvraient `_choisir_varie`. Deux mutations volontaires de
`composer` — revenir à un tirage au hasard, et recalculer la diversité cours
par cours — **laissaient les trente-deux tests verts**. On pouvait débrancher
la fonctionnalité sans qu'une alerte se déclenche.

Deux tests de plus appellent donc le **service**, avec une graine fixée et des
énoncés fabriqués — la doublure du modèle produit des questions toutes proches
les unes des autres, ce qui ne permet de distinguer aucun tirage. Les deux
mutations tombent désormais.

*C'est la troisième fois dans ce projet qu'un test vert ne protège rien.* Les
trois fois, la cause est la même : avoir vérifié l'unité et supposé le
câblage.

**Leçon.** La première version de cette décision concluait juste pour une
mauvaise raison, et c'est plus dangereux qu'une erreur franche : le raisonnement
avait l'air mesuré. **Un contre-exemple construit par celui qui veut conclure
n'est pas une mesure.** Il faut aller le chercher dans les données, même — et
surtout — quand on a déjà son avis.

---

## 019 — Recherche et tuteur sur toute la bibliothèque

**Date** : 13 octobre 2026 · **État** : accepté

**Contexte.** Un étudiant qui révise ne sait pas toujours dans quel chapitre
une notion a été vue — c'est souvent la vraie question : « où ai-je vu
l'exécution symbolique ? ». StudyAI obligeait à ouvrir chaque cours et à
interroger son tuteur l'un après l'autre.

### Deux actions, deux coûts, dits explicitement

| Route | Coût | Pourquoi |
|---|---|---|
| `GET /api/search` | **0 appel** | purement lexical, en local |
| `POST /api/ask` | **1 appel**, quel que soit le nombre de cours | la sélection des passages est faite avant, gratuitement |

Dix cours ne coûtent donc pas dix fois plus cher qu'un seul. Les deux coûts
sont **affichés dans l'interface** : sur un palier gratuit, c'est la seule
façon pour l'étudiant de savoir ce qu'il consomme.

Et la recherche fonctionne **sans clé d'API** — donc pendant une panne du
fournisseur, ce qui est exactement le moment où l'on veut encore pouvoir
réviser.

### Le BM25 est extrait, pas recopié

La formule vivait dans `selectionner`, au service du tuteur d'un cours. Elle
est désormais dans `scores_bm25`, partagée. Deux implémentations de la même
formule auraient fini par diverger, et la seconde n'aurait été testée par
personne — un test le vérifie explicitement.

Le déplacement a révélé un **coût quadratique** : la fréquence documentaire de
chaque terme était recalculée pour chaque segment, soit O(segments² × termes).
Invisible sur les trois segments d'un cours, sensible sur les segments de
toute une bibliothèque. Elle est maintenant calculée une fois.

**L'IDF est calculé sur toute la bibliothèque**, pas cours par cours. C'est le
point : un mot banal dans un cours mais rare dans les autres pèse alors
correctement, ce qui est précisément le signal cherché quand on demande « dans
lequel de mes cours ai-je vu ça ? ».

### Le découpage est refait à chaque recherche

Les segments ne sont stockés nulle part. Les conserver demanderait une table
de plus et une invalidation à chaque modification de cours, pour économiser une
suite d'expressions régulières sur du texte déjà en mémoire. Le compromis est
assumé ; il deviendrait discutable bien au-delà du volume qu'un étudiant
accumule en un semestre.

### La limite lexicale, mesurée puis réduite

La recherche compare des **mots**, pas du sens. Une requête qui n'emploie aucun
mot du cours ne trouve rien, même si la notion y est (DECISIONS 005).

Un cas précis est apparu à l'essai : **« binome » ne trouvait rien dans
`Atelier 3.docx`**, qui écrit pourtant « le travail se fait en binômes ». Pas
de racinisation : les jetons sont comparés entiers, et `binomes ≠ binome`.
C'est le ratage le plus fréquent en français, et le plus déroutant — l'étudiant
voit le mot de ses propres yeux dans son document.

**Corrigé côté requête uniquement** : chaque terme cherché est élargi à ses
variantes singulier/pluriel. Le choix de l'endroit est délibéré —
`scores_bm25` est partagée avec la sélection des passages du tuteur d'un cours,
dont les mesures sont publiées dans EVALUATION.md. Modifier la façon dont les
termes s'apparient invaliderait ces chiffres ; élargir la requête ne change
rien pour l'appelant qui ne le demande pas.

Ce n'est **pas** une racinisation : « tester » ne trouvera toujours pas
« test ». La limite est réduite à sa forme la plus gênante, pas supprimée.

### Les réponses transversales ne sont pas enregistrées

Un échange qui traverse plusieurs cours ne se rattache à aucun. L'accrocher au
cours le plus représenté serait une approximation visible dans l'historique, et
créer une neuvième table pour un échange que l'étudiant poursuivra de toute
façon dans le tuteur du bon cours ne se justifie pas. Les sources nommant leur
cours, le chemin de reprise existe.

### Zéro passage : répondre sans appeler

Quand aucun passage ne correspond, la réponse « non couverte » est produite
**sans appel au modèle**. Ce n'est pas qu'une économie : c'est plus juste. Le
modèle n'aurait eu aucun passage à lire, aurait conclu la même chose, avec en
prime le risque de compléter par ses connaissances générales.

**Leçon.** Les deux décisions les plus structurantes de ce module portent sur
l'**endroit** d'un changement, pas sur le changement lui-même : extraire BM25
plutôt que le recopier, et élargir la requête plutôt que la fonction de score.
Au mauvais endroit, les deux auraient marché — et abîmé autre chose.

---

## 020 — Tableau de consommation : montrer ce que l'IA coûte

**Date** : 13 octobre 2026 · **État** : accepté

**Contexte.** Toute la télémétrie était enregistrée à chaque opération depuis
le premier jour — modèle, version de prompt, température, jetons, latence — et
n'apparaissait **nulle part**. Des données collectées que personne ne regarde
ne servent à rien ; pire, elles donnent l'illusion d'une mesure.

Sur un module intitulé *IA for Software Engineering*, savoir ce qu'un appel
coûte fait partie du sujet. Et sur un palier gratuit, c'est la seule façon de
savoir où l'on en est avant de tomber sur un quota épuisé en pleine révision.

### Une opération n'est pas un appel — et le compte était jeté

Le pipeline comptait déjà les appels réels (`Telemetrie.appels`) : un par
segment, plus l'agrégation pour un résumé long. **Ce compte n'était pas
persisté.** Et `segmentCount` ne permet pas de le reconstruire : pour un quiz,
le nombre d'appels dépend aussi du nombre de questions demandé *et* de
`SEGMENTS_QUIZ`, un paramètre de configuration qui a pu changer depuis. Une
formule fragile aurait affiché un chiffre faux avec aplomb.

Migration 0004 : colonne `calls`, **nullable**. Les lignes antérieures restent
à `NULL` et sont comptées **à part**, jamais fondues dans le total. Le tableau
affiche « — » plutôt que « 0 ».

### Trois partis pris contre la fausse précision

1. **Le tarif est affiché avec sa source.** Les prix viennent d'agrégateurs
   tiers consultés le 13 octobre, qui ne s'accordaient pas entre eux ; la page
   officielle de Google fait foi. Un chiffre d'argent présenté sans sa
   provenance se lit comme un fait.
2. **Les opérations sans décompte sont visibles**, pas lissées.
3. **Les économies du cache ne sont pas estimées.** Ce serait le chiffre le
   plus parlant, et rien ne l'enregistre. La section « ce qui n'a rien coûté »
   ne montre que ce qui est réellement compté : les examens blancs et les
   questions qu'ils ont servies.

**Leçon.** Les trois décisions de ce module portent sur ce qu'il ne faut
**pas** afficher. Un tableau de coûts qui arrondit ses trous est pire que pas
de tableau : il donne confiance.

---

## 021 — Refonte visuelle : les jetons, et le plafond de contraste

**Date** : 13 octobre 2026 · **État** : accepté · *étape 1 sur 5*

**Contexte.** Retour du commanditaire : l'interface est **pâle**. Le reproche
est juste, et il était mesurable — cinq causes, pas une impression :

| Cause | Mesure |
|---|---|
| Page et carte quasi identiques | `#f7f8fa` contre `#ffffff` : **3 %** d'écart de luminance |
| Aucun système d'élévation | **3** `box-shadow` dans toute la feuille de style |
| Bordures invisibles | `#e5e7eb` sur blanc = **1,2:1** |
| Hiérarchie typographique écrasée | base **14 px**, `h1` **26 px** — rapport de 1,86 pour toute l'échelle |
| Rien ne réagit | **1** `@keyframes`, 5 transitions |

**La cause la moins évidente est probablement la principale** : la marque
n'existait qu'en une couleur et sa version claire. Sans gamme, la seule façon
de l'employer était l'aplat plein — donc on l'employait peu. Une charte à une
seule couleur produit mécaniquement une interface grise.

**Décision.** Une couche de jetons refaite : gamme de marque en sept valeurs,
neutres légèrement **froids** (à côté d'un rouge chaud, un gris pur paraît
sale), trois niveaux d'élévation nommés, échelle typographique de base 16 en
sept crans, et des durées de mouvement.

### Le contraste plafonne le goût, pas l'inverse

C'est le point qui mérite d'être retenu. Le fond de page ayant foncé pour se
distinguer des cartes, le texte secondaire devenait trop clair : `#6b7280`
tombait à **4,17:1**, sous le seuil AA. Il a donc fallu le foncer aussi.

Puis un lavis teinté a été ajouté en tête de page — deux halos dilués qui
colorent l'air autour du titre. Une première version plus soutenue a été
**mesurée à 4,21:1** dans le pire cas et **annulée**.

| Texte secondaire sur | Avant | Après |
|---|---|---|
| Carte blanche | 4,83 | **6,05** |
| Fond de page | *4,17 si inchangé* | **5,26** |
| Lavis chaud | — | **5,20** |
| Lavis froid | — | **5,00** |
| Texte principal sur carte | 16,69 | **17,74** |

Tout monte, rien ne descend. **Le caractère vient du filet de titre et de
l'élévation, pas de la saturation du fond** — c'est la contrainte qui a
décidé, et le résultat n'en est pas moins net.

### Une régression introduite et corrigée dans la même heure

Élargir les liens de navigation a produit **68 px de débordement horizontal**
sur un écran de 375 px, là où il y en avait zéro. Constaté en mesurant
`scrollWidth - clientWidth`, pas en regardant une capture : à cette échelle,
l'œil ne voit rien. La barre défile désormais dans son propre cadre.

L'en-tête passe au passage de 179 à **153 px**, et devient collant.

### Ce que cette étape ne fait pas

Elle pose les jetons et traite l'en-tête, les cartes et les boutons. Les cinq
écrans prioritaires, la densité des tableaux de chiffres et les illustrations
d'états vides viennent ensuite — voir `PROMPT-REFONTE-VISUELLE.md`.

**Leçon.** Sur un chantier visuel, **la mesure protège du goût autant que de
l'erreur**. Deux fois en une heure, elle a tranché contre ce qui paraissait
mieux à l'écran : un lavis trop saturé, et une navigation plus aérée qui
cassait le téléphone.

### Étape 2 — l'écran d'authentification

> Ajouté à la décision 021 plutôt qu'isolé : même chantier, mêmes contraintes.

C'est la première image de l'application, et la première de la démonstration.
Trois défauts y ont été trouvés, dont deux n'avaient rien de visuel.

**Un nombre magique devenu faux.** La règle disait
`min-height: calc(100vh - 69px)` : 69 px était la hauteur de l'en-tête le jour
où la ligne a été écrite. Elle en fait **153** aujourd'hui sur un écran
étroit. La hauteur restante est désormais obtenue par le flux — `#root` en
colonne flexible, le `main` qui s'étire — et plus aucun chiffre n'est à tenir
à jour. *Un nombre magique tiré d'une mesure devient faux dès que la mesure
change, et personne ne le remarque.*

**Un contraste à six centièmes du seuil.** Les descriptions des trois modules
étaient en blanc à 85 % d'opacité sur le rouge : **4,53:1**, sur du texte de
13,5 px. Techniquement conforme, pratiquement imprudent — la moindre retouche
du fond le faisait passer sous la barre. Porté à 92 % : **5,14:1**, pour une
nuance que personne ne perçoit.

**Une valeur en dur dans le TSX.** `style={{ fontSize: 22 }}` sur le titre du
formulaire, en contradiction avec la règle que la feuille de style énonce
elle-même en commentaire. Remplacé par un jeton.

Côté visuel : l'aplat de rouge plein devient un dégradé diagonal du ton
soutenu vers le plus sombre, avec un halo qui porte le regard vers le logo et
une trame de points estompée vers les bords — assez discrète pour se sentir
sans se voir. Les trois modules portent un filet vertical qui reprend celui
des titres de page. Le panneau droit, qui était un aplat gris, reçoit le même
lavis froid que les pages intérieures.

**Gain mesuré sur téléphone** : le formulaire commençait sous la ligne de
flottaison, il faut compter le panneau rouge entier avant d'atteindre le
premier champ. Il démarre maintenant à **503 px sur 812** — visible sans
défiler. Aucun débordement horizontal, vérifié par `scrollWidth - clientWidth`.

### Étape 3 — la liste des cours

C'est l'écran que le jury regardera le plus longtemps. Le défaut n'était pas
d'abord esthétique.

**L'action destructrice était la plus visible de la carte.** « Supprimer »
était un bouton bordé, aligné à droite, du même poids visuel que le titre du
cours. Pendant ce temps, l'action principale — ouvrir le cours — n'était
qu'un lien sur le titre, sans la moindre affordance : ni survol, ni curseur,
ni élévation. *L'interface mettait en avant la seule chose qu'on ne veut pas
faire par erreur.*

La suppression devient une icône discrète à 45 % d'opacité, qui ne se colore
qu'au survol de la carte. Et la **carte entière** ouvre le cours.

**Comment la carte devient cliquable sans balisage invalide.** Imbriquer un
`<button>` dans un `<a>` est interdit. Le titre porte donc un lien dont le
pseudo-élément `::after` couvre toute la carte, et le bouton de suppression
repasse au-dessus par `z-index`. Les deux comportements ont été vérifiés par
`document.elementFromPoint` plutôt qu'à l'œil :

| Vérification | Résultat |
|---|---|
| Clic à 120 px du bord droit, mi-hauteur | ouvre `/cours/{id}` |
| Clic au centre de l'icône de suppression | atteint le bouton, pas le lien |

Trois corrections de lisibilité l'accompagnent : une **pastille d'initiale**
qui ancre l'œil dans une liste où toutes les lignes se ressemblaient, des
**séparateurs en point** dans les métadonnées qui formaient un seul bloc gris,
et un état **« Pas encore analysé »** là où il n'y avait qu'un vide quand le
cours n'avait ni résumé ni quiz.

**Un `Chargement…` en texte nu** a été remplacé par le squelette utilisé
partout ailleurs. Il a été repéré par accident : le panneau du navigateur
s'est suspendu pendant l'audit, la requête est restée en suspens, et l'écran
a affiché ce mot seul indéfiniment. L'incident venait de l'outil, pas de
l'application — mais il a montré ce que voit un utilisateur dont le réseau
décroche.

Et une valeur en dur de plus retirée du TSX : `style={{ fontSize: 15 }}`.

### Étape 4 — l'examen blanc et son corrigé

**Une régression fonctionnelle, introduite à l'étape 1.** Rendre l'en-tête
collant l'a mis en concurrence avec la barre de chronomètre, collante elle
aussi, à `top: 0`. L'en-tête a gagné : **pendant une épreuve chronométrée, le
compte à rebours disparaissait entièrement.** Mesuré — barre à 101 px de bas,
en-tête à 153, `z-index` 5 contre 20.

Elle n'aurait pas été vue sur une capture d'écran prise en haut de page. Elle
n'apparaît qu'en défilant, pendant un examen, c'est-à-dire exactement au
moment où le chiffre compte.

**Le correctif refuse le nombre magique.** Figer la hauteur de l'en-tête dans
le CSS reproduirait le `calc(100vh - 69px)` retiré la veille : elle change
avec la largeur, la navigation passant à la ligne sur téléphone. Un
`ResizeObserver` la mesure et la publie dans `--hauteur-entete` ; la barre
s'y réfère, et `scroll-padding-top` avec elle, pour qu'aucun ancrage ne
dépose du contenu sous l'en-tête.

**Un piège au passage** : `ResizeObserver` rend `contentRect`, qui **exclut
le remplissage et la bordure**. Première mesure : 132 px pour un en-tête qui
en fait 153 — le chronomètre restait caché de 21 px. Corrigé en relisant la
boîte complète. *Une mesure fausse est pire qu'une absence de mesure : elle a
l'air juste.*

### Le corrigé doit survivre au projecteur

Les bonnes et mauvaises réponses se distinguaient par la seule couleur. Elles
portent désormais un **marqueur** — ✓ et ✕ — en plus du fond. Un corrigé est
projeté en soutenance, parfois imprimé, et lu par des gens dont 8 % des
hommes confondent le rouge et le vert.

La **citation du cours** passe du gris au fond teinté de marque avec un filet
coloré. C'est la preuve de l'ancrage, l'argument central du projet : elle ne
doit pas être le texte le plus effacé de l'écran.

L'option sélectionnée pendant l'épreuve est marquée par une **ombre interne**
plutôt qu'une bordure plus épaisse : épaissir la bordure décale le texte d'un
pixel et fait sauter la liste entière au clic.

### Une couleur corrigée par cohérence, pas par goût

`--succes` sur son propre fond clair mesurait **4,57:1** dans le corrigé — la
même marge dérisoire refusée le matin même sur l'écran de connexion. Foncé.

| Couleur d'état sur son fond | Avant | Après |
|---|---|---|
| Succès | 4,57 | **6,04** |
| Erreur | 5,30 | 5,30 |
| Alerte | 4,98 | 4,98 |
| Info | 5,49 | 5,49 |

*La règle vaut pour toutes les couleurs, pas seulement pour celles qu'on
regarde au moment où on l'énonce.*

### Étape 5 — la densité de la page Consommation

**Le tableau devient un graphique sans gagner une colonne.** Sept colonnes de
chiffres ne disent pas quel module pèse le plus. La cellule de coût porte
désormais une barre proportionnelle, dessinée en CSS à partir d'une propriété
`--part` posée par le composant. Lecture immédiate : Quiz 1,00 · Résumé 0,67 ·
Tuteur 0,44.

S'y ajoutent des lignes alternées — sur sept colonnes, l'œil perd sa ligne —
un en-tête en petites capitales avec un filet plus marqué, et une mise en
avant du coût parmi les cinq chiffres clés : **cinq chiffres de même poids,
c'est aucun chiffre.**

**Un en-tête de tableau collant, essayé puis retiré.** Le tableau vit dans un
conteneur `overflow-x: auto`, qui devient alors son contexte de défilement :
l'en-tête se figeait au milieu du tableau et recouvrait une ligne de données.
Un `thead` collant suppose que le tableau soit lui-même la zone qui défile.

### La régression la plus instructive de la refonte

Première vérification de cette page sur téléphone : **522 px de débordement
horizontal**, et le conteneur censé faire défiler le tableau ne défilait pas.

J'ai diagnostiqué **deux fois de suite une mauvaise cause**, avec aplomb :
d'abord `min-width: auto` sur le conteneur du tableau, puis sur le `main`.
J'ai écrit dans le fichier un commentaire affirmant que le défaut était
antérieur à la refonte. Les deux correctifs n'ont rien changé, et
l'affirmation était fausse.

Ce qui a tranché : une comparaison empirique de cinq candidats appliqués en
direct, et un test de bissection — remettre `#root` en `display: block`
ramenait le débordement de 522 à **zéro**, établissant que la régression
venait bien de l'étape 2.

| Candidat | Débordement | Largeur de la page |
|---|---|---|
| état constaté | 522 px | 897 px |
| `min-width: 0` sur le conteneur du tableau | 522 px | 897 px |
| `min-width: 0` sur le `main` | 522 px | 897 px |
| `overflow-x: clip` sur `#root` | **0** | 897 px |
| **`width: 100%` sur le `main`** | **0** | **375 px** |

`overflow-x: clip` supprimait la barre de défilement en laissant la page
large de 897 px : il **masque le symptôme**. Écarté — une correction qui
rend le défaut invisible sans le supprimer est pire que pas de correction.

**La cause réelle** : rendre `#root` flexible à l'étape 2 a transformé chaque
`main` en enfant flex, dont la largeur `auto` se résout sur le contenu et non
sur le conteneur. C'est la **page** qui débordait, pas le tableau — ce qui
explique pourquoi son conteneur à défilement ne servait plus à rien.

**Leçon.** Une hypothèse plausible, écrite en commentaire avec assurance,
reste une hypothèse. Celle-ci était fausse deux fois. Le coût d'un test
empirique de cinq lignes était nul ; celui d'un commentaire faux laissé dans
le code aurait été payé par le prochain qui l'aurait cru.

### Étape 6 — la fiche de cours, et la pastille de coût

**Les onglets étaient stylés par une douzaine de valeurs écrites en ligne** —
couleurs, graisses, épaisseur du filet, espacements — en contradiction directe
avec la règle que la feuille de style énonce dans son propre en-tête :
*« aucune couleur, ombre, rayon ou taille de texte n'est écrite en dur
ailleurs »*. Passés en classes.

**La pastille de coût.** C'est l'ajout qui compte sur cet écran. Trois onglets
déclenchent un appel au modèle, le quatrième lit la base. L'interface le
disait en prose, en bas de page, après coup. Chaque onglet porte désormais
**« 1 appel »** ou **« gratuit »**, à l'endroit exact où la décision se prend.

La singularité de ce projet n'est pas d'appeler un modèle — tout le monde le
fait — c'est de dire ce que ça coûte. Le dire une fois dans le rapport et
nulle part dans l'écran, c'était la garder pour soi.

La classe est **réutilisable** : elle a vocation à se poser sur toute action
pouvant consommer un appel.

| Élément | Contraste |
|---|---|
| Pastille « 1 appel » | 4,98 |
| Pastille « gratuit » | 6,04 |
| Onglet actif | 9,56 |
| Onglet inactif | 5,26 |

**Troisième `Chargement…` en texte nu** remplacé par le squelette. Les trois
étaient dans trois fichiers différents, écrits à trois moments différents —
le genre d'incohérence qu'un composant partagé existe précisément pour
éviter, quand on pense à s'en servir.

Sur téléphone, quatre onglets portant chacun une pastille ne tiennent pas sur
375 px : la barre défile dans son propre cadre, comme la navigation
principale. Vérifié — zéro débordement de page.

---

## 022 — Les messages d'erreur atteignent enfin l'écran

**Date** : 16 octobre 2026 · **État** : accepté

**Le défaut.** Le serveur compose des messages précis : « Ce cours fait
475 997 caractères, soit 275 997 de trop », « Ouvrez le fichier dans
PowerPoint et enregistrez-le en .pptx », « Réessayez dans 12 secondes ». Le
client les **jetait**. `api.ts` construisait `new ApiError(code, details)`
sans le message, et la classe retombait sur une table de onze phrases
génériques.

Mesuré en envoyant un `.zip` à l'import :

| | |
|---|---|
| Ce que le serveur répond | « Format non reconnu. Formats acceptés : PDF, Word (.docx) et PowerPoint (.pptx). » |
| Ce que l'étudiant lisait | « Certaines informations sont invalides. » |

**Tout le travail de la décision 016 sur la taxonomie d'erreurs n'atteignait
jamais l'écran.** C'est le genre d'écart le plus coûteux : le soin est réel,
la dépense aussi, et le bénéfice nul.

### Pourquoi le client recompose au lieu d'afficher la phrase du serveur

Afficher directement le message réglait le problème en une ligne. Il fige
pourtant le français dans **51 levées d'exception** côté serveur, ce qui rend
la traduction prévue à l'étape 5 impossible sans toutes les réécrire.

Le serveur envoie déjà des `details` structurés — `{caracteres, limite}`,
`{extension, acceptes}`, `{attente_s}`. Le client compose à partir d'eux,
dans la langue active. Trois niveaux de repli, dans l'ordre :

1. `details` reconnus → message composé côté client, **traduisible** ;
2. message du serveur → précis, mais figé en français ;
3. table par code → générique, dernier recours.

**Quinze des 51 levées portent des détails** ; ce sont les plus utiles. Les
36 autres passent par le niveau 2 et gagnent quand même en précision. Aucune
ligne du serveur n'a été touchée.

Chaque composeur rend `null` quand les détails attendus manquent, pour ne
jamais produire « soit undefined caractères de trop ».

**Vérifié de bout en bout** dans l'interface, pas seulement par test : un
cours de 206 799 caractères affiche désormais *« soit 6 799 de trop. La
limite est de 200 000. Découpez-le en plusieurs cours. »*

### Les premiers tests du front, et pourquoi ce sujet

Le projet avait 162 tests côté serveur et **zéro côté interface**. Vitest est
installé, et les treize premiers tests portent sur ce composeur.

Le sujet n'est pas choisi au hasard : la refonte visuelle venait d'introduire
**trois régressions en une soirée** — navigation débordante, chronomètre
d'examen caché, page large de 897 px sur un écran de 375. Aucune n'était
visible sur une capture d'écran, et rien ne les aurait arrêtées.

Un des treize a échoué au premier essai, pour une bonne raison :
`toLocaleString('fr-FR')` sépare les milliers par une **espace fine
insécable** (U+202F), pas par une espace ordinaire. C'était le test qui avait
tort, pas le code. Rendu indifférent au type d'espace — un piège qui aurait
resurgi au premier test de formatage de nombres.

Les tests sont **ajoutés à l'intégration continue** dans le même commit :
une suite qui ne tourne pas à chaque poussée ne protège personne.

---

## 023 — Correctifs d'usage : formats texte, états vides, session expirée

**Date** : 16 octobre 2026 · **État** : accepté

Cinq points sans rapport entre eux, réunis parce qu'ils relèvent tous du
même constat : des cas que l'application traitait bien *ailleurs* et pas
*ici*.

### `.txt` et `.md`, et le piège de l'encodage

Trois lignes de code — et un piège qui n'en est pas un. Un fichier produit
sous Windows est souvent en **cp1252** : le décoder en UTF-8 lève une
exception au premier caractère accentué, donc, dans un cours français, dès
la première ligne. Le lecteur tente `utf-8-sig`, puis `utf-8`, puis
`cp1252`, et `latin-1` en dernier recours.

**L'ordre n'est pas indifférent** : cp1252 accepte presque n'importe quel
octet et ne lève donc jamais. Le tester en premier reviendrait à ne jamais
essayer UTF-8. Vérifié en retirant le repli : un test tombe.

Le Markdown n'est pas converti. Ses marques sont du texte que le modèle lit
très bien, et les retirer coûterait une dépendance pour perdre la structure
des titres.

### Trois états que l'application gérait ailleurs

**La recherche sans cours.** Un inscrit sans aucun support voyait un champ
de recherche et « Tapez un mot du cours » — une invitation à chercher dans
le vide. Examen blanc et Consommation traitaient déjà ce cas.

**Deux boutons primaires rivaux.** L'état vide de la bibliothèque portait
« Ajouter un cours » et « Ajouter mon premier cours », tous deux en rouge
plein. Le premier passe en secondaire quand la liste est vide.

**Les chargements muets.** Un appel au modèle prend deux à huit secondes
derrière un squelette silencieux. Les trois modules annoncent maintenant ce
qui se passe — « Lecture du cours, puis rédaction de la synthèse… ». Les
lectures en base restent muettes : les annoncer serait du bruit.

### La session expirée, et deux erreurs en la corrigeant

Une session expirée renvoyait vers l'écran de connexion **sans un mot**.
L'étudiant perdait sa page en pleine révision sans savoir pourquoi.

Le correctif a demandé trois essais, et les deux premiers sont instructifs :

1. **Premier essai** — afficher le bandeau depuis l'état de navigation. Il
   réapparaissait à chaque rechargement de l'écran de connexion, longtemps
   après l'événement : `history.state` **survit au rechargement**, ce que je
   ne savais pas avant de l'observer.
2. **Deuxième essai** — nettoyer l'état au montage. Le bandeau ne
   s'affichait plus **du tout** : l'effet s'exécute juste après le premier
   rendu, donc l'utilisateur n'avait rien le temps de lire. *J'ai cassé la
   fonctionnalité en corrigeant son effet de bord.*
3. **Troisième** — capturer le drapeau dans l'état du composant au premier
   rendu, puis nettoyer l'historique. La page de retour, elle, est conservée.

Trois propriétés vérifiées séparément : le message s'affiche à l'expiration,
il **ne s'affiche pas** pour quelqu'un qui ne s'est jamais connecté, et il
disparaît après un rechargement sans emporter la page de retour.

**Leçon.** Les deux premiers essais passaient le test évident — « le message
s'affiche-t-il ? » — et échouaient sur un cas voisin. Un correctif d'état
transitoire se vérifie dans les trois sens : il apparaît quand il faut, il
n'apparaît pas quand il ne faut pas, et il disparaît.

---

## 024 — Traduction français / anglais, et les accents de l'interface

**Date** : 16 octobre 2026 · **État** : accepté · *premier lot sur deux*

### Sans dépendance, et pourquoi

Deux langues, un dictionnaire plat, aucun pluriel complexe, aucun chargement
différé. `react-i18next` apporterait une configuration, un format de fichiers
et une quarantaine de kilo-octets pour un `Record` et un contexte — une
centaine de lignes écrites ici. Même logique que les appels d'API sans SDK
(DECISIONS 003) et les PDF sans dépendance système (012).

Le dictionnaire français **définit le type** ; l'anglais est contraint à
`Record<keyof typeof FR, string>`. Une clé oubliée est une erreur de
compilation, pas une étiquette vide découverte par un utilisateur.

### Ce que l'extraction a corrigé, et qui vaut autant que la traduction

**L'interface était en français sans accents** — « Aucun resume pour ce
cours », « 8 caracteres minimum », « Detaille », « Pas encore analyse ». Les
prompts avaient été accentués en v3 (DECISIONS 015) ; l'interface, jamais.

Extraire chaque chaîne oblige à la relire une par une. C'est là que le défaut
se répare, et c'est l'argument qui rendait ce chantier rentable au-delà de la
traduction elle-même.

**Les sept `'fr-FR'` écrits en dur** — nombres et dates — suivent désormais la
langue : un étudiant en anglais lit « 1,566 characters · Added 13 Oct 2026 »
là où il lisait « 1 566 » avec une espace fine.

### Un test anti-régression qui ne protégeait rien

Un test vérifie qu'aucune chaîne française ne porte un mot connu sans accent.
Vérifié en réintroduisant « Pas encore analyse, aucun resume genere » : **les
dix-neuf tests passaient.**

Deux causes cumulées, et la seconde est la plus instructive :

1. `String.match()` **sans le drapeau `g`** ne rend que la première
   occurrence. Ici c'était « analyse », légitimement sans accent, et mon
   filtre d'exception avalait alors toute la chaîne.
2. Réécrit avec un gabarit JavaScript, `\b` y désigne un **caractère
   d'échappement arrière**, pas une limite de mot. Le test restait inerte.

Corrigé, il attrape « resume » et « genere » tout en ignorant « analyse ».

*C'est la cinquième fois dans ce projet qu'un test vert ne protège rien.* Les
cinq fois, c'est une **mutation volontaire** qui l'a révélé, jamais une
relecture.

### Ce qui n'est pas traduit, et pourquoi

- **Les sorties du modèle restent en français.** Paramétrer le fragment
  `LANGUE` créerait une version de prompt, et les mesures publiées du banc
  d'essai ne couvrent que le français. Le tuteur fait exception sans qu'on
  touche à rien : son prompt dit déjà « réponds dans la langue de la
  question ».
- **Les messages d'erreur du serveur.** Le client les recompose à partir des
  `details` structurés (DECISIONS 022), donc dans la langue active. Ceux qui
  n'ont pas de détails s'affichent en français.

### Deux trouvailles des lots suivants

**Une collision de noms**, attrapée par le compilateur : dans
`ProgressionPanel`, la variable de boucle des tentatives s'appelait `t`,
comme la fonction de traduction. Deux `t` différents dans la même portée — et
le code compilait encore par hasard, puisque `t.score` reste valide sur une
tentative. Renommée.

**De la prose d'interface dans une réponse d'API.** La page de consommation
passait entièrement en anglais, sauf un paragraphe. Il venait du serveur :
`_gratuit()` renvoyait un champ `explication` que le client affichait tel
quel. Une phrase destinée à l'écran n'a rien à faire dans une réponse d'API —
elle a rejoint le dictionnaire, et le champ a disparu du schéma.

### Le garde-fou ne passe pas par le contexte

Le composant qui rattrape les effondrements de rendu traduit en lisant la
langue **directement dans le stockage**, sans le hook. C'est délibéré : si
c'était le fournisseur de traduction qui avait échoué, appeler son hook ici
relèverait la même exception et laisserait l'utilisateur devant une page
blanche. Il retombe sur le français au moindre doute.

### Couverture

Les onze écrans sont traduits : en-tête, authentification, bibliothèque,
fiche de cours et ses quatre panneaux, recherche, examen blanc, consommation,
page introuvable et garde-fou. Environ **200 chaînes**, toutes accentuées côté
français.

---

## 025 — Flashcards à répétition espacée, à zéro appel

Le quiz vérifie qu'on a compris **le jour même**. Il ne fait rien pour qu'on
s'en souvienne trois semaines plus tard. C'était le dernier manque réel face
aux produits du marché, et il se comble **sans un seul appel au modèle**.

### Une carte se dérive, elle ne se génère pas

Une question de quiz contient déjà les quatre champs d'une carte : l'énoncé
devient le recto, la bonne option le verso, l'explication et la citation du
cours l'accompagnent. Tout est en base depuis la génération du quiz.
Fabriquer cinquante cartes coûte donc **zéro appel, zéro jeton, zéro seconde
d'attente** — comme l'examen blanc, et pour la même raison.

Le compte d'appels est **renvoyé par l'API et affiché à l'écran**. Une
gratuité qu'on demande de croire sur parole n'est pas une gratuité
démontrable, et deux tests comptent les appels de la doublure plutôt que de
les supposer nuls.

Un cours **sans quiz refuse**, au lieu d'en générer un en silence : un appel
déclenché depuis un écran qui promet la gratuité serait exactement le coût
invisible que le tableau de consommation (020) existe pour montrer.

### SM-2, et deux écarts imposés par des tests

L'algorithme est celui de SuperMemo 2 (1987), celui des débuts d'Anki : vingt
lignes, aucune donnée d'entraînement, un comportement qui se raconte en une
phrase — ce qui compte autant que sa justesse quand il faut le défendre en
soutenance. Ses successeurs (FSRS) ajustent leurs paramètres sur des millions
de révisions ; nous n'en avons aucune.

Deux écarts par rapport à l'original, **tous deux trouvés par un test, pas
anticipés** :

- **Plafond d'intervalle à 180 jours.** SM-2 n'a aucune borne supérieure :
  une suite de « facile » envoie la carte à **390 jours**, puis au-delà.
  Correct pour une base de connaissances à vie, absurde pour réviser un cours
  de semestre — la carte reviendrait après l'examen.
- **Plancher de facilité à 1,3.** Sans lui, une carte systématiquement ratée
  voit son facteur tendre vers zéro, son intervalle avec, et revient
  indéfiniment le même jour : la session ne se termine jamais.

Quatre boutons et non six. SM-2 prend une note de 0 à 5 ; six nuances sur
« me suis-je souvenu ? » demandent à l'étudiant une précision qu'il n'a pas,
et Anki comme la littérature ont convergé vers quatre.

### Le filtre de redites, et la faute qu'il a failli reproduire

Sur un cours réel, trois quiz successifs ont produit **13 cartes dont 4 vraies
redites** : trois formulations du prix d'une chambre, deux du message d'erreur
de connexion, deux de Gherkin. L'étudiant révisait trois fois le même fait
dans la même session.

La première version du filtre ne regardait que la **similarité des énoncés**,
au seuil de 0,55 mesuré pour l'examen blanc (018). **Dix tests sont tombés
d'un coup.** Les questions d'un même gabarit — « Question numéro 1 »,
« Question numéro 5 » — partagent six mots sur sept, soit 0,86 de similarité,
et le filtre les écartait toutes. C'est précisément la faute refusée en 018 :
un élément valable supprimé sans que personne le sache.

**La réponse tranche.** Deux cartes ne font doublon que si elles apprennent la
même chose : on exige donc, en plus de la similarité des énoncés, que les
**versos se recouvrent** — égaux, ou l'un contenu dans l'autre (« 100 € » et
« 100 €/nuit »). Les questions d'un même gabarit ont des réponses différentes
et survivent.

Mesure après correction, sur le même cours réel : **13 questions → 9 cartes,
4 écartées, toutes de vraies redites, aucune perte légitime.** Le filtre reste
conservateur : une troisième formulation de Gherkin, qui ne partage que 26 %
de ses mots avec les autres, passe au travers. C'est le bon compromis — rater
un doublon ne coûte qu'une carte de trop, écarter une carte valable coûte une
connaissance.

Et **ne pas créer n'est pas supprimer** : les deux cartes porteraient la même
réponse. Le nombre de cartes écartées est rendu par l'API, pas tu.

### Le seuil vit désormais dans un seul fichier

`services/enonces.py` porte la normalisation d'énoncé, le sac de mots, la
similarité de Jaccard et le seuil de 0,55 — mesuré deux fois, sur deux jeux de
données réels, à trois jours d'intervalle. Deux modules l'emploient, et **pas
de la même façon** : l'examen blanc **dépriorise** (rien n'est perdu), les
cartes **ne créent pas** la seconde carte. Le fichier dit lequel fait quoi.

Avant cela, la fonction vivait dans `examen.py`. Deux copies auraient fini par
faire dire deux choses différentes à « la même question ».

### Trois détails de schéma

- **Cascade sur le cours**, contrairement à `exams` qui pend de l'étudiant.
  Un examen blanc porte sur plusieurs supports et survit à la suppression de
  l'un d'eux ; une carte appartient à un seul cours. La cascade est posée
  **deux fois**, sur la clé étrangère et sur la relation ORM : PostgreSQL
  l'applique en production, l'ORM la rend observable en test, où SQLite
  n'impose pas les clés étrangères. Une cascade qu'aucun test ne peut
  exercer n'est vérifiée par personne.
- **Contrainte d'unicité (cours, clé).** Regénérer un quiz ne doit pas
  dupliquer une carte révisée depuis trois semaines, avec deux avancements
  concurrents.
- **Quatre champs, pas un recto et un verso composés.** Fabriquer « Bonne
  réponse : X. Pourquoi : Y » côté serveur remettrait de la prose d'interface
  dans une réponse d'API — le défaut corrigé en 024 sur la page de
  consommation.

### Le verso descend avec la carte — l'inverse du quiz

Le routeur du quiz retire la bonne réponse avant l'envoi : un quiz est noté,
la cacher sert à quelque chose. Une carte est **auto-évaluée** et doit se
retourner sans aller-retour réseau. Un test fige la décision pour qu'elle ne
passe pas pour un oubli à la relecture.

De même, la révision renvoie **la carte et le compte du jeu**. Sans ce second
champ, les compteurs du haut de l'écran restaient figés : l'étudiant notait
dix cartes en lisant toujours « 13 à revoir ». Les recalculer dans le
navigateur aurait demandé d'y recopier le seuil « acquise », qui aurait alors
vécu des deux côtés de la frontière.

### Ce que la doublure de test cachait

Le faux modèle réutilisait la chaîne **« Option A » comme réponse de toutes
les questions** dont l'index tombait sur 0. Deux questions distinctes se
retrouvaient donc avec un énoncé proche **et** une réponse identique : le
profil exact d'un doublon. Aucun quiz réel ne fait cela — une réponse est un
fait, pas une étiquette de rang. Les options portent désormais le numéro de
leur question, et la doublure est d'autant plus fidèle.

### Vérification

**Onze mutations** ont été introduites délibérément dans ce code — retirer le
dédoublonnage, le contrôle de propriétaire, le plafond de session, la cascade,
l'exigence de même réponse — et **les onze ont été attrapées** par la suite.

25 tests pour ce module seul, 19 pour SM-2. Le parcours complet a été exercé
dans le navigateur sur les données réelles du cours « Atelier 5 », en
français, au clavier comme à la souris, en 1100 px et en 375 px.

---

## 026 — Reprise de la refonte visuelle : aplats, deux polices, composition

Reprise demandée après le verdict porté sur la première passe : **« correct,
pas marqué »**. Le diagnostic était consigné dans
`docs/PROMPT-REFONTE-VISUELLE.md` §7 ; ce lot en traite les quatre points.

Deux consignes du commanditaire encadrent tout ce qui suit : **retirer les
dégradés de fond**, et **adopter une seconde police pour les titres**.

### La police de texte n'avait jamais été chargée

La feuille de style demandait « Inter » depuis le premier jour **sans que
rien ne la serve**. Mesure au banc dans le navigateur : une chaîne rendue en
`Inter, serif` faisait exactement la même largeur qu'en `serif` seul — la
famille n'existait nulle part et tout retombait sur Segoe UI. Toute l'échelle
typographique avait donc été réglée sur une police choisie par accident, et
différente d'une machine à l'autre.

`document.fonts.check('16px Inter')` répondait `true`. Il répond aussi `true`
pour `'16px "PoliceQuiNExistePas"'` : **cette fonction ne prouve rien**. Seule
la comparaison de largeurs rendues le fait.

Inter est désormais servie, et **Bricolage Grotesque** porte les titres. Elle
s'arrête aux titres et aux grands nombres : c'est le contraste entre deux
familles qui fait le caractère, pas l'omniprésence de la plus voyante.

### Les aplats débloquent le contraste

C'était le troisième point du diagnostic, et il tenait à un raisonnement
incomplet. Sur fond clair, interdire au texte secondaire de descendre sous
4,5:1 plafonne la saturation — un lavis plus soutenu avait été mesuré à
4,21:1 et annulé. **Sur un aplat sombre à texte clair, le seuil cesse d'être
une limite.**

Mesures de la nouvelle tête d'écran :

| | sur `--brand-700` | sur `--neutre-900` |
|---|---|---|
| surtitre | 7,11:1 | 11,05:1 |
| titre | 10,22:1 | 17,74:1 |
| sous-titre | 7,79:1 | 13,26:1 |
| bouton inversé | 10,22:1 | 10,22:1 |

La couleur franche devient possible parce que **le sens de lecture est
inversé**, pas parce qu'on a baissé l'exigence.

Tout ce qui était dégradé est passé en aplat : lavis radiaux des pages, trame
de points du panneau d'authentification, dégradés des boutons, de la
carte-chiffre et de l'initiale de cours. Seule subsiste l'animation de
chargement, où le dégradé **est** le mouvement.

### La composition, enfin

C'était le premier point, désigné comme cause principale : « les six écrans
restent une colonne de cartes empilées sur fond clair ». Trois mises en page
distinctes :

- **La tête d'écran** est un bloc pleine largeur qui annule les marges de la
  page au lieu de s'y poser comme une carte de plus. Deux tons, et ils
  distinguent les écrans : la marque pour ce qui touche aux cours, l'ardoise
  pour ce qui mesure. La consommation n'est pas une fonction de révision, et
  sa tête le dit avant qu'on ait lu un mot.
- **Le montant de la consommation monte dans la tête**, seul et en grand. Il
  était la cinquième case d'une grille de cinq : le chiffre que l'étudiant
  vient chercher avait exactement le poids des quatre autres.
- **Le champ de recherche vit dans la tête.** Sur un écran dont la raison
  d'être *est* la recherche, reléguer le champ dans une carte sous le titre
  en fait un outil parmi d'autres.
- **La liste des cours devient une grille**, et le cours le plus récent
  occupe les deux colonnes. L'ordre de l'API est décroissant par date : c'est
  bien celui sur lequel l'étudiant travaille, et la taille le dit sans un mot.

### Ce qu'une vedette doit faire pour ne pas passer pour un trou

Première version : la carte occupait simplement les deux colonnes. Avec deux
cours en base, cela donnait une bande pleine largeur suivie d'une demi-carte
et d'un vide — **l'asymétrie passait pour un défaut de grille**.

Elle porte donc un traitement à elle : aplat teinté, initiale pleine marque
(10,22:1), titre d'un cran au-dessus. Le vide à côté de la seconde carte
devient alors la conséquence visible d'une hiérarchie. Mesures sur le fond
teinté : titre 16,60:1, métadonnées 5,66:1.

### Les états vides ne sont plus du texte dans un rectangle

Une illustration dessinée à la main, en aplats, aux couleurs du projet :
trois feuilles empilées et un point de marque. Une bibliothèque
d'illustrations coûterait des centaines de kilo-octets et parlerait la langue
de quelqu'un d'autre. `aria-hidden` : elle n'ajoute rien que le titre et le
paragraphe ne portent déjà.

### Un défaut révélé par la nouvelle grille

Les séparateurs en pastille de la ligne de métadonnées supposaient que cette
ligne tienne sur une ligne. Dans une carte devenue plus étroite, elle passe à
la ligne et **le point se retrouve en tête** : la métadonnée se lit alors
comme une puce de liste. Le point disparaît sous 520 px ; l'espacement suffit.

### Vérification

Chaque écran a été exercé dans le navigateur en 1100 px et en 375 px :
**aucun débordement horizontal**, et la recherche a été lancée de bout en
bout depuis son nouveau champ. Tous les rapports de contraste listés ci-dessus
ont été mesurés dans la page, pas estimés.

### Ce qui reste ouvert

La fiche de cours et l'examen blanc gardent la composition en pile. Elles ont
reçu la tête et la typographie, pas une mise en page propre. C'est le
prochain lot.

---

## 027 — Fin de la refonte : le dernier dégradé, et deux écrans recomposés

Troisième et dernier lot. Il traite les deux écrans laissés en pile par le lot
précédent, et une consigne du commanditaire restée à moitié appliquée.

### Le dernier dégradé du projet

« Je n'apprécie pas les dégradés sur le fond blanc. » Il en restait **un** :
le squelette de chargement, qui balayait une bande claire sur fond clair.
C'était le seul endroit où le dégradé portait une information — le mouvement
dit « ça arrive » — mais il restait un dégradé sur blanc.

Le battement d'opacité dit la même chose en aplat. Il est aussi moins coûteux
à animer : `opacity` est composée par le processeur graphique, là où
`background-position` repeint. **Il ne reste plus un seul dégradé dans la
feuille de style.**

### La fiche de cours : les onglets sur le bord du bloc

Même composant, autre contexte. La barre d'onglets passe du fond clair à
l'aplat, et **le rapport s'inverse** : l'onglet actif devient la surface
*claire* posée sur le bloc, c'est-à-dire le haut du panneau qu'il commande.
La continuité entre l'onglet et son contenu se lit alors sans filet.

Les pastilles de coût gardent leurs fonds clairs et leurs textes sombres.
C'est volontaire : une pastille « 1 appel » qui change d'aspect selon l'écran
ne veut plus rien dire.

### L'examen blanc : deux colonnes pour deux décisions

**Sur quoi** porter l'examen à gauche, **sous quelle forme** à droite.
Empilées, la seconde se découvrait après avoir fait défiler la première : sur
une bibliothèque de dix cours, le bouton « Composer » sortait de l'écran. Le
panneau de droite reste collé en vue, calé sous l'en-tête par la variable que
l'observateur publie — pas par un nombre écrit en dur, la hauteur de l'en-tête
changeant avec la largeur.

Et **le score monte dans la tête** une fois la copie rendue, pour la même
raison que le montant de la consommation : c'est le chiffre qu'on vient
chercher, et il était un `h2` dans une carte blanche parmi d'autres cartes
blanches. La phrase d'introduction disparaît alors — elle explique comment
composer un examen, ce qui n'a plus d'objet quand on lit son corrigé.

### Deux défauts trouvés en vérifiant, pas en relisant

**L'onglet actif était hors cadre sur téléphone.** Cinq onglets ne tiennent
pas dans 375 px ; la barre défile. En arrivant sur `?onglet=cartes`, l'écran
affichait « Résumé · Quiz · Tuteur » et le panneau des cartes en dessous :
l'utilisateur voyait un contenu sans voir ce qui l'avait sélectionné, et un
lien partagé vers un onglet précis arrivait sur une barre qui le contredisait.

Le correctif — amener l'onglet actif en vue — **n'a pas marché du premier
coup**, et la mesure l'a dit. L'effet ne dépendait que de l'onglet actif : il
se déclenchait pendant que la fiche chargeait encore, donc avant que la barre
ne soit montée, et la référence valait `null`. Quand le cours arrivait,
l'onglet actif n'avait pas changé et l'effet ne repartait pas. Il dépend
désormais aussi du cours. `block: 'nearest'` est indispensable : sans lui, le
navigateur fait aussi défiler la page pour centrer verticalement, ce qui
escamote la tête au chargement.

**Une clé de traduction manquante**, attrapée par le compilateur avant
l'exécution : le panneau de réglages avait besoin d'un titre, et le
dictionnaire typé a refusé de compiler tant que l'anglais ne l'avait pas.
C'est exactement ce pour quoi le type avait été posé en 024.

### Sur la recommandation de l'outil de design

Le skill `ui-ux-pro-max` a été interrogé pour ce lot. Sa recommandation —
Fira Code / Fira Sans, CTA rose, noir éditorial — **n'a pas été suivie** : la
typographie et le rouge de l'établissement étaient déjà arrêtés par le
commanditaire, et une palette générique les aurait contredits. Sa grille de
vérification, elle, a servi : contraste en mode clair, cible tactile,
`prefers-reduced-motion`, points d'arrêt, pas d'emoji en guise d'icône.

### Vérification

Parcours complet exercé dans le navigateur : composition d'un examen,
épreuve, remise, corrigé. Le compte à rebours reste collé exactement sous
l'en-tête (bas de l'en-tête 114 px, haut de la barre 114 px) — la régression
de la première refonte n'est pas revenue. Aucun débordement horizontal en
1100 px ni en 375 px, sur les six écrans.

211 tests serveur, 19 front.

---

## 028 — Les quatre panneaux de la fiche de cours

Le point laissé ouvert par 027 : les panneaux avaient reçu la tête et la
typographie, mais leur composition interne n'avait pas bougé. Quatre piles de
cartes blanches à la même largeur.

### Résumé : une colonne de lecture, un rail

Synthèse, points clés, notions et télémétrie se suivaient à la même largeur
et avec le même poids. Ce ne sont pourtant pas des choses du même ordre : la
synthèse **se lit** — c'est la seule prose longue du produit, et la ligne
fatigue au-delà d'environ 70 signes — tandis que les notions et la provenance
**se consultent** du coin de l'œil.

Deux colonnes, donc : lecture bornée à 68 signes à gauche, rail à droite. Les
points clés sont numérotés et le numéro porte la couleur de marque ; une liste
à puces grises ne se distinguait pas du paragraphe au-dessus.

### Tuteur : une conversation, pas une pile de blocs

Les bulles étaient dessinées par des styles écrits en ligne, **couleurs
comprises** — en contradiction avec ce que la feuille de style annonce en
commentaire : aucune couleur dans le TSX. Elles ont leurs classes, une largeur
de lecture bornée, et un coin coupé du côté de l'interlocuteur. C'est ce
détail qui fait lire deux colonnes comme un échange plutôt que comme deux
listes d'encadrés. Mesures : 10,22:1 pour la bulle de l'étudiant, 16,72:1
pour celle du tuteur.

### Quiz : le même corrigé que l'examen blanc

Les classes `.option-corrigee`, `.option-bonne` et `.option-fausse`
**existaient déjà** dans la feuille de style et servaient au corrigé de
l'examen blanc. Le panneau de quiz en tenait une seconde implémentation en
styles écrits en ligne.

Conséquence visible : la même « bonne réponse » n'avait pas le même aspect
selon qu'on relisait un quiz ou un examen, et surtout **le marqueur ✓ / ✕
manquait côté quiz**. Ce marqueur n'est pas décoratif : il rend le corrigé
lisible sans la couleur, pour un daltonien comme pour une projection en
soutenance. Vérifié sur un quiz réellement généré.

### Progression : le cadran à part, les chiffres en grille

Sur une seule rangée flexible, le cadran et les trois nombres se partageaient
la largeur à égalité : la moyenne — la seule mesure synthétique — avait le
poids d'un compteur de tentatives. Et sur téléphone la rangée se repliait au
hasard.

Son composant `Chiffre` local était par ailleurs une **troisième**
implémentation du même objet, avec sa taille et sa graisse écrites en ligne.
Seule la classe partagée porte `font-variant-numeric: tabular-nums`, sans
lequel les chiffres changent de largeur d'un rafraîchissement à l'autre.

### Cinq chaînes avaient échappé à la traduction

« Extrait du cours », « Valider mes reponses », « question(s) sans reponse »,
« extrait(s) du cours », « Ce qui a ete envoye au modele ». **Trois sont du
français sans accents** — exactement le défaut que la passe de traduction
(024) existait pour corriger. Elles vivaient dans les panneaux, que cette
passe avait manifestement parcourus moins attentivement que les pages.

Elles passent par le dictionnaire. Le compilateur a d'ailleurs refusé une
sixième clé manquante (`examen.format`) avant toute exécution : c'est
précisément ce pour quoi le dictionnaire avait été typé.

### Une fausse alerte, vérifiée au lieu d'être supposée

La console affichait une pile d'erreurs `useI18n doit etre utilise dans un
I18nProvider`. Les horodatages des modules trahissaient la cause : deux
instances du module i18n chargées par le rechargement à chaud de Vite
(`?t=…339` contre `?t=…348`), donc deux contextes distincts. Un onglet neuf
sur la même page ne produit **aucune erreur**. Le diagnostic a été établi en
ouvrant cet onglet, pas en le supposant.

### Vérification

Les quatre panneaux exercés à 1100 px et à 375 px : aucun débordement
horizontal, la grille du résumé passe bien à une colonne. Un quiz a été
généré pour de bon — un appel réel au modèle — parce que c'était le seul
moyen de contrôler le rendu des options choisies puis corrigées.

Il ne reste plus **aucune couleur écrite en ligne** dans un composant, sauf
le ton de l'anneau de score, qui est un paramètre.


---

## 029 — Plafond global, connexions et inscriptions limitées

*20 octobre 2026 — version locale, non encore en ligne.*

### Le constat

Le plafond de débit existant (`debit.py`, 10 appels par minute et par
étudiant) protégeait d'un double-clic. Il ne protégeait pas de **plusieurs
comptes** : une fois le site en ligne, quelques comptes créés à la suite
suffisaient à épuiser le quota gratuit du fournisseur pour la journée — et
la démonstration avec. La connexion, elle, acceptait un nombre illimité
d'essais de mot de passe.

### Ce qui est fait

| Garde-fou | Seuil | Réglage |
|---|---|---|
| Appels au modèle, tous comptes confondus | 400 par jour (UTC) | `MAX_APPELS_MODELE_PAR_JOUR` |
| Échecs de connexion par adresse | 5 en 15 minutes | `MAX_ECHECS_CONNEXION`, `FENETRE_ECHECS_CONNEXION_S` |
| Inscriptions par adresse IP | 5 par heure | `MAX_INSCRIPTIONS_PAR_HEURE` |

Trois choix qui ne vont pas de soi :

- **Le plafond global n'est consommé qu'après le plafond individuel.** Un
  étudiant bloqué par minute n'entame pas la réserve des autres.
- **Pendant un blocage de connexion, même le bon mot de passe est refusé.**
  Sinon la différence entre « refusé » et « accepté » laisserait la devinette
  continuer.
- **Une adresse sans compte est bloquée comme les autres.** Sinon le blocage
  révélerait quelles adresses ont un compte, ce que le message d'échec unique
  évitait déjà.

### Alternatives écartées

- **Compter en base** les opérations du jour : persistant, mais le tuteur de
  bibliothèque n'enregistre pas ses réponses, il aurait échappé au compte. Et
  une requête de comptage à chaque appel pour un gain marginal.
- **Redis** : une dépendance et un service de plus pour un serveur unique.

### Limites

Les compteurs vivent en mémoire et repartent à zéro au redémarrage. Accepté :
un abus soutenu garde le serveur éveillé, donc les compteurs en vie.
L'adresse IP est lue dans `X-Forwarded-For`, falsifiable par un client
direct : le garde-fou vise l'accident et l'abus naïf, pas l'attaquant
déterminé.

### Vérification

11 tests ajoutés (`tests/test_debit.py`), **223 tests serveur**. Chaque
garde-fou a été désactivé tour à tour : au moins un test tombe à chaque fois.
Le front affiche, pour le plafond du jour, un message qui dit ce qui reste
ouvert plutôt qu'une attente en secondes (`messages.test.ts`).


---

## 030 — Mon compte : mot de passe, suppression, export, sessions

*20 octobre 2026 — version locale. Migration 0006 appliquée à la base
partagée, sans effet sur la version en ligne.*

### Le constat

L'étudiant pouvait s'inscrire et se connecter, rien d'autre : ni changer de
mot de passe, ni supprimer son compte, ni récupérer ses données. Pour une
application qui met en avant la protection des données, l'absence de
suppression était la question qu'un jury pouvait poser. Et un jeton volé
restait valable sept jours, même après un changement de mot de passe.

### Ce qui est fait

| Fonction | Route | Garde |
|---|---|---|
| Profil, connexion précédente | `GET /api/auth/me` | — |
| Changer de mot de passe | `POST /api/auth/password` | mot de passe actuel ; déconnecte les autres appareils |
| Supprimer le compte | `DELETE /api/auth/me` | mot de passe, et le mot SUPPRIMER côté interface |
| Télécharger ses données | `GET /api/auth/me/export` | — |

### Trois choix

- **C'est la connexion PRÉCÉDENTE qui est affichée**, pas celle en cours :
  « dernière connexion » sert à repérer une connexion qu'on n'a pas faite,
  ce que l'heure de la session en cours ne dirait jamais. D'où deux colonnes.
- **Une version de session dans le jeton**, plutôt qu'une liste noire de
  jetons : un entier par compte, une lecture par requête, et aucun stockage
  qui grossit.
- **Les échecs de mot de passe sur ces routes partagent le compteur de la
  connexion.** Sinon une session volée offrait une seconde porte, non
  freinée, pour deviner le mot de passe.

### Ce que l'export ne contient pas

L'empreinte du mot de passe (inutile à l'étudiant, utile à un attaquant), la
charge envoyée au modèle (c'est le cours déjà exporté, pseudonymisé) et la
télémétrie (elle décrit le fournisseur, pas l'étudiant).

### Coût

Une lecture du compte par requête authentifiée, par clé primaire. Négligeable
devant l'appel au modèle, et c'est le prix d'une déconnexion réelle.

### Vérification

14 tests (`tests/test_compte.py`), **237 tests serveur**. Sept protections
désactivées tour à tour : au moins un test tombe à chaque fois. Après la
migration, la version en ligne a été interrogée : la connexion lit toujours
la table `users` normalement.

---

## 031 — Pages juridiques, aide, contact, pied de page

*20 octobre 2026 — version locale.*

### Ce qui est fait

Six pages publiques, connecté ou non : mentions légales, politique de
confidentialité, conditions d'utilisation, à propos, centre d'aide, FAQ ;
plus une page Contact et un pied de page sur toutes les pages. À
l'inscription, une case non cochée par défaut fait accepter les conditions
et la politique de confidentialité ; le bouton reste désactivé sans elle.

### Trois choix

- **Pas de bandeau de cookies.** StudyAI ne dépose aucun cookie et n'utilise
  aucun traceur : seuls le jeton de connexion et la langue sont gardés dans le
  stockage local. Un bandeau n'aurait rien à demander ; la politique de
  confidentialité le dit.
- **La politique nomme ses limites.** Les noms de personnes ne sont pas
  masqués, et l'offre gratuite de Gemini peut utiliser les contenus transmis :
  les deux sont écrits en clair. Un test vérifie que la limite sur les noms
  figure dans les deux langues.
- **Contact par lien de messagerie**, sans formulaire : rien à stocker, pas
  de spam à filtrer, pas de migration.

### Textes hors du dictionnaire

Les textes longs vivent dans `client/src/lib/contenus.ts`, en français et en
anglais, avec un balisage minimal (gras, italique, code, lien interne). Un
test vérifie que les deux langues ont les mêmes sections dans le même ordre,
et que chaque lien interne mène à une route déclarée dans `App.tsx` — test
vérifié en cassant volontairement un lien.

### À faire par l'équipe

- ~~**Adresse de contact provisoire**~~ — **fait le 20 octobre** : la boîte
  dédiée `studyai.5sae9@gmail.com` remplace `contact@studyai.invalid` dans
  `client/src/lib/site.ts`.
- **Relecture des textes juridiques.** Ils ont été rédigés à partir du
  fonctionnement réel de l'application, mais ne constituent pas un avis
  juridique.
- **Région Render** supposée « États-Unis » (région par défaut, aucune n'est
  fixée dans `render.yaml`) : à confirmer dans le tableau de bord.

## 032 — Conversations du tuteur

**Contexte.** Le tuteur tenait un seul fil par cours, sans fin. Les six
derniers messages, quels qu'ils soient, partaient comme contexte : une
question ancienne pouvait orienter la réponse à une nouvelle, sans rapport.
L'étudiant ne pouvait ni repartir de zéro, ni retrouver un échange. Manque
signalé par l'équipe le 20 octobre.

**Décision.** Une table `chat_conversations` ; chaque message porte sa
conversation. Le contexte envoyé au modèle est limité à la conversation en
cours. La première question donne son titre à la conversation. L'interface
liste les conversations (la plus récente en tête), en ouvre une nouvelle,
en supprime une ; rien n'est enregistré tant qu'aucune question n'est posée.

**Migration 0007, additive.** Colonne nullable, nouvelle table : la version
en ligne antérieure continue de fonctionner. Les messages existants ont été
regroupés, cours par cours, dans une conversation sans titre (« Conversation
précédente ») : 26 messages, 7 conversations, aucun perdu. Un message écrit
par l'ancien code entre la migration et le déploiement est rattaché à la
première lecture.

**Écarté.** Créer la conversation dès le clic sur « Nouvelle conversation » :
chaque clic laissait une conversation vide dans la liste.

**Vérifié.** 11 tests serveur (cycle de vie, contexte cloisonné,
cloisonnement entre étudiants et entre cours, messages antérieurs), dont
trois protections cassées exprès et attrapées ; un parcours de bout en bout.

## 033 — Refonte « Atelier » : navigation latérale et base sobre (lot 1)

**Contexte.** Après la soutenance, l'équipe a demandé de reprendre l'interface
dans son ensemble. Quatre refontes successives avaient empilé près de 4 000
lignes de style. La navigation tenait dans une barre du haut à quatre liens, et
chaque écran s'ouvrait sur un aplat de couleur pleine largeur : deux zones de
couleur qui se disputaient l'attention.

**Décision.** Parmi trois directions présentées (Atelier, Campus, Éditorial),
l'équipe a choisi **Atelier** : un outil de travail sobre, où la couleur sert à
se repérer. Le rouge et le logo sont conservés. La refonte se fait par lots,
chacun montré avant le suivant. Lot 1 :
- une **barre latérale** pour l'étudiant connecté : navigation, cinq cours
  récents à la couleur de leur cours, menu du compte en bas ; repliée en barre
  du haut avec un bouton menu sous 900 px ;
- **une seule police**, Plus Jakarta Sans, à la place d'Inter et de Bricolage
  Grotesque ;
- des **neutres chauds** au lieu de neutres bleutés ;
- des **têtes d'écran claires**, fermées par un filet, au lieu des aplats ;
  la teinte du cours devient un repère devant le surtitre ;
- un seul dessin d'onglet : souligné de rouge, texte foncé et gras.

Les styles du lot sont dans `client/src/atelier.css`, chargé après
`index.css` dont il redéfinit les jetons. Les visiteurs gardent l'en-tête du
site.

**Maintenu.** Fond blanc, aucun dégradé, aucun halo, pas de mode sombre, aucune
dépendance nouvelle : les icônes sont dessinées en SVG dans le composant.

**Corrigé en route.** Dans la nouvelle disposition, une page centrée par
`margin: auto` prenait la largeur de son contenu : 757 px de large sur un
téléphone de 390 px, 724 px sur grand écran. Chaque enfant de la zone de
contenu prend désormais toute la largeur.

**Vérifié.** 93 tests unitaires, construction, 48 parcours de bout en bout,
dont l'audit d'accessibilité axe, sur ordinateur et sur téléphone.

## 034 — Texte source dans un panneau latéral, citations cliquables

**Contexte.** Le texte enregistré d'un cours était un bloc dépliable collé sous
chaque onglet, en police de code. L'équipe l'a jugé peu professionnel. Il
passait pour un reste de débogage, alors que c'est la preuve sur laquelle tout
repose : l'IA ne répond qu'à partir de ce texte.

**Décision.**
- Un bouton **« Texte source »** dans la tête de la fiche ouvre un **panneau
  latéral** : le texte en police de lecture, paragraphes conservés, une
  recherche avec compteur, un bouton « Copier ». Échap, la croix ou un clic sur
  le voile le referment ; le focus revient au bouton d'origine.
- Chaque **citation** du quiz, du tuteur, des cartes et de la progression porte
  un lien **« Voir dans le cours »** qui ouvre le panneau au passage cité,
  surligné à la couleur du cours, avec un trait à gauche.

**Retrouver une citation** (`lib/passage.ts`). Le modèle ne recopie pas à
l'octet près : il recolle les lignes coupées par l'import PDF, change une
casse ou une apostrophe. La comparaison se fait donc sur des versions
normalisées, en gardant la position de chaque caractère dans le texte
d'origine. Si la citation entière est introuvable, on cherche son début. Sans
correspondance, rien n'est surligné et le panneau le dit.

**Écarté.** Un sixième onglet « Source » : il obligeait à quitter le quiz ou
la conversation pour vérifier une citation.

**Corrigé en route.** Les raccourcis des cartes (Espace, 1 à 4) notaient la
carte cachée derrière le panneau ouvert ; ils sont ignorés dans une fenêtre
modale.

**Vérifié.** 7 tests unitaires pour la recherche de passage ; un parcours de
bout en bout (ouverture depuis la tête, recherche, Échap, retour du focus,
citation du corrigé surlignée), sur ordinateur et sur téléphone.

## 035 — Refonte « Atelier », lot 2 : l'intérieur des écrans

**Règle du lot.** Des surfaces blanches bordées ; la couleur réduite à un
repère (icône, pastille, trait). Les aplats pastel pleins faisaient de chaque
tuile un bloc de couleur qui concurrençait le contenu.

- **Mes cours** : grille régulière. La « vedette » (première carte double, bloc
  de couleur, initiale de 4 rem) disparaît : la barre latérale met déjà le cours
  récent en tête. L'initiale devient une pastille pâle à la teinte du cours.
- **« Aujourd'hui »**, **progression**, **cartes** : tuiles blanches, seule
  l'icône garde sa couleur.
- **Onglets** : les pastilles de coût restent (combien d'appels coûte un
  onglet), en texte coloré sur fond neutre.
- **Résumé** : le modèle, la version du prompt et la latence quittent le rail,
  où ils étaient au rang des notions, pour une ligne de pied de carte, avec
  « Ce qui a été envoyé au modèle ». Toujours visibles et vérifiables.
- **Tuteur** : la règle d'ancrage devient une note avec une icône, plus un
  bandeau bleu à chaque ouverture.
- **Citations** : fond neutre et trait à la couleur du cours ; le rose de la
  marque les faisait lire comme des alertes.
- **Pied de page dans l'application** : une ligne (aide, contact, mentions
  juridiques). La navigation est dans la barre latérale ; les visiteurs
  gardent le pied de page complet.

**Vérifié.** 100 tests unitaires (dont le contrôle des accents, qui a refusé
un nom de variable « modele » dans une phrase), construction, 50 parcours de
bout en bout avec l'audit d'accessibilité.

## 036 — Page d'accueil refaite sur le gabarit d'une page de présentation

**Contexte.** L'équipe a fourni un gabarit annoté de page de présentation :
barre de navigation, ouverture avec badge, bande de partenaires,
fonctionnalités en grille 2 + 2, « pourquoi nous », avis d'utilisateurs, FAQ
en accordéon, appel final, pied de page.

**Décision.** La page suit cet ordre, dans le style « Atelier » :
- en-tête du visiteur avec liens d'ancrage (Fonctionnalités, Comment ça
  marche, FAQ) ;
- ouverture : badge, titre, deux boutons, garanties, une vraie capture de
  quiz au lieu d'une photo ;
- fonctionnalités en grille 2 + 1 / 1 + 2 avec les vraies captures, plus les
  outils de révision sans appel ;
- comment ça marche, ce qui le distingue (quatre cartes), preuves mesurées ;
- **« Pour qui ? »** à la place des avis ;
- FAQ en accordéon (les cinq premières questions de la page FAQ, même
  source de texte), appel final en carte.

**Écarté du gabarit, et pourquoi.**
- **Avis d'utilisateurs** : l'équipe a proposé d'en simuler. Refusé : des
  avis inventés, sur un site public, tromperaient le visiteur et le jury.
  L'emplacement porte trois situations d'usage, écrites comme telles, sans
  nom ni étoiles. De vrais avis, recueillis avec l'accord de leurs auteurs,
  pourront les remplacer.
- **Bande de logos partenaires** : il n'y en a pas. Ce que le visiteur doit
  savoir à cet endroit (son fichier sera-t-il lu ?) tient dans la ligne de
  garanties.
- **Badge « 2 500+ utilisateurs »** : remplacé par ce qui est vrai.
- **Inscription à une lettre d'information** : aucun envoi n'existe derrière.

**Captures remplacées par des illustrations** (même jour, à la demande de
l'équipe, qui les trouvait « mises faute de mieux »). Une page entière réduite
dans une carte devenait du texte de 6 px, et chaque retouche de l'interface la
périmait. `components/Illustrations.tsx` montre un seul moment par carte, à
taille lisible, avec les composants du site : la question 1 du quiz et sa
citation, la réponse du tuteur et son refus sur le prix de Copilot, la synthèse
et les notions du résumé, le score. **Les textes sont de vraies sorties de
StudyAI**, recopiées mot pour mot des captures du 18 octobre ; chaque
illustration porte une description pour les lecteurs d'écran. Les captures
sont retirées du dépôt.

**Vérifié.** Aucun débordement horizontal à 390 px ; audit axe de l'accueil ;
un parcours de bout en bout (lien FAQ de l'en-tête depuis une autre page,
défilement, question dépliée). L'ancienne feuille de style de l'accueil
(380 lignes) est retirée.

## 037 — Refonte « Atelier », lot 3 : connexion, informations, consommation

- **Connexion et inscription** : le panneau de présentation passe du rouge
  foncé au clair, avec un trait rouge par module. C'était le dernier grand
  aplat de couleur du site.
- **Encadrés d'information** : neutres avec un trait à gauche. Le bleu vif
  était la couleur la plus saturée de l'écran pour une simple précision ; les
  états (succès, attention, erreur) gardent leur couleur.
- **Pages d'aide et juridiques** : un sommaire « Sur cette page » dans la
  colonne de droite, jusque-là vide, avec des ancres stables ; masqué sur
  téléphone.
- **Page introuvable** : un visiteur se voyait proposer « Revenir à mes
  cours », qui le renvoyait vers la connexion. Il revient désormais à
  l'accueil.
- **Consommation** : les modules s'affichaient sous leur nom technique, sans
  accent et sans traduction (« Resume ») ; ils prennent le libellé des
  onglets, dans la langue active.

L'examen blanc et le compte héritaient déjà de la nouvelle base ; ils n'ont
pas été retouchés.

**Vérifié.** 100 tests unitaires, construction, 51 parcours de bout en bout
avec l'audit d'accessibilité.

## 038 — Connexion et inscription : une carte à deux panneaux

**Contexte.** L'équipe a fourni une page de connexion de référence : carte
blanche, panneau de présentation dans un aplat coloré arrondi, champs
teintés, œil pour afficher le mot de passe, lien « mot de passe oublié »,
boutons de connexion par Facebook et Google.

**Décision.** Même structure, aux couleurs de StudyAI :
- panneau rouge de la marque : accroche, une phrase sur ce que fait le
  produit, les trois modules, et une vraie sortie de StudyAI (le tuteur qui
  refuse une question hors du cours) posée sur le bas du panneau ;
- formulaire sans seconde carte, logo et titre centrés, champs de 48 px ;
- **œil** sur le mot de passe (`aria-pressed`, libellé « Afficher les
  caractères saisis », qui ne contient pas « mot de passe » : le champ garde
  seul ce libellé) ;
- **« Mot de passe oublié ? »** mène à la réponse de la FAQ, qui dit quoi
  faire : la réinitialisation par courriel n'existe pas encore. Les pages
  d'information défilent désormais jusqu'à l'ancre demandée.

**Écarté de la référence.** Les boutons Facebook et Google (aucune connexion
par un tiers n'existe côté serveur : ce seraient des boutons factices), le
personnage en 3D (pas le nôtre), les halos dégradés.

**Vérifié.** Un parcours de bout en bout (œil dans les deux sens, lien d'oubli
jusqu'à la bonne question de la FAQ), sans débordement à 390 px. Sur cette
machine, deux exécutions complètes ont chacune perdu un test différent sur un
délai de chargement (`page.goto`, 30 s) quand tout tourne en parallèle ; la
troisième est passée entièrement (53 sur 53).

## 039 — Relais entre fournisseurs de modèle

**Contexte.** Nouvelle vision du projet (22 octobre) : un produit qu'on
pourrait vendre. Un service payé ne peut pas tomber parce qu'un seul
fournisseur sature ; or l'offre gratuite de Gemini répond régulièrement 503
aux heures chargées, et ses quotas ont été réduits fin 2025.

**Décision.** `LLM_RELAIS` liste des fournisseurs de secours
(`groq:openai/gpt-oss-120b`). Quand le principal échoue pour une raison
qui tient au fournisseur — indisponible, quota épuisé, délai dépassé — après
ses propres reprises, l'appel est rejoué chez le relais suivant. La
télémétrie enregistre le modèle qui a réellement répondu, donc le résumé et
la page Consommation le montrent.

- **Ne déclenchent pas le relais** : une clef refusée (erreur de
  configuration, à corriger et non à masquer) et une sortie non conforme (déjà
  relancée une fois par `executer_tache`).
- **Un relais sans clef est ignoré** : la variable peut rester renseignée en
  production tant que `GROQ_API_KEY` ne l'est pas.
- **Groq** : API compatible OpenAI, mode JSON (`response_format`), offre
  gratuite aux limites publiées par modèle, latence basse. Adaptateur en
  httpx, comme les autres : aucune dépendance ajoutée.
- `/api/health` liste les relais configurés (noms seuls, jamais les clefs).

**Confidentialité.** Le relais transmet la même demande, déjà
pseudonymisée, à un second sous-traitant. La politique de confidentialité et
les mentions légales le déclarent, en français et en anglais (mise à jour du
22 octobre).

**Vérifié.** 15 tests serveur : passage au relais pour chacune des trois
défaillances, pas de relais sur clef refusée, erreur du dernier relais
remontée, principal sans clef, configuration malformée ignorée, et
l'adaptateur Groq sur des réponses HTTP simulées (succès, 429, 401, 404,
503, JSON invalide, délai). 263 tests serveur au total.

**À faire par l'équipe.** Créer une clef Groq (console.groq.com) et la saisir
dans `server/.env` et dans le tableau de bord Render (`GROQ_API_KEY`). Rien
ne change tant qu'elle est absente.

## 040 — FSRS remplace SM-2 pour les cartes de révision

**Contexte.** SM-2 (1987) applique la même règle multiplicative à chaque
carte, quelle que soit la durée réellement écoulée depuis la révision
précédente. C'était le choix assumé de la soutenance : vingt lignes,
explicables en une phrase, sans données d'entraînement. Pour un produit qui
se compare aux leaders, ce n'est plus suffisant.

**Décision.** FSRS-4.5 (Free Spaced Repetition Scheduler), l'algorithme
qu'Anki a intégré en 2023. Chaque carte a une **stabilité** S (jours au bout
desquels la probabilité de rappel tombe à 90 %) et une **difficulté** D (1 à
10). La probabilité de rappel décroît avec le temps écoulé, et chaque
révision met S et D à jour selon cette probabilité. Ses 17 paramètres ont été
ajustés par apprentissage automatique sur un très grand volume de révisions
réelles ; nous gardons les valeurs publiées, faute de données pour les
réajuster par étudiant.

- Ce que SM-2 ignorait : une carte **réussie malgré un long retard** gagne
  plus de stabilité qu'une carte réussie à l'heure.
- Après un **oubli**, une carte bien ancrée revient vite, mais pas forcément
  le lendemain (par exemple 2 jours) : FSRS garde une trace de ce qui avait
  été appris. Le test d'API correspondant a été ajusté à ce comportement.
- Inchangés : rétention visée 90 %, plafond de 180 jours (horizon d'un
  semestre), quatre boutons, aucun appel au modèle. Les colonnes SM-2
  `intervalle` et `repetitions` restent tenues à jour pour les compteurs
  « neuves » et « acquises ».

**Migration 0008** (accord de l'équipe le 22 octobre), additive : colonnes
`stabilite`, `difficulte`, `derniereRevision`. Les cartes déjà réussies
reçoivent une mémoire convertie de SM-2 : stabilité = intervalle, difficulté
d'après le facteur de facilité (2,5 → 5 ; 1,3 → 10), dernière révision =
échéance moins intervalle. Vérifiée sur une base SQLite jetable (conversion,
carte neuve intacte, retour arrière) et en mode `--sql` de la CI, puis
appliquée sur Supabase le 23 octobre : 24 cartes, 4 converties, 20 neuves.

**Vérifié.** 34 tests de propriétés de l'algorithme (`test_fsrs.py`, qui
remplace `test_sm2.py`) et 4 tests d'API (mémoire posée, retard récompensé,
oubli, réinitialisation). 282 tests serveur au total.

## 041 — Réponses du tuteur au fil de l'eau

**Contexte.** Le tuteur faisait attendre la réponse complète : plusieurs
secondes devant un indicateur de chargement, quand tous les produits du marché
écrivent la réponse pendant qu'elle se produit.

**Décision.** Une route `POST /courses/{id}/chat/stream` répond en NDJSON
(une ligne JSON par événement) : `conversation`, puis des `texte`, puis `fin`
avec le message validé et enregistré — ou `erreur`.

- **Ce qui ne change pas** : même masquage du cours entier avant envoi, mêmes
  passages retenus, même prompt, même validation par le schéma. Le JSON
  complet est validé à la fin ; c'est lui, et non le texte diffusé, qui est
  enregistré et qui remplace l'aperçu à l'écran.
- **Seul le champ `answer` est diffusé**, décodé au fil de l'eau
  (`ExtracteurChaine`), avec les valeurs réelles remises à la place des
  jetons (`RestaurateurFlux`). Un jeton coupé entre deux morceaux est retenu
  jusqu'à être complet : on ne voit jamais « [EMA » puis « IL_1] ».
- **Erreurs** : droits, quota et cours inexistant sont vérifiés avant le
  flux et gardent leur statut HTTP. Une fois le flux ouvert, un échec arrive
  comme événement `erreur`, dans la même enveloppe `{ code, message, details }` ;
  le front le lève comme une `ApiError` ordinaire et retire l'aperçu, puisque
  rien n'a été enregistré.
- **Relais (décision 039)** : il ne vaut qu'avant le premier morceau. Une fois
  du texte montré, on ne peut plus recoller la réponse d'un autre
  fournisseur ; un échec en cours de route remonte tel quel.
- **Sortie non conforme** : pas de relance en diffusion. Le repli passe par
  l'appel classique, qui relance avec le grief exact ; la télémétrie compte
  les deux appels.
- Gemini (`streamGenerateContent?alt=sse`) et Groq (`stream: true`) diffusent ;
  un fournisseur qui ne sait pas diffuser répond d'un bloc.

L'ancienne route `POST /courses/{id}/chat` reste en service.

**Vérifié.** 23 tests serveur : extraction quel que soit le découpage
(échappements, accents), jetons coupés, relais avant et pas après le premier
morceau, repli sur sortie invalide, décodage SSE de Gemini et de Groq, et la
route de bout en bout (diffusion en plusieurs morceaux, enregistrement,
droits vérifiés avant le flux, échec comme événement, aucune donnée
personnelle transmise). 3 tests du lecteur NDJSON côté navigateur, avec des
paquets qui coupent les lignes et un caractère accentué. 302 tests serveur,
103 tests unitaires et 53 parcours de bout en bout au total.

**Non vérifié** : la diffusion face au vrai service de Gemini. Les tests
reposent sur des flux SSE simulés, au format documenté.

**Mise à jour du 23 octobre — essai réel du relais.** Le modèle prévu,
`llama-3.3-70b-versatile`, a été retiré par Groq (404 « modèle non
disponible ») ; le relais utilise `openai/gpt-oss-120b`, modèle à poids
ouverts d'OpenAI (131 000 jetons de contexte). Essai réel, Gemini simulé
indisponible : bascule vers Groq, réponse ancrée et sourcée en 2,1 s, texte
diffusé identique au texte validé, courriel du cours masqué avant envoi. À
noter : en mode JSON, Gemini comme Groq livrent la réponse en un ou deux
gros morceaux plutôt que mot à mot ; le gain ressenti tient surtout à la
vitesse. Sur le poste de développement, l'antivirus (Kaspersky) intercepte
les connexions chiffrées vers Groq ; l'essai a utilisé le magasin de
certificats de Windows pour ce seul script. La production n'est pas
concernée.

## 042 — Abandon des contraintes scolaires

**Contexte.** Le projet est validé. Le 23 octobre, l'équipe a décidé
d'abandonner toutes les contraintes héritées du cadre scolaire qui limitent
le produit. Une seule est volontairement conservée : la mention « Projet
étudiant ESPRIT » (badge de l'accueil, pied de page, mentions légales).

**Règles de méthode abandonnées.** « Explicable devant un jury » comme
critère de choix ; « aucune dépendance nouvelle » (une bibliothèque entre
désormais quand elle fait mieux qu'un code écrit à la main) ; documentation
rédigée pour le jury. Ce journal reste, comme journal du produit ; le rapport
n'est plus entretenu.

**Changements.**
- **Réglages** : `SEGMENT_CHARS` 24 000 → 16 000 (résumés plus fins),
  `SEGMENTS_CHAT` 3 → 4 (contexte comparable pour le tuteur),
  `MAX_SEGMENTS` 24 → 32, plafond par étudiant 10 → 15 appels par minute,
  plafond global 400 → 1 500 par jour. Le relais Groq absorbe un quota épuisé
  chez Gemini ; les plafonds restent une protection contre les abus, à
  ajuster sur les quotas réels des offres retenues au lancement.
- **Interface** : plus de pastilles « 1 appel » / « gratuit » sur les
  onglets ; la page de consommation quitte la navigation principale pour le
  menu du compte (« Utilisation de l'IA ») ; la ligne de provenance (modèle,
  version du prompt, latence) quitte le résumé — elle reste enregistrée et
  visible sur la page d'utilisation. **« Ce qui a été envoyé au modèle »
  reste** : c'est la preuve du masquage, et un argument de vente.
- **Erreurs** : le code technique devient une référence discrète
  (« Réf. LLM_QUOTA_EXCEEDED ») à donner au support.
- **Démonstration** : `DEMO-VEILLE.md` et `PROMPT-VERIFICATION-DEMO.md`
  rejoignent `docs/archives/`. Le cours « Démo — données personnelles » du
  compte de démonstration n'est pas touché : sa suppression sera demandée à
  part.

**Conservé, bien que venu de l'énoncé.** Le masquage des données
personnelles avant envoi, les réponses ancrées dans le cours et le refus
d'inventer, les tests et la CI.

**Défaut trouvé en route.** La clef Groq ajoutée à `server/.env` était lue par
les tests : un test qui retire la clef Gemini retombait sur le vrai Groq. Les
tests forcent désormais `LLM_RELAIS` et `GROQ_API_KEY` à vide, et vident la
chaîne de relais dans chaque test.

**Vérifié.** 305 tests serveur, 103 tests unitaires, construction, 53
parcours de bout en bout.

## 043 — Cours enregistrés, PDF scannés et photos de notes

**Contexte.** StudyAI ne lisait que les fichiers à couche texte (PDF
numérique, Word, PowerPoint, texte). Un PDF scanné était refusé, et un cours
enregistré ou une photo de notes n'avaient aucune entrée possible — alors que
les produits du marché les acceptent.

**Décision.**
- **Enregistrements** (.mp3, .m4a, .wav, .ogg, .flac, .webm, .mp4…) :
  transcrits par **Whisper** (`whisper-large-v3-turbo`) chez Groq ; langue
  détectée automatiquement.
- **PDF scannés et photos** (.jpg, .png, .webp, .heic) : lus par **Gemini**,
  le fichier joint à la requête, avec une consigne de recopie intégrale (ni
  résumé, ni correction). Une lecture coupée par la limite de longueur est
  signalée dans le texte lui-même, jamais tronquée en silence.
- Le texte obtenu devient un **cours ordinaire** : tout ce qui suit (résumé,
  quiz, tuteur) repasse par le masquage.

**L'exception au masquage, et pourquoi elle est consentie.** Ces fichiers
n'ont pas de texte à masquer avant d'avoir été lus : ils partent **tels
quels**. L'import exige donc l'accord explicite de l'étudiant, **fichier par
fichier** (`consentement=true`) ; sans lui, rien ne part et la route répond
`VALIDATION_ERROR` avec `consentement_requis` (`enregistrement` ou
`document`). Un PDF dont on découvre qu'il est scanné déclenche la même
demande. L'interface affiche un encadré qui nomme le destinataire (Groq ou
Google) et désactive l'envoi tant que la case n'est pas cochée. Politique de
confidentialité, mentions légales, aide et FAQ le disent (mise à jour du
23 octobre).

**Pourquoi Gemini plutôt qu'un OCR local (Tesseract).** Débattu avec
l'équipe : l'OCR local ne laisserait rien sortir avant masquage, mais lit mal
l'écriture manuscrite et les tableaux, et imposerait de passer l'API de Render
en conteneur Docker. L'audio impose de toute façon la règle d'accord pour un
envoi sans masquage ; Gemini s'y range. La lecture est isolée
(`pipeline.lire_document_image`) : un OCR local pourra être branché si un
client exige que rien ne sorte.

**Écarté.** YouTube : aucune voie officielle et gratuite pour les
sous-titres ; les bibliothèques existantes contournent les conditions de
YouTube et sont souvent bloquées depuis les serveurs d'hébergement.

**Garde-fous.** La lecture compte dans le quota d'analyses (plafond par
minute et par jour) ; 25 Mo par fichier, 14 Mo pour un fichier lu par Gemini
(limite de la requête) ; moins de 200 caractères reconnus = refus explicite.
**Complément du 27 octobre** : le plafond de 25 Mo est aussi vérifié **dans le
navigateur, avant l'envoi** — un fichier trop lourd n'est plus téléversé pour
rien ; le message donne son poids et conseille de découper ou de compresser.
Le découpage automatique des longs enregistrements est **écarté** : on s'en
tient à la limite.

**Vérifié.** 15 tests serveur (aucun envoi sans accord, accord refusé, PDF
scanné détecté, PDF à couche texte jamais envoyé même avec accord, texte
minimal, quota, adaptateurs Whisper et Gemini) et un parcours de bout en bout
(avertissement, bouton désactivé jusqu'à l'accord, cours créé). **Essais
réels** : un enregistrement de synthèse vocale transcrit mot pour mot en
1,6 s ; un PDF sans couche texte recopié fidèlement (titres, listes) en 5,4 s.
320 tests serveur, 103 tests unitaires, 55 parcours au total.

## 044 — Présentation narrée d'un cours

**Contexte.** Les produits du marché proposent d'« expliquer en vidéo » un
cours. La génération de vraie vidéo (Veo, Sora, modèles libres) est soit
payante à la seconde, soit impossible à héberger sur Render, et produit des
clips courts au contenu imprécis — rédhibitoire pour un outil pédagogique.

**Décision.** Une présentation narrée : 5 à 8 scènes, chacune avec un titre,
1 à 4 points, une narration à dire à voix haute et une **citation exacte** du
cours. Le script est écrit en UN appel au modèle, par le même chemin que le
quiz (cours entier masqué, parties échelonnées pour un cours long), validé
par son schéma (`PresentationIA`, 4 à 10 scènes), enregistré (table
`presentations`, migration 0009) et relu sans appel. Le navigateur anime les
diapositives et lit la narration ; sous-titres toujours affichés ; modes
« Vidéo » et « Audio seul » ; vitesse réglable ; chaque citation ouvre le
texte source surligné.

**Vérifié.** 10 tests serveur (vide au départ, génération puis relecture
gratuite, masquage, accès d'un autre étudiant, quota, cascade, bornes du
schéma) et un parcours de bout en bout sur ordinateur et mobile. Essai réel :
6 scènes en 3,4 s, toutes les citations retrouvées mot pour mot.

## 045 — Voix naturelle de la présentation

**Contexte.** La voix du navigateur est gratuite mais synthétique ; c'était
le maillon faible de la présentation.

**Décision.** Synthèse vocale **Gemini** (`gemini-3.8-flash-tts`, voix
« Kore »), avec la clef existante. La voix d'une scène est produite à la
**première écoute**, encodée en **MP3** mono 48 kbit/s (`lameenc`, sans
dépendance système : 860 Ko de WAV deviennent environ 100 Ko), enregistrée
(table `presentation_voices`, migration 0010) et relue ensuite sans appel.
Le lecteur prépare la scène suivante pendant l'écoute de la courante ; la
pause reprend où l'on s'était arrêté. Seule la **production** compte dans le
quota.

**Confidentialité.** La narration est restaurée pour l'affichage : elle peut
contenir une donnée personnelle du cours. Elle est donc repassée au masquage
avant tout envoi ; si quoi que ce soit est détecté, la scène **ne part pas**
(204) et le navigateur la lit avec sa voix locale.

**Secours.** La voix de l'appareil reste disponible au choix, et prend le
relais scène par scène en cas de 204, de quota atteint ou de panne.

**Correctif du 23 octobre.** Une consigne de ton placée devant le texte
(« lis ce texte d'un ton chaleureux : ») était **lue à voix haute** ; le
modèle refuse une consigne système (400). Le texte part désormais seul —
vérifié en faisant retranscrire l'audio par Whisper.

**Quota de l'offre gratuite : 10 voix par jour et par modèle** (constaté le
23 octobre, `GenerateRequestsPerDayPerProjectPerModel-FreeTier`). Deux
modèles sont enchaînés (`gemini-3.8-flash-tts`, puis
`gemini-3.8-flash-lite-tts`) : un quota épuisé fait passer au suivant, puis
à la voix de l'appareil. C'est suffisant pour une démonstration, **pas pour
un service ouvert** : une mise en vente suppose l'offre payante de Gemini.

**Vérifié.** 13 tests serveur (MP3 produit puis relu sans appel, narration
avec donnée personnelle jamais envoyée, accès d'un autre étudiant, bornes,
quota, cascade, encodage) ; aucun appel réel possible en test (garde
`_aucune_voix_reelle`). Essai réel : une narration devenue un MP3 de 79 Ko
en 5,2 s. 343 tests serveur, 103 tests unitaires.

## 046 — Plan de révision jusqu'à l'examen

**Contexte.** StudyAI savait résumer, interroger et faire réviser, mais ne
disait pas **quoi faire chaque jour** d'ici l'examen — la question que se
pose un étudiant à trois semaines des partiels, et une fonction que mettent
en avant les produits du marché.

**Décision.** L'étudiant donne une date d'examen, les cours concernés (1 à
12) et le temps dont il dispose par jour (15 min à 3 h). Une page « Plan de
révision » affiche le compte à rebours, les séances du jour à cocher (chacune
ouvre directement l'onglet utile), ses cours avec leur maîtrise, et les jours
suivants.

**Aucun appel au modèle.** Le plan est un calcul sur ce que la base sait
déjà : score moyen aux quiz, cartes existantes. Gratuit, sans quota, et
**recalculé à chaque lecture** — seuls les choix de l'étudiant et les séances
cochées sont enregistrés (table `revision_plans`, migration 0011).

**L'algorithme** (`services/plan.construire`, fonction pure) :
- un poids par cours, de 1 (maîtrisé) à 3 (jamais interrogé ou raté) ;
- un cours jamais interrogé commence par son résumé, puis viennent les quiz ;
- les séances d'un même cours s'espacent (1, 2, 3, 5, 8 jours), d'autant
  moins qu'il est faible ;
- chaque jour : les cartes d'abord, puis les cours dus, les plus faibles en
  premier, dans la limite du temps du jour ; un jour sans cours dû avance la
  séance la plus proche plutôt que de rester vide ;
- un examen blanc trois jours avant ; la veille, des cartes et le résumé du
  cours le plus fragile, rien de nouveau.

**Coche automatique.** Un quiz rendu ou des cartes révisées aujourd'hui
cochent la séance correspondante : l'étudiant n'a pas à déclarer ce que la
base sait déjà. La date du jour est celle de l'appareil (minuit ne tombe pas
au même moment à Tunis et sur le serveur), refusée si elle s'écarte de plus
d'un jour de celle du serveur.

**Vérifié.** 18 tests serveur (7 sur l'algorithme jour par jour, 11 sur les
routes : création, dates invalides, cours ou plan d'un autre étudiant, cocher
et décocher, coche automatique, cours supprimé, suppression) et un parcours
de bout en bout sur ordinateur et mobile. 364 tests serveur, 103 tests
unitaires, 59 parcours au total.

## 047 — Carte mentale d'un cours

**Contexte.** Dernière brique du lot 3 : voir la **structure** d'un cours d'un
coup d'œil, ce que proposent les outils de révision du marché.

**Décision.** Le modèle rend la structure en UN appel, par le même chemin que
la présentation (cours entier masqué, parties échelonnées pour un cours
long) : un sujet, 3 à 7 branches dans l'ordre du cours, 0 à 5 idées par
branche, chaque étiquette en quelques mots (90 caractères au plus) et
**chaque branche et chaque idée citant un extrait exact du cours**. Schéma
`CarteMentaleIA`, table `mind_maps` (migration 0012), relue sans appel ;
comptée dans la page de consommation.

**Le dessin est fait par le navigateur**, deux vues :
- « Carte » : le sujet au centre, les branches de part et d'autre, leurs
  idées vers l'extérieur, en SVG ; aucune boîte ne sort du dessin (bornes
  calculées), téléchargeable en PNG (couleurs en dur dans le SVG, puisque
  l'image exportée vit hors de la feuille de style) ;
- « Plan » : la même structure en liste dépliable, vue par défaut sur un
  écran étroit, où une carte en largeur devient illisible.
Cliquer une idée (souris ou clavier) affiche sa citation, qui ouvre le texte
source surligné.

**Vérifié.** 11 tests serveur (vide au départ, génération puis relecture
gratuite, masquage, accès d'un autre étudiant, quota, cascade, bornes du
schéma) et un parcours de bout en bout sur ordinateur et mobile. Essai réel :
6 branches, 12 idées, **18 citations sur 18** retrouvées mot pour mot, en
15 s. 375 tests serveur, 103 tests unitaires, 61 parcours au total.

## 048 — Les questions ratées reviennent en cartes

**Contexte.** Le quiz et l'examen blanc mesuraient ; les cartes faisaient
retenir ; rien ne reliait les deux. Une question ratée — la preuve la plus
fiable qu'une notion n'est pas sue — ne changeait rien au jeu de cartes, qui
ne se construisait d'ailleurs que si l'étudiant le demandait.

**Décision.** À chaque quiz ou examen blanc rendu, chaque question ratée
revient en carte, **à réviser aujourd'hui** (`cartes.remettre_les_erreurs`) :
- pas encore de carte : elle est créée (recto : la question ; verso : la
  BONNE réponse ; explication et citation du cours) ;
- une carte déjà revue : l'erreur compte comme un **oubli** pour FSRS (note
  1), sa stabilité baisse ;
- une carte jamais revue : elle est simplement due aujourd'hui.
La carte existante est retrouvée comme lors de la construction du jeu (même
clé, ou même question reformulée avec la même réponse) : rater deux fois ne
crée pas de doublon. Une erreur n'est pas une révision : le compteur de
révisions n'avance pas. Pour l'examen blanc, chaque erreur va dans le jeu de
son cours ; un cours supprimé depuis la composition est sauté.

**Aucun appel au modèle**, aucune migration : tout existe déjà en base. La
correction rend `cardsQueued`, et l'interface l'annonce (« 2 questions
ratées sont ajoutées à vos cartes : elles reviennent dès aujourd'hui »), avec
un lien vers l'onglet Cartes.

**Vérifié.** 6 tests serveur (création avec la bonne réponse au verso, quiz
réussi sans effet, pas de doublon, carte sue qui revient comme oubliée,
examen sur deux cours, cours supprimé) et un parcours de bout en bout.
381 tests serveur, 103 tests unitaires, 65 parcours au total.

## 049 — Questions ouvertes corrigées par l'IA

**Contexte.** Le QCM vérifie qu'on reconnaît la bonne réponse ; un examen
demande de la **rédiger**. C'est l'écart le plus net avec ce qu'attend un
étudiant d'un outil de révision haut de gamme.

**Décision.** Dans l'onglet Quiz, un second type d'exercice, « Questions
ouvertes » (1 à 5 questions). Deux appels au modèle, et deux seulement :
- **la génération** (`QuestionsOuvertesIA`) : des questions qui demandent
  d'expliquer, de comparer, de justifier ; pour chacune, 2 à 5 **points
  attendus**, chacun avec une **citation exacte** du cours, et une réponse
  modèle. Table `open_quizzes` (migration 0013). Comme pour le quiz, les
  points attendus et la réponse modèle **ne descendent pas** au navigateur
  avant la correction ;
- **la correction** (`CorrectionOuverteIA`), en un appel pour toute la copie,
  à température 0 : pour chaque point attendu, un jugement « acquis »,
  « partiel » ou « absent » ; au plus 3 erreurs relevées (affirmation,
  correction, citation du cours) ; un commentaire. Table `open_attempts`.

**La note n'est pas demandée au modèle.** Une note tirée d'un modèle varie
d'un appel à l'autre et ne s'explique pas. Le serveur la calcule : un point
acquis vaut 1, partiel ½ ; chaque question pèse autant ; arrondi au
demi-point sur 20. L'interface affiche la note AVEC son détail point par
point. Le nombre de jugements est normalisé (complété par « absent ») si le
modèle s'en écarte ; une réponse vide ne rapporte rien, quoi qu'il dise ; une
copie entièrement blanche est refusée sans appel.

**Confidentialité.** La copie entière (points attendus restaurés compris,
et réponses de l'étudiant) est masquée avant l'envoi.

**Interface.** Brouillon gardé dans le navigateur (une copie de dix minutes
ne se perd pas en changeant d'onglet) ; la correction annonce qu'elle peut
prendre jusqu'à une minute — 47 s mesurées un jour de saturation de Gemini.

**Vérifié.** 11 tests serveur (secret des points attendus, correction en un
appel et note calculée, réponse vide, copie blanche refusée sans appel,
masquage, accès d'un autre étudiant, quota, cascade, arrondi, normalisation
des jugements) et un parcours de bout en bout. **Essai réel** : 3 questions,
6 citations exactes sur 6 ; la réponse modèle obtient 20/20, une réponse
fausse 0/20 avec l'erreur relevée et corrigée (« SJF et non FIFO »), une
réponse vide 0/20. 392 tests serveur, 103 tests unitaires, 67 parcours.
