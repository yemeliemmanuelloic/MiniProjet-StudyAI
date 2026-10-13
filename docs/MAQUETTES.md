# Maquettes Figma

**Fichier** : [StudyAI — Maquettes](https://www.figma.com/design/eHMVn2FuBOBXeeFxvoCOZZ)

Six pages, 25 variables de design, 11 composants et 16 écrans.

---

## 01 · Jetons & composants

Les 25 variables sont reprises **un pour un** de `client/src/index.css`. Aucune
couleur n'est écrite en dur dans le fichier : tout passe par la collection
« Jetons StudyAI ». Si la charte change, elle change à un seul endroit — comme
dans le code.

| Composant | Variantes |
|---|---|
| **Logo** | Sur fond clair, Sur fond coloré |
| Bouton | Primaire, Secondaire |
| Pastille | Neutre, Marque, Succès, Alerte, Erreur |
| Champ | Défaut, Focus, Erreur |
| Alerte | Info, Succès, Attention, Erreur |
| Score | Bon, Moyen, Faible — **anneau de progression** |
| Carte, État vide, En-tête, Onglets | — |

Chaque composant porte une description expliquant **quand** l'utiliser, pas
seulement à quoi il ressemble.

## 02 · Écrans — parcours nominal

| # | Écran | Ce qu'il montre |
|---|---|---|
| 01 | Inscription | **Deux panneaux** : le produit à gauche, le formulaire à droite |
| 02 | Connexion | Idem |
| 03 | Mes cours — vide | État vide explicite avec action |
| 04 | Ajouter un cours | Deux modes : texte collé ou PDF |
| 05 | Mes cours — liste | Compteurs résumés / quiz / messages |
| 06 | Fiche — Résumé vide | Sélecteur de niveau |
| 07 | Fiche — Résumé généré | **Vue de transparence dépliée** |
| 08 | Fiche — Quiz posé | 4 options, aucune bonne réponse visible |
| 09 | Fiche — Quiz corrigé | Score, explications, **citation du cours** |
| 10 | Fiche — Tuteur | Sources citées et pastille « Hors du cours » |

## 03 · États & erreurs

C'est la page qui répond à l'exigence de l'énoncé sur la gestion des erreurs
d'appel API.

| # | Écran |
|---|---|
| 11 | Résumé — chargement (squelettes + rappel de confidentialité) |
| 12 | `LLM_KEY_MISSING` — clé absente |
| 13 | `LLM_QUOTA_EXCEEDED` — quota épuisé |
| 14 | `VALIDATION_ERROR` — PDF scanné refusé |
| 15 | Cours long — résumé par agrégation, 4 segments, 5 appels |
| 16 | Page introuvable |

Les écrans 12 et 13 portent une « note de conception » qui explique le choix :
le serveur démarre sans clé pour que l'absence se manifeste proprement, et un
quota épuisé n'est jamais réessayé.

## 04 · Parcours & schémas

Trois figures, **réutilisables telles quelles dans le rapport technique** :

1. **Parcours utilisateur** — de l'inscription aux trois onglets.
2. **Pipeline des modules IA** — les six étapes, avec en regard les quatre
   décisions qui les expliquent et les mesures réelles du 12 octobre.
3. **Taxonomie d'erreurs** — les onze codes, leur statut HTTP et leur sens.

---

## 05 · Propositions de logo

Deux séries de trois pistes, chacune montrée en grand, avec le nom, sur fond
rouge, et **à 16 px** — la taille réelle dans un onglet. Une marque qui ne tient
pas à 16 px n'est pas une marque, et c'est ce critère qui a départagé.

## 06 · Taxonomie d'erreurs

Les onze codes rendus **tels qu'ils s'affichent réellement**, et non en tableau
abstrait. Chaque bandeau porte son icône de famille, le message, la conduite à
tenir, les actions disponibles et le code technique.

Le point à montrer en soutenance : le bouton « Réessayer » n'apparaît que si le
code est réellement réessayable — exactement la politique de reprise du
serveur. Le proposer sur un quota épuisé reviendrait à promettre à l'étudiant
quelque chose qui ne peut pas marcher.

## Note de méthode

Les écrans sont construits en calques simples liés aux mêmes variables, et non
en instances des composants. C'est un choix de rapidité assumé : le résultat
visuel est identique et les jetons restent la source unique des couleurs, mais
un changement de composant ne se propage pas automatiquement aux écrans. Sur un
projet qui vivrait plus longtemps, il faudrait instancier.

## La marque

Un trait continu qui forme à la fois un **S** et un **signet**. Abstrait, sans
cadre, sans objet reconnaissable : volontairement ni cerveau ni robot — rien
qui date la marque. Une première proposition reposait sur trois lignes de
texte surmontées d'une étincelle ; l'étincelle est le cliché visuel de l'IA, et
le reste était l'icône « notes » de n'importe quelle application.

**Deux variantes optiques, et ce n'est pas une coquetterie :**

| Variante | Usage | Pourquoi |
|---|---|---|
| Libre | En-tête, grands formats | Le trait seul, plus léger, plus élégant |
| Encadrée | Favicon, moins de 24 px | À 16 px, un aplat se repère dans une barre d'onglets là où un trait fin se perd |

C'est le **même dessin**, pas deux logos. Les terminaisons sont coupées droit
plutôt qu'arrondies : les bouts ronds ajoutent du poids optique aux extrémités,
exactement là où il en faut le moins quand le signe rétrécit.

Le défaut de la première version du ruban n'était pas l'épaisseur du trait mais
la **fermeture des contrepoinçons** — les deux vides enfermés par le S.
Épaissir sans élargir les aurait bouchés davantage : le S a donc été élargi
pour occuper toute la boîte au lieu d'y flotter. Les quatre essais sont
conservés sur la page 05 du fichier Figma.

Le même tracé sert de favicon (`client/public/favicon.svg`), de composant React
(`client/src/components/Logo.tsx`) et de composant Figma.

---

Les maquettes reflètent l'application **telle qu'elle est**, pas une intention.
Les textes, les mesures de télémétrie et les sorties du modèle sont ceux des
appels réels du 12 octobre 2026.
