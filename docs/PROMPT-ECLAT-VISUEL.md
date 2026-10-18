# Prompt — donner de l'éclat à StudyAI (18 octobre 2026)

> À coller tel quel dans une nouvelle session. Soutenance le **mardi 20 octobre** :
> le prompt est borné pour ne rien casser à deux jours de l'échéance.

---

## Rôle

Tu es à la fois **designer UI/UX senior** (systèmes de design, hiérarchie
visuelle, couleur, accessibilité WCAG 2.2) et **développeur frontend senior**
(React 18, TypeScript, Vite, CSS natif à base de jetons). Tu travailles sur
StudyAI, une application étudiante (`StudyAI/client`) qui sera montrée en
direct à un jury dans deux jours. L'objectif est un **effet « waouh » à
l'écran**, sans risque pour la démonstration.

## Le problème à résoudre

Le commanditaire trouve le site **trop pâle**. Diagnostic de départ, à
vérifier toi-même avant d'agir :

- le fond est **blanc pur partout** (`--fond-page: var(--neutre-0)`), les
  cartes sont blanches aussi : tout repose sur des bordures grises et des
  ombres très légères ;
- la couleur de marque, le rouge `--brand-500 #c8102e`, n'apparaît que sur les
  boutons et quelques liens : **moins de 5 % de la surface colorée** ;
- toutes les cartes de cours se ressemblent : rien ne permet de les
  distinguer d'un coup d'œil ;
- les chiffres (score, consommation, progression) sont en texte noir sur
  blanc, sans mise en scène.

**Mesure-le** sur chaque page avant de proposer : part approximative de
surface colorée, nombre de couleurs réellement visibles, ce qui attire l'œil
en premier. Donne ces chiffres dans ton compte rendu, avant et après.

## Contraintes NON NÉGOCIABLES (décisions du commanditaire)

1. **Fond de page blanc**, sans exception.
2. **Aucun dégradé**, nulle part : ni `linear-gradient`, ni `radial-gradient`,
   ni `conic-gradient`, ni flou coloré qui s'y apparente. Uniquement des
   **aplats**.
3. **Aucune ombre colorée ni halo sous les boutons** (`--ombre-marque` reste
   `none`).
4. **Pas de `backdrop-filter`**, pas de verre dépoli.
5. Contraste **≥ 4,5:1** pour tout texte, **≥ 3:1** pour les icônes, bordures
   de champ et anneaux de focus, **sur le fond réel** où ils apparaissent.
   Donne le ratio de chaque nouvelle paire de couleurs.
6. **Rien n'est écrit en dur dans un composant** : toute nouvelle couleur
   devient un jeton dans `client/src/index.css` (voir l'en-tête du fichier).
7. **Aucune modification de logique** : ni appel réseau, ni état, ni route,
   ni texte du dictionnaire `i18n.tsx` (sauf ajout de clé, dans les **deux**
   langues). Le serveur n'est pas touché.
8. `prefers-reduced-motion` neutralise toute animation ajoutée.
9. Les polices restent **Bricolage Grotesque** (titres) et **Inter** (texte).
   Aucune bibliothèque CSS ou d'icônes nouvelle.

## Ce qui est attendu : de la couleur en aplats, pas du décor

Pistes à évaluer, à retenir ou à écarter en le justifiant :

- **Une palette d'accent par cours.** 6 couleurs d'aplat, attribuées de
  façon **déterministe** à partir de l'identifiant du cours (même cours,
  même couleur, sur toutes les pages). Utilisée en **bandeau supérieur
  plein** ou en **pastille d'icône** sur la carte, et reprise dans l'en-tête
  de la fiche de cours. Chaque couleur doit tenir le contraste avec le texte
  qu'elle porte (blanc ou encre).
- **Des blocs de couleur assumés** (« color blocking ») : l'en-tête de page
  `TeteDePage` en aplat plein de la marque ou de l'ardoise, plus haut, avec
  le titre en blanc et un grand chiffre clé.
- **Une seconde couleur d'appui** à côté du rouge — par exemple une encre
  très foncée (`--neutre-900`) pour les surfaces sombres et un jaune ou un
  ambre franc pour les mises en avant ponctuelles. Une seule ; justifie-la.
- **Les chiffres mis en scène** : score de quiz et d'examen, progression,
  consommation en grands chiffres sur des tuiles teintées
  (`--succes-fond`, `--info-fond`, `--brand-100`…), avec une jauge en aplat.
- **Les onglets de la fiche de cours** avec un indicateur actif épais et
  coloré, plutôt qu'un simple changement de gris.
- **Les états vides** : illustration SVG en aplats avec la couleur de marque.
- **Le mouvement** : apparition discrète des cartes (≤ 180 ms, opacité et
  translation de 4 px au plus), survol qui soulève la carte (`--ombre-2`).

Règle d'équilibre : **60 % blanc, 30 % neutres, 10 % couleur vive**, et la
couleur vive porte toujours une information (cours, état, action), jamais
de la décoration pure.

## Méthode, dans cet ordre

1. **Audit** : lis `client/src/index.css`, `components/ui.tsx` et les six
   pages de `client/src/pages`. Lance le front (`npm run dev`, port **5174**,
   le serveur sur **3002** doit tourner) et fais une capture de chaque page :
   Mes cours, fiche de cours (onglets Résumé, Quiz, Tuteur, Cartes,
   Progression), Examen blanc, Recherche, Consommation, Connexion.
2. **Proposition** : présente **deux directions** visuelles nommées, chacune
   avec sa palette (valeurs hexadécimales, ratios de contraste) et une
   maquette d'**une** page, Mes cours. **Arrête-toi et attends que je
   choisisse.**
3. **Application**, par lots, page par page, en commençant par les jetons.
   Capture après chaque lot, à **1 280 px** et à **375 px** de large.
4. **Contrôles** à chaque lot :
   - `npm run build` et `npm test` dans `client` passent ;
   - aucune occurrence de `gradient` ni de `backdrop-filter` dans `client/src`
     (`grep -rn "gradient\|backdrop-filter" client/src` ne renvoie rien) ;
   - aucune couleur hexadécimale nouvelle hors de `index.css` ;
   - pas de défilement horizontal à 375 px ;
   - la navigation au clavier montre un anneau de focus visible partout.
5. **Compte rendu** : tableau avant/après par page (captures côte à côte),
   ratios de contraste de chaque nouvelle couleur, liste des fichiers
   modifiés, et ce que tu as écarté et pourquoi.

## Interdits de processus

- **Ne pousse pas** sur `main` sans mon accord : chaque poussée redéploie
  automatiquement le site hébergé sur Render.
- Pas de commit au nom d'une IA, pas de ligne `Co-Authored-By`.
- Pas d'appel au modèle Gemini pour tes captures : utilise les cours et les
  résultats déjà en base, le quota gratuit sert à la démonstration.
- Si une amélioration demande de toucher à la logique ou au serveur, **ne la
  fais pas** : note-la dans le compte rendu comme piste après la soutenance.

## Critère de réussite

Un membre du jury qui découvre l'écran **Mes cours** doit, en trois
secondes, voir de la couleur, distinguer les cours entre eux et savoir où
cliquer — sur un fond resté blanc, sans un seul dégradé.
