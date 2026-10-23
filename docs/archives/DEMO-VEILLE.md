# Pré-chauffage de la démonstration — mardi 20 octobre 2026

> Établi le 18 octobre après la vérification complète (décision GO) décrite
> dans `docs/PROMPT-VERIFICATION-DEMO.md`. Il règle les quatre constats
> **majeurs** de cette vérification, qui tiennent tous à l'**état des données**
> et non au code. Le déroulé minute par minute est dans `docs/ROADMAP.md`.
>
> **Aucun mot de passe et aucune clé dans ce fichier.**

---

## Pourquoi ce pré-chauffage est indispensable

| Constat de la vérification | Conséquence si on ne fait rien |
|---|---|
| Le cours en vedette, *Atelier SGBL*, n'a qu'un résumé de la **version 1** du prompt, **sans un seul accent** (« Ce cours presente… ») | Le jury lit du français sans accents, le défaut même que la v3 a corrigé |
| Aucun cours du compte ne contient de donnée personnelle : la vue de transparence affiche « Aucune donnée personnelle détectée » | Le premier des trois moments clés ne démontre rien |
| Les cartes d'*Atelier 5* viennent en partie de vieux quiz v1, sans accents | Une carte « Quel langage ou format est utilise pour ecrire… » à l'écran |
| Le cours long importé pendant la vérification s'appelle « Chapitre 2 **�** Prompt Engineering » : un tiret mal encodé par l'outil de vérification, pas par l'application | Un caractère cassé sur la carte en vedette |

**Budget du pré-chauffage : 5 appels au modèle**, sur le palier gratuit.

---

## La veille — lundi 19 octobre

### 1. Libérer les ports

```bash
netstat -ano | grep -E ":(3002|5174|3003|5176) " | grep LISTENING
```

La commande ne doit **rien** afficher. Si le port **5174** est tenu, Vite
démarrera sur 5175 et le serveur refusera le navigateur (CORS) : toute
l'application paraîtra cassée alors que le code n'y est pour rien. Fermer le
processus qui le tient, ou redémarrer le poste.

### 2. Démarrer

```bash
cd server && ./.venv/Scripts/python.exe -m uvicorn app.main:application --reload --port 3002
```

```bash
cd client && npm run dev
```

Vérifier que Vite annonce bien **5174**, puis ouvrir `http://localhost:5174`.

### 3. Se connecter avec le vrai mot de passe

Le formulaire de connexion n'a **pas** été vérifié avec le compte de
démonstration : la vérification utilisait un jeton de session. Le faire ici,
et noter le mot de passe ailleurs que dans ce dépôt.

### 4. Remettre les données en état — 5 appels

**a. Atelier SGBL — 1 appel.** Onglet Résumé, niveau *Standard*, « Régénérer ».
Le cache ne connaît que la version 1 : un résumé v3, accentué, sera produit.
Contrôle : la synthèse contient des accents.

**b. Cours « Démo — données personnelles » — 1 appel.** « Ajouter un cours »,
mode *texte collé*, titre `Démo — données personnelles`. Coller le texte
suivant, puis au moins deux cents caractères d'un cours réel en dessous :

```
Support rédigé pour le module — ESPRIT — +216 55 123 456 —
amine.bensalah@exemple.tn — clé de test AKIAIOSFODNN7EXAMPLE.
```

Puis « Résumer mon cours », et ouvrir « Ce qui a été envoyé au modèle » :
`[ETABLISSEMENT_1]`, `[TEL_1]`, `[EMAIL_1]` et le jeton de la clé doivent
apparaître à la place des valeurs.

- **Ne mettez pas de nom de personne.** Les patronymes ne sont pas masqués
  (limite documentée dans le rapport, section 10) : le nom resterait en clair
  à côté des jetons, et le jury le remarquerait avant tout le reste.
- **N'utilisez pas** le fichier de correction de l'atelier 4 : le jeton
  Hugging Face qu'il contient est compromis.
- La clé `AKIAIOSFODNN7EXAMPLE` est l'exemple publié par Amazon dans sa
  documentation : elle n'ouvre rien.

**c. Le cours long — 3 appels.** Supprimer le cours au titre cassé
(« Chapitre 2 � Prompt Engineering ») avec l'icône de corbeille. Puis
« Ajouter un cours », mode *fichier*, `Seance 2/Prompt Engineering.pdf`,
titre `Chapitre 2 — Prompt Engineering`, et « Résumer mon cours ». Attendu :
« Cours long : il a été découpé en 2 parties », environ 8 secondes. Cette
étape vérifie au passage **l'import par l'interface**, qui ne l'a pas été.

**d. Les cartes de SGBL — 0 appel.** Onglet Cartes d'*Atelier SGBL*,
« Fabriquer les cartes ». SGBL a reçu le 18 octobre un quiz en version 3 :
ses cartes sont accentuées. **Montrer les cartes de SGBL, pas celles
d'Atelier 5.**

**e. Contrôles sans appel.** Atelier 5, onglet Tuteur : l'historique contient
une réponse sourcée. Examen blanc : l'historique contient des copies.
Consommation : noter le nombre d'opérations, pour dire le jour J que les
fonctions gratuites ne l'ont pas fait bouger.

### 5. Préparer l'instance sans clé

Elle sert au cas d'erreur `LLM_KEY_MISSING`. Deux processus de plus, lancés
**par variables d'environnement**, sans toucher à `server/.env` :

```bash
cd server && GEMINI_API_KEY="" CLIENT_ORIGIN="http://localhost:5176" ./.venv/Scripts/python.exe -m uvicorn app.main:application --port 3003
```

```bash
cd client && VITE_API_URL="http://localhost:3003/api" npm run dev -- --port 5176 --strictPort
```

Ouvrir `http://localhost:5176`, se connecter, onglet Quiz d'un cours,
« Générer un quiz » : un bandeau rouge doit dire que la clé est absente, sans
plantage. L'arrêter ensuite ; on le relancera une heure avant.

### 6. Les captures de secours

Dans un dossier `demo-captures/` **hors du dépôt** :

1. la vue de transparence du cours de démonstration, jetons visibles ;
2. le bandeau `LLM_KEY_MISSING` de l'instance sans clé ;
3. le tableau de conclusion de `docs/EVALUATION.md` (sections 9 et 10) ;
4. un corrigé de quiz, avec ses ✓, ses ✕ et ses citations.

### 7. Répéter à trois, chronomètre en main

Le déroulé tient en 14 minutes sur le papier. Seule une répétition dit s'il
tient en vrai.

---

## Une heure avant — mardi 20 octobre

1. **Ports** : même commande qu'à l'étape 1, rien ne doit apparaître.
2. **Démarrer** les deux serveurs (étape 2), puis l'instance sans clé
   (étape 5). Le front principal doit être sur **5174**.
3. **Ouvrir deux onglets** : `localhost:5174` connecté, et `localhost:5176`
   connecté, sur l'onglet Quiz.
4. **Réseau** : la page doit afficher les titres dans leur police épaisse
   (Bricolage Grotesque). Si elle retombe sur une police système, le réseau
   est lent ou absent : le modèle sera indisponible lui aussi. Basculer sur
   les captures pour les étapes qui appellent le modèle.
5. **Repasser rapidement** sur les trois moments clés : la transparence, le
   refus du tuteur, le cours long. Tous trois s'affichent depuis le cache,
   sans appel.
6. **Fermer** toute autre application qui pourrait lancer un serveur Node.

## Si le fournisseur tombe pendant la démonstration

Le palier gratuit de Gemini renvoie parfois « service indisponible » aux
heures chargées. L'interface l'affiche proprement, et c'est en soi une
démonstration de la gestion d'erreurs demandée par l'énoncé. Le dire en une
phrase, et passer à l'étape suivante : seules deux étapes du déroulé
appellent le modèle en direct, le quiz et la question au tuteur.
