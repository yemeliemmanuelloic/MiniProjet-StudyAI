# Prompt — vérification avant démonstration (GO / NO-GO)

> Rédigé le 18 octobre 2026, à la demande du commanditaire : **aucun déroulé de
> démonstration ni liste de pré-chauffage ne doit être écrit tant qu'une
> vérification complète n'a pas établi que le code est prêt.** Ce prompt est
> fait pour être lancé tel quel dans une session d'agent de codage.

---

## Rôle et objectif

Tu es chargé de la **vérification de mise en démonstration** de StudyAI, avant
une soutenance de 15 minutes en direct, prévue entre le 19 et le 23 octobre
2026. Date exacte : **mardi 20 octobre 2026** — la veille est donc le lundi 19.

Ton travail produit **une décision, GO ou NO-GO, appuyée sur des preuves**.
Seulement si la décision est GO, tu rédiges ensuite deux livrables : le
déroulé de la démonstration et la liste de pré-chauffage. **Si c'est NO-GO, tu
t'arrêtes après le rapport de vérification**, tu proposes les corrections et tu
attends l'accord explicite avant d'en appliquer une seule.

Tu n'es pas là pour rassurer. Une vérification qui conclut GO sur des
suppositions est pire qu'aucune vérification : elle donne confiance la veille
de la soutenance.

---

## Avant toute chose

1. Lis `docs/AGENTS.md` en entier. Ses règles s'appliquent ici sans exception.
2. Lis `docs/ROADMAP.md` (sections « Déroulé de la soutenance » et
   « Risques »), `docs/DECISIONS.md` 025 à 028, `docs/EVALUATION.md` section 9.
3. Lis l'énoncé : `../Mini-Projet IA SE 2026 2027 WEB.pdf`, pages 5 et 6.

## Interdits absolus

- **Ne modifie aucun fichier de code** pendant la vérification. Tu constates,
  tu ne corriges pas.
- **Ne lance aucune migration** et ne modifie pas `server/.env`. Si une
  vérification exige une autre configuration, passe par une variable
  d'environnement au lancement du processus, jamais par le fichier.
- **N'écris rien dans la base Supabase** en dehors de l'usage normal de
  l'application par l'interface (générer un quiz, rendre une copie…). Aucune
  suppression, aucun script SQL.
- **Ne pousse rien** et ne crée aucun commit sans accord explicite.
- **N'affiche jamais une clé d'API**, ni dans une commande, ni dans un rapport.
  Pour vérifier qu'une clé existe, teste sa présence, pas sa valeur.
- Le jeton Hugging Face présent dans `Seance 4/Correction (code) de
  l'atelier 4.py` est compromis : ne le réutilise sous aucune forme.
- **Budget d'appels réels au modèle : 6 au maximum** pour toute la
  vérification. Relève le compteur de la page Consommation (`GET /api/usage`)
  avant de commencer et à la fin, et rapporte l'écart. Un appel n'est
  justifié que s'il vérifie quelque chose que rien d'autre ne peut vérifier.

---

## Leçons de cette semaine — à appliquer, pas à relire

Chacune a coûté du temps une fois. Ne les rejoue pas.

1. **Un serveur qui tourne n'exécute pas forcément le code actuel.** Un
   serveur lancé sans rechargement a servi l'ancienne version pendant toute
   une vérification. Arrête tout, et repars de serveurs démarrés à froid.
2. **Si le port 5174 est occupé, Vite démarre sur 5175, et le serveur refuse
   le navigateur** (l'origine autorisée est 5174). Toute l'application paraît
   cassée, alors que le code n'y est pour rien. Vérifie le port réellement
   attribué.
3. **La console d'un onglet garde les erreurs d'avant un rechargement à
   chaud.** Une pile d'erreurs `useI18n` s'est révélée être un artefact. Lis
   les erreurs dans un onglet neuf.
4. **Un test vert du premier coup est suspect.** Si tu conclus qu'une
   protection est couverte, dis comment tu le sais.
5. **Un chiffre automatique n'est pas une vérité.** Si une métrique ou un
   contrôle rejette quelque chose, va lire ce qu'il rejette avant d'accuser
   le code ou le modèle.
6. **Le palier gratuit de Gemini renvoie des 503** (« forte demande ») et
   limite le nombre d'appels par minute. Un échec d'appel isolé n'est pas un
   défaut du code ; un échec que l'interface affiche mal en est un.

---

## Phase 0 — État des lieux (aucun appel au modèle)

Relève et rapporte, avec la commande et sa sortie :

- l'état Git : arbre propre, branche alignée sur `origin/main`, dernier commit ;
- la présence (pas la valeur) de `GEMINI_API_KEY`, `DATABASE_URL`,
  `JWT_SECRET` dans `server/.env`, et la valeur de `CLIENT_ORIGIN`,
  `LLM_PROVIDER`, `LLM_MODEL` ;
- la révision de migration de la base (`alembic current`, en lecture seule)
  comparée à la dernière migration du dépôt ;
- les ports 3002 et 5174 : libres, ou tenus par quel processus.

## Phase 1 — Vérifications automatiques

Lance et rapporte le résultat exact :

```bash
cd server && .venv/Scripts/python.exe -m pytest tests -q
cd client && npx tsc --noEmit && npm run test -- --run && npm run build
```

Tout échec ici est **bloquant**.

## Phase 2 — Démarrage à froid

Démarre les deux serveurs depuis `.claude/launch.json`, dans un état où aucun
autre processus ne tient les ports. Vérifie et prouve :

- `GET /api/health` répond, avec le fournisseur et le modèle attendus ;
- le front est servi sur **5174**, et une requête du navigateur vers l'API
  n'est pas refusée par CORS ;
- les deux polices sont réellement chargées (comparaison de largeurs rendues,
  pas `document.fonts.check`, qui répond vrai pour n'importe quel nom) ;
- un onglet neuf n'affiche **aucune erreur** dans la console.

## Phase 3 — Parcours de démonstration, sur les données réelles

Avec le compte de démonstration, dans le navigateur, à 1 100 px de large.
Pour chaque étape : ce que tu as fait, ce que tu attendais, ce que tu as
observé, et la preuve (valeur mesurée, réponse réseau, capture).

| # | Étape | Attendu |
|---|---|---|
| 1 | Connexion, liste des cours | grille, cours le plus récent en vedette |
| 2 | Résumé d'un cours déjà résumé | servi **depuis le cache** : aucun appel en plus au compteur |
| 3 | « Ce qui a été envoyé au modèle » | jetons de masquage visibles, aucune donnée en clair |
| 4 | Quiz : générer, répondre faux exprès, valider | 1 appel ; corrigé avec ✓ / ✕ et citation du cours |
| 5 | Tuteur : une question couverte, une hors cours | réponse sourcée, puis « Hors du cours » |
| 6 | Cartes : fabriquer, retourner, noter au clavier | **0 appel** ; compteurs mis à jour ; idempotent au second clic |
| 7 | Examen blanc : composer, rendre, corrigé | **0 appel** ; score dans la tête ; compte à rebours visible sous l'en-tête |
| 8 | Recherche dans tous les cours | résultat surligné, **0 appel** |
| 9 | Page Consommation | montant dans la tête ; « — » pour ce qui n'est pas mesuré |
| 10 | Bascule FR → EN → FR | aucune chaîne restée en français, aucune clé brute affichée |
| 11 | Les six écrans à **375 px** | aucun débordement horizontal (mesure, pas impression) |
| 12 | Cas d'erreur `LLM_KEY_MISSING` | sur une **seconde instance** du serveur, lancée avec `GEMINI_API_KEY` vidée par variable d'environnement — jamais en modifiant `.env` — l'interface affiche un message propre, pas un plantage |
| 13 | Cours long (plusieurs segments) | le résumé signale le découpage ; mesure le temps d'attente réel |

Si une étape échoue à cause d'un 503 ou d'un quota, refais-la **une fois**
après une minute. Distingue dans le rapport ce qui relève du fournisseur et ce
qui relève du code.

## Phase 4 — Risques propres au jour J

Pour chacun, dis s'il est couvert, comment, et ce qu'il faut préparer :

- Gemini en 503 ou en quota pendant la démo ;
- réseau absent ou lent (polices, API du modèle, base Supabase distante) ;
- cours long qui bloque l'écran une vingtaine de secondes ;
- session expirée en pleine démo ;
- un membre du groupe qui démarre la démo sur un autre poste.

---

## Décision

**Classe chaque constat** :

- **Bloquant** — une étape du parcours échoue par la faute du code, ou une
  vérification de la phase 1 échoue ;
- **Majeur** — l'étape passe, mais d'une façon qu'un jury remarquerait
  (lenteur non signalée, message brut, défaut visible à l'écran) ;
- **Mineur** — tout le reste.

**GO** seulement si : aucun bloquant, les 13 étapes passent ou n'échouent
que par la faute du fournisseur avec un affichage propre, et toutes les
vérifications automatiques sont vertes. Sinon **NO-GO**.

Rapport attendu, dans cet ordre : la décision en une ligne ; le tableau des
constats (gravité, étape, preuve) ; le compteur d'appels avant et après ; ce
que tu n'as **pas** pu vérifier, et pourquoi.

---

## Seulement si GO — les deux livrables

### Livrable 1 — Déroulé de la démonstration

Remplace la section « Déroulé de la soutenance — 15 minutes » de
`docs/ROADMAP.md`.

- 15 minutes, dont **au moins une minute de marge** : le total prévu ne
  dépasse pas 14 minutes.
- Trois intervenants — Emmanuel, Rayen, Khalil — avec une répartition
  équilibrée, puisque la note peut être pondérée par la contribution.
- Garder les trois moments qui distinguent le projet : la vue de
  transparence, le refus du tuteur hors cours, le cours long sans troncature.
- Ajouter l'argument que la première version ne montrait pas : **quatre
  fonctions à zéro appel** (examen blanc, cartes, recherche, consommation).
- Pour chaque étape : minute, intervenant, action à l'écran, **la phrase à
  dire** (une seule), et le **plan B** si elle échoue.
- Ne promettre à l'écran que ce que la phase 3 a effectivement vérifié.

### Livrable 2 — Liste de pré-chauffage

Nouveau fichier `docs/DEMO-VEILLE.md`, en deux parties : **la veille** et
**une heure avant**.

- Les commandes exactes de démarrage, et la vérification du port 5174.
- L'état des données à préparer : quels résumés mettre en cache, quel quiz,
  quelles cartes, quel historique d'examens, pour que la démonstration ne
  dépende d'**aucun appel lent** sauf celui qu'on choisit de montrer.
- Les captures de secours à réaliser, et où les ranger.
- **Aucun mot de passe ni aucune clé dans le fichier.**

Les deux livrables restent **non commités** jusqu'à l'accord du commanditaire.
