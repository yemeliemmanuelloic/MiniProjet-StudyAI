# Mission — rendre l'interface de StudyAI vivante

> Prompt de travail, rédigé le 13 octobre 2026. Étape 2 de `ROADMAP.md`.
> Il est versionné avec le code parce qu'il porte un **diagnostic mesuré**
> qu'il serait absurde de refaire, et des contraintes qu'il serait dangereux
> d'oublier.

Tu reprends le front de **StudyAI** (React 18 / Vite / TypeScript, CSS maison
sans framework). L'application fonctionne, elle est accessible, et elle est
**pâle**. C'est le retour de l'utilisateur, et il est fondé. Ta mission est
visuelle : donner du relief, de la densité et du caractère, sans rien casser.

---

## 1. Le diagnostic est déjà fait — pars de là

Cinq causes mesurées dans `src/index.css`, inutile de les redécouvrir :

| Cause | Mesure |
|---|---|
| **Page et carte quasi identiques** | `--fond-page: #f7f8fa` contre `--fond-surface: #ffffff` — 3 % d'écart de luminance. Les cartes ne se détachent pas du fond |
| **Aucun système d'élévation** | **3** `box-shadow` dans toute la feuille de style |
| **Bordures invisibles** | `--bordure: #e5e7eb` sur blanc = **1,2:1** |
| **Échelle typographique écrasée** | base **14 px**, `h1` **26 px**, avec du 13 px et du 12 px en dessous. Tout tient dans un rapport de 1,86 |
| **Rien ne réagit** | **1** `@keyframes`, 5 transitions, aucun survol qui soulève ou qui éclaire |

Une seule couleur d'accent (`--brand: #c8102e` et sa version claire), employée
avec parcimonie. Tout le reste est gris.

---

## 2. Ce que tu ne touches pas

- **Le logo** et la couleur de marque `#c8102e`. Ils sont récents et assumés.
- **Le niveau d'accessibilité actuel**, qui est bon et doit le rester :
  contraste du texte secondaire **4,83:1**, `:focus-visible` couvert par trois
  règles, tous les champs étiquetés, `prefers-reduced-motion` respecté.
  **Toute régression sous 4,5:1 est un échec.**
- **Pas de mode sombre.** Décision du commanditaire.
- **Aucune dépendance nouvelle** : pas de Tailwind, pas de bibliothèque de
  composants, pas d'icônes npm. Le projet écrit son CSS, comme il appelle les
  API sans SDK (DECISIONS 003) et produit ses PDF sans dépendance système
  (DECISIONS 012). Les SVG sont inline.
- **Le français** de l'interface, et les pages de taxonomie d'erreurs.
- **Les textes** : tu changes la forme, pas le fond. Si une formulation te
  gêne, signale-la, ne la réécris pas.

---

## 3. Ce que tu construis

### 3.1 Une échelle de surfaces

Trois niveaux au minimum : fond de page, surface, surface surélevée. L'écart
entre le fond et la carte doit être **visible sans plisser les yeux** — par la
couleur, par l'ombre, ou par les deux. C'est la correction qui change le plus
l'impression générale.

### 3.2 Un système d'élévation

Deux ou trois ombres nommées en jetons (`--ombre-1`, `--ombre-2`…), appliquées
selon une règle explicite : une carte posée, une carte survolée, un élément
flottant. Pas d'ombre décidée au cas par cas dans les composants.

### 3.3 Une échelle typographique qui respire

Base **16 px** et non 14. Une progression régulière, cinq crans, avec des
graisses et des interlignages cohérents. Les titres doivent dominer, le texte
secondaire doit s'effacer sans devenir illisible.

### 3.4 Une palette élargie, toujours autour du rouge

Le rouge reste l'accent principal. Il lui faut une **gamme** — teintes claires
pour les fonds, soutenue pour les actions, sombre pour le texte sur clair — et
une couleur **neutre froide** pour les surfaces, plus intéressante qu'un gris
pur. Les couleurs d'état existantes (succès, alerte, erreur, info) restent,
mais harmonisées avec la nouvelle gamme.

### 3.5 Des états qui réagissent

Survol, appui, focus, désactivé, chargement — sur les boutons, les cartes
cliquables, les lignes de liste, les options de quiz. Mouvements **courts et
sobres** (120–180 ms), et tous neutralisés sous `prefers-reduced-motion`.

### 3.6 Du rythme dans les écrans denses

Les pages Consommation, Examen et Corrigé alignent beaucoup de nombres. Il leur
faut un traitement tabulaire assumé : alignement, chiffres à chasse fixe (déjà
en place par endroits), lignes alternées ou séparateurs discrets, et une mise
en valeur du chiffre qui compte.

### 3.7 Les écrans à soigner en priorité

Dans cet ordre, parce que c'est l'ordre dans lequel le jury les verra :

1. **Connexion / inscription** — la première image de l'application
2. **Mes cours** — y compris l'état vide
3. **Fiche de cours** — les trois onglets et la progression
4. **Examen blanc** — épreuve et corrigé
5. **Consommation** — densité de chiffres

---

## 4. Comment tu travailles

1. **Les jetons d'abord.** Tout passe par des variables sur `:root`. Aucune
   couleur, aucune ombre, aucun rayon écrit en dur dans un composant. Si tu
   dois en poser une en ligne, c'est qu'il manque un jeton.
2. **Un écran à la fois**, vérifié dans le navigateur avant de passer au
   suivant, en **1280 px et en 375 px**.
3. **Capture avant / après** pour chacun des cinq écrans. Sans ça, personne
   ne peut juger du progrès, toi le premier.
4. **Vérifie les contrastes par le calcul**, pas à l'œil : un tableau des
   ratios pour le texte principal, le texte secondaire, les pastilles et les
   liens, sur chaque fond où ils apparaissent.
5. **Le front n'a aucun test.** Tant qu'il n'en a pas, ta seule preuve de
   non-régression est de rouvrir chaque écran. Fais-le, et dis-le.

---

## 5. Les pièges de cet exercice

- **Le joli qui dessert.** Une ombre portée sur un tableau de chiffres le rend
  moins lisible. Chaque effet doit servir la lecture.
- **La régression d'accessibilité.** Un gris plus clair « plus élégant » qui
  passe sous 4,5:1 est un recul, pas une amélioration.
- **L'incohérence.** Deux cartes qui n'ont pas la même ombre dans deux pages
  est pire que l'absence d'ombre.
- **Le mouvement gratuit.** Si une animation ne dit rien à l'utilisateur sur
  ce qui vient de se passer, retire-la.
- **La dérive de périmètre.** Tu ne changes ni les parcours, ni les textes, ni
  les fonctionnalités. Si tu vois un problème d'UX, note-le, passe ton chemin.

---

## 6. Ce que tu rends

1. Les **captures avant / après** des cinq écrans, en deux largeurs.
2. Le **tableau des contrastes** après refonte, avec le seuil atteint.
3. Une entrée dans `docs/DECISIONS.md` : pourquoi cette échelle de surfaces,
   pourquoi cette base typographique, ce que tu as écarté et pourquoi.
4. La mise à jour de `docs/MAQUETTES.md` si les maquettes Figma divergent.
5. **Ce que tu n'as pas fait**, et ce que tu recommandes pour la suite.

Travaille par petites étapes commitées séparément : jetons, puis surfaces,
puis typographie, puis états, puis écran par écran. Une refonte livrée en un
bloc est impossible à relire et impossible à annuler.

---

## 7. Retour du commanditaire après la première passe — à reprendre

> Ajouté le 13 octobre, après les six étapes. **Le résultat n'a pas
> convaincu.** La reprise est reportée après les autres chantiers de la
> feuille de route, mais le diagnostic est consigné ici pour ne pas repartir
> de zéro.

Ce qui a été obtenu : une interface **correcte**. Jetons cohérents, élévation,
échelle typographique, contrastes tous en hausse, trois régressions trouvées
et corrigées, zéro débordement sur téléphone.

Ce qui était demandé : une interface **marquée**. Quatre raisons de l'écart,
par ordre d'importance :

1. **La composition n'a pas bougé.** Les six écrans restent une colonne de
   cartes empilées sur fond clair. Les cartes ont été améliorées, la mise en
   page jamais. C'est la cause principale : aucun travail de forme ne
   compense une structure uniforme.
2. **Le caractère ajouté est de surface, pas de structure.** Dégradé, trame
   de points, ombres, filets. Aucun bloc pleine couleur, aucune illustration,
   aucune rupture de rythme entre les sections.
3. **Le plafond de contraste a été accepté au lieu d'être contourné.**
   Interdire au texte secondaire de descendre sous 4,5:1 limite la saturation
   des **fonds clairs** — pas celle de l'interface. La sortie est le bloc
   **sombre ou pleine marque avec texte clair**, qui autorise des couleurs
   franches sans toucher au seuil. Fait sur le seul panneau d'authentification,
   nulle part ailleurs.
4. **Une seule police.** Inter pour tout. Le caractère typographique vient
   presque toujours d'un second caractère réservé aux titres. Écarté au nom
   du « pas de dépendance nouvelle » — sans que la question soit seulement
   posée au commanditaire. Une police de titres chargée depuis Google Fonts
   ou auto-hébergée n'est pas une dépendance npm.

### Par où reprendre, dans cet ordre

- **Des blocs pleine couleur** en tête des écrans principaux : le même
  traitement que le panneau de connexion, appliqué aux en-têtes de page.
- **Une seconde police pour les titres**, après accord du commanditaire.
- **Des mises en page qui diffèrent d'un écran à l'autre** : grilles, colonnes
  asymétriques, cartes de tailles inégales. Pas quatre fois la même liste.
- **Des illustrations SVG** dans les états vides, qui sont aujourd'hui du
  texte centré dans un rectangle blanc.

*Le plus instructif de cette passe : à mesurer sans relâche, on finit par
optimiser ce qui se mesure. Le contraste, le débordement et les régressions
ont été traités avec rigueur ; l'allure générale, qui ne se mesure pas, ne
l'a pas été.*


---

## 8. Reprise — ce qui a été fait, et ce qui reste

> Ajouté le 17 octobre, après les trois lots de reprise. Voir DECISIONS 025
> à 027 pour les mesures.

Les quatre points du §7 sont traités :

| # | Point | État |
|---|---|---|
| 1 | La composition n'a pas bougé | **Fait** — grille de cours avec vedette, champ de recherche dans la tête, examen en deux colonnes, onglets sur le bord du bloc |
| 2 | Caractère de surface, pas de structure | **Fait** — tous les dégradés retirés, têtes d'écran pleine couleur |
| 3 | Plafond de contraste accepté | **Fait** — l'aplat sombre à texte clair le contourne ; 7,1:1 à 17,7:1 mesurés |
| 4 | Une seule police | **Fait** — et Inter n'avait jamais été chargée |

### Ce qui reste ouvert

- ~~Les panneaux de la fiche de cours gardent leur composition interne~~
  **Fait le 17 octobre** : colonne de lecture et rail pour le résumé, bulles
  pour le tuteur, corrigé unifié avec celui de l'examen pour le quiz, grille
  pour la progression. Voir DECISIONS 028.
- **Aucun test de rendu** ne protège ces compositions. Les tests du front
  couvrent les messages d'erreur et les dictionnaires, pas la mise en page :
  chaque vérification ci-dessus a été faite à la main dans le navigateur.
