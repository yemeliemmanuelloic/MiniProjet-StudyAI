# Audit qualité du front — 20 octobre 2026 (lot H)

Ce document consigne ce qui a été mesuré, ce que les mesures ont révélé, et
ce qui a été corrigé. Les chiffres viennent d'outils, pas d'une relecture.

## 1. Tests de bout en bout (Playwright)

`npm run e2e` dans `client/`. Le vrai front tourne dans Chrome, face à une
**API simulée** (`client/e2e/api-factice.ts`) : aucun appel à Supabase ni à
Gemini, donc aucun coût, aucune donnée écrite, des résultats reproductibles.
Chaque test passe deux fois : bureau (1280 × 800) et mobile (390 × 844).

| Fichier | Ce qu'il vérifie |
|---|---|
| `parcours.spec.ts` | Inscription (case des conditions, bienvenue) ; page réservée → « connexion requise » → retour à la page demandée ; mauvais mot de passe ; ajout et suppression d'un cours avec confirmation (Annuler / Confirmer) ; résumé puis quiz ; erreur `LLM_KEY_MISSING` en 503 ; serveur hors service puis reprise ; page introuvable ; menu mobile |
| `accessibilite.spec.ts` | Audit axe-core (WCAG 2.1 A et AA) sur 10 pages publiques et 4 pages connectées |
| `liens.spec.ts` | Exploration de tous les liens internes depuis l'accueil : aucun ne mène à « Page introuvable » |

**Résultat : 46 tests passent, 2 ignorés à dessein** (menu burger sur bureau,
exploration des liens en double sur mobile).

Les tests de bout en bout ne tournent **pas** en intégration continue :
l'équipe a choisi de ne rien changer à la chaîne de déploiement pour
l'instant. Ils se lancent en local, avec le Chrome déjà installé.

## 2. Défauts trouvés par l'audit, et corrigés

| Défaut | Trouvé par | Correction |
|---|---|---|
| **Les erreurs du modèle s'affichaient « service indisponible »** : l'API répond 502/503/504 pour `LLM_*`, et le client du lot F prenait ces statuts pour une panne de l'hébergeur. Les quatre messages `LLM_*` de l'énoncé disparaissaient. | Relecture du serveur en écrivant la fausse API | Seul un corps qui n'est pas notre enveloppe `{error:{code}}` vaut panne (`client/src/lib/api.ts`). 7 tests unitaires, dont 4 échouent sur l'ancien code. |
| Liens dans une phrase distingués par la seule couleur (WCAG 1.4.1) | axe : `link-in-text-block`, 4 pages | Soulignés dans le texte courant |
| Tableau défilant inaccessible au clavier sur mobile | axe : `scrollable-region-focusable` | `tabIndex`, rôle `region`, nom, anneau de focus |
| Le pied de page sautait au chargement (CLS 0,65 sur l'accueil) | Lighthouse | Pas de squelette sans jeton ; squelette à pleine hauteur |
| Feuille Google Fonts bloquant l'affichage (~0,9 s) | Lighthouse | Chargement non bloquant (`media="print"` puis `all`) |
| Tout le code chargé dès l'accueil | Lighthouse : JavaScript inutilisé | Pages connectées chargées à la demande (`React.lazy`) |

## 3. Lighthouse

Mesuré le 20 octobre, Lighthouse 12.6.0, profil mobile simulé (4G lente,
processeur ralenti), sur le build de production servi en local. Pour
mesurer le SEO tel qu'il sera une fois le site ouvert, ce build d'audit a été
construit avec `VITE_INDEXATION=1`.

| Page | Performance | Accessibilité | Bonnes pratiques | SEO |
|---|---|---|---|---|
| Accueil — avant | 73 | 100 | 82 | 66* |
| Accueil — après | 73–74 | 100 | 82 | 100 |
| Connexion — avant | 76 | 100 | 82 | 63* |
| Connexion — après | 83–87 | 100 | 82 | 100 |
| FAQ — avant | 78 | 100 | 82 | 63* |
| FAQ — après | 77–89 | 100 | 82 | 100 |

\* « avant » : build fermé (`noindex`), d'où le SEO bas — c'est voulu.

Premier affichage : 3,7 s → 2,6 s (connexion, FAQ). Décalage de mise en page
de l'accueil : 0 (0,65 au pire pendant les essais).

### Limites de la mesure — à lire avant de citer un chiffre

- **L'antivirus de la machine de mesure (Kaspersky) injecte un script de
  174 Ko** dans toute page servie en HTTP. Lighthouse le compte comme
  ressource bloquante (~1,8 s) et comme « requêtes non sécurisées ». Il pèse
  sur la performance et explique, avec le HTTP local, les 82 en bonnes
  pratiques. Un visiteur du site en ligne (HTTPS) n'est pas concerné.
- D'un passage à l'autre, la performance varie d'environ ±5 points : les
  fourchettes ci-dessus le reflètent.
- Une mesure sur le site en ligne reste à faire après le prochain
  déploiement (voir lot I).

## 4. En-têtes HTTP du front (`render.yaml`)

Ajoutés le 20 octobre, effectifs au prochain déploiement seulement :
cache d'un an pour `/assets/*` (noms hachés), revalidation de `index.html`,
`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`. Pas de
`Content-Security-Policy` : mal réglée, elle casserait le site.

**À vérifier après déploiement** : que les pages servies par la règle de
réécriture (`/cours`, `/faq`…) reçoivent bien un en-tête de revalidation ;
la règle `index.html` ne s'applique peut-être qu'à l'adresse `/index.html`.
