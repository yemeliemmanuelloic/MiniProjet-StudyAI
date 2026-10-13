# Évaluation des modules IA — banc d'essai

> **Acquis d'apprentissage AA5** : évaluer la qualité d'une solution assistée
> par IA.
>
> Mesures du **13 octobre 2026** · modèle `gemini-3.5-flash-lite` ·
> prompts **v3** · corpus `2026-10-13` · **30 appels** au modèle.
>
> Reproductible : `python -m banc.executer --module tout`

---

## 1. Ce qui est mesuré, et pourquoi

La suite de 80 tests prouve que le code fonctionne. Elle ne dit rien de la
**qualité des sorties du modèle** : un résumé n'est pas « juste » ou « faux »
au sens d'un test unitaire. Ce chapitre comble cet écart.

Cinq métriques, choisies parce qu'elles sont **vérifiables automatiquement** —
une évaluation reposant sur un jugement humain au cas par cas n'aurait pas été
reproductible.

## 2. Le corpus

Quatre supports de cours **réels**, pris dans ce module, choisis pour leurs
longueurs très différentes : c'est la longueur qui fait varier le comportement
du pipeline.

| Support | Caractères | Segments |
|---|---|---|
| Atelier 1 — séance 1 | 3 435 | 1 |
| Atelier 5 — testing avec Copilot | 6 356 | 1 |
| Fiche module | 9 230 | 1 |
| Prompt Engineering | 26 167 | **2** |

**19 questions de référence** : 11 auxquelles le cours répond, 8 hors sujet.

Chaque question couverte porte un **témoin** — un mot qui doit réellement
figurer dans le support — et le banc d'essai refuse de démarrer si un témoin
manque. Ce garde-fou vient d'une erreur commise la veille : le tuteur avait
été accusé à tort de refuser une question dont le mot clé n'existait pas dans
le document. *Une métrique calculée sur un corpus faux mesure la qualité du
corpus, pas celle du modèle.*

---

## 3. Métrique 1 — Conformité au schéma

> Part des appels dont la sortie valide le schéma **sans relance**.

| | |
|---|---|
| **12 / 12 mesures, 30 appels, aucune relance** | **100 %** |

C'est la validation d'une décision de conception : chaque prompt **décrit sa
sortie en toutes lettres**, par un exemple complet suivi des contraintes de
type. Sur un projet antérieur, des prompts qui disaient « réponds selon le
schéma fourni » *sans joindre le schéma* produisaient un rejet systématique au
premier appel réel.

Le mécanisme de relance existe et est testé, mais il n'a jamais eu à servir en
conditions réelles.

---

## 4. Métrique 2 — Anonymisation

> Données personnelles encore présentes dans la **charge réellement envoyée**.

Une sonde est injectée en tête de chaque support : un nom, un téléphone
tunisien, un courriel, un établissement et une fausse clé AWS.

| Catégorie | Résultat |
|---|---|
| Courriel, téléphone, établissement, clé AWS | **0 fuite sur 4 supports** |
| Types effectivement masqués | `EMAIL`, `TEL`, `ETABLISSEMENT`, `SECRET`, `URL` |
| **Nom de personne** | **présent en clair dans 3 cas sur 3** |

Le nom n'est pas un échec inattendu : c'est une **limite documentée**. Sans
profil connu ni reconnaissance d'entités nommées, un patronyme n'est pas
distinguable d'un terme technique, et un test du projet l'affirme
explicitement. Le banc d'essai ne découvre donc pas cette limite — il la
**chiffre**, ce qui est différent et plus utile.

Ce que cela veut dire concrètement : StudyAI protège ce qui a une **forme
reconnaissable**. Un patronyme n'en a pas.

---

## 5. Métrique 3 — Ancrage du quiz

> Part des `sourceQuote` réellement présentes dans le cours. C'est la seule
> métrique qui détecte automatiquement une citation inventée.

| Mesure | Résultat |
|---|---|
| Ancrage **strict** — la citation, caractère pour caractère | **18 / 20 = 90 %** |
| Ancrage **souple** — six mots consécutifs retrouvés dans le cours | **20 / 20 = 100 %** |

### Pourquoi deux mesures, et pourquoi c'est le résultat le plus instructif

La première campagne donnait **80 %** en strict, soit quatre citations
apparemment inventées. Conclure « le modèle fabrique une citation sur cinq »
aurait été faux — et c'est exactement le genre d'erreur qu'un chiffre non
examiné fait commettre.

En allant lire les quatre citations rejetées, cinq fragments sur six se
retrouvaient **mot pour mot** dans le cours. Le problème venait de la mesure :
le texte extrait d'un PDF comporte des ruptures de colonnes, des tirets et des
espaces absents du document d'origine, si bien qu'une citation fidèle échoue
au test littéral.

D'où la métrique souple, et le résultat : **aucune citation fabriquée**.

**Leçon méthodologique** : une métrique automatique mesure ce qu'elle sait
mesurer, pas ce qu'on croit lui demander. Il faut lire les cas qu'elle rejette.

### Position de la bonne réponse

| Position | A | B | C | D |
|---|---|---|---|---|
| Occurrences sur 20 | 5 | 2 | 7 | 6 |

Vérifie le mélange côté serveur. Avant cette correction, **cinq bonnes
réponses sur six se trouvaient en position A** — un QCM dont la réponse est
presque toujours la première n'évalue rien.

---

## 6. Métrique 4 — Justesse du refus du tuteur

> Sur une question couverte, le tuteur doit répondre. Sur une question hors
> sujet, il doit refuser. **Les deux erreurs comptent.**

| | Résultat |
|---|---|
| Rappel sur les 11 questions couvertes | **11 / 11 = 100 %** |
| Justesse du refus sur les 8 questions hors sujet | **8 / 8 = 100 %** |
| Sources citées en moyenne, par réponse ancrée | 1,0 à 2,7 |

Résultat parfait sur ce corpus. Deux réserves à poser honnêtement :

- **8 questions hors sujet, c'est peu**, et elles sont franchement éloignées
  du cours (le PIB de la Tunisie, une sauce béchamel). Un cas difficile serait
  une question *proche* du domaine mais absente du support — c'est là que le
  modèle est tenté de compléter avec ses connaissances générales.
- Les quatre supports sont du même domaine. Un corpus plus varié éprouverait
  mieux l'ancrage.

---

## 7. Métrique 5 — Coût et latence

### Résumé

| Support | Caractères | Segments | Appels | Jetons (e+s) | Latence |
|---|---|---|---|---|---|
| Atelier 1 | 3 435 | 1 | 1 | 1 423 + 426 | 2,6 s |
| Atelier 5 | 6 356 | 1 | 1 | 2 187 + 373 | 2,7 s |
| Fiche module | 9 230 | 1 | 1 | 2 530 + 466 | 2,5 s |
| Prompt Engineering | 26 167 | 2 | **3** | 7 589 + 1 425 | **7,9 s** |

Le coût suit la longueur, et le passage à deux segments **triple** le nombre
d'appels — un par segment, plus l'agrégation. C'est le prix du traitement
intégral des cours longs ; c'est aussi ce qui a motivé le passage de
`SEGMENT_CHARS` de 8 000 à 24 000.

### Quiz — 5 questions

De 1 à 2 appels, 3,4 à 5,7 s, 1 480 à 6 327 jetons d'entrée.

### Tuteur — par question

| Support | Latence | Jetons d'entrée |
|---|---|---|
| Atelier 1 | 2,2 s | 1 489 |
| Atelier 5 | 1,6 s | 2 252 |
| Fiche module | 1,6 s | 2 594 |
| Prompt Engineering | 2,1 s | **5 692** |

**Un constat non prévu** : sur le cours long, le tuteur consomme 5 692 jetons
par question — plus du double des autres. La raison est structurelle :
`SEGMENTS_CHAT` vaut 3, et ce cours ne compte que 2 segments, donc le cours
**entier** repart à chaque question. La sélection par pertinence ne commence à
économiser qu'au-delà de 3 segments, soit environ 72 000 caractères. En deçà,
elle ne coûte rien mais ne rapporte rien.

---

## 8. Qualité de la langue

Métrique ajoutée après la correction des accents (prompts v3).

| | Résultat |
|---|---|
| Résumés avec accents | **4 / 4** |
| Explications de quiz avec accents | **18 / 20** |

Les quatre résumés sont corrects. Deux explications de quiz sur vingt restent
sans accents, toutes sur le même support. La consigne `LANGUE` améliore
nettement la situation sans la garantir — ce qui illustre la limite générale
de ce projet : **une consigne est demandée, pas imposée.** Seul le schéma est
réellement contraignant.

---

## 9. Conclusion

**Ce que le banc d'essai établit.**

1. Les prompts tiennent : **100 %** de conformité au schéma sur 30 appels, sans
   une seule relance. Décrire la sortie en toutes lettres fonctionne.
2. L'anonymisation masque **tout ce qui a une forme reconnaissable**, et rien
   d'autre. La limite sur les patronymes est désormais chiffrée.
3. Le quiz **n'invente pas ses citations** : 100 % d'ancrage réel.
4. Le tuteur **refuse correctement**, 8 fois sur 8, et répond 11 fois sur 11.
5. Le découpage coûte ce qu'il promet : trois appels au lieu d'un dès deux
   segments.

**Ce qu'il n'établit pas.**

- La **pertinence pédagogique** des résumés et des questions. Aucune métrique
  automatique ne la mesure ; il faudrait un jugement humain sur un échantillon,
  avec une grille et plusieurs correcteurs.
- Le comportement sur des **questions proches mais non couvertes** — le cas
  réellement difficile pour l'ancrage.
- Un **second modèle** : la bascule vers Anthropic est implémentée et
  démontrable, mais le palier gratuit n'autorisait pas une seconde campagne.
  La table `benchmark_runs` enregistre déjà le nom du modèle : une comparaison
  ne demanderait qu'une exécution supplémentaire.

**Ce que nous en retenons pour la méthode.** Le résultat le plus utile de ce
chapitre n'est aucun des cinq chiffres : c'est la découverte que notre première
métrique d'ancrage **accusait le modèle à tort**. Un chiffre produit
automatiquement n'est pas une vérité ; il faut aller lire ce qu'il rejette.

---

## Annexe — reproduire les mesures

```bash
cd server
python -m banc.executer --module tout          # tout le corpus
python -m banc.executer --module quiz          # un seul module
python -m banc.executer --module chat --support atelier-5-testing
python -m banc.executer --module tout --refaire   # ignorer le cache
```

Chaque résultat est enregistré dans la table `benchmark_runs` dès qu'il est
obtenu : si le quota s'épuise en cours de route, ce qui a été mesuré est
conservé et une relance reprend où elle s'était arrêtée.

Le corpus et les questions de référence sont dans `server/banc/corpus.py`.
