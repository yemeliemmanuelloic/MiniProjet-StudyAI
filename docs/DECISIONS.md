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
