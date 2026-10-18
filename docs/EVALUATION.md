# Évaluation des modules IA — banc d'essai

> **Acquis d'apprentissage AA5** : évaluer la qualité d'une solution assistée
> par IA.
>
> Mesures du **13 octobre 2026** · modèle `gemini-3.5-flash-lite` ·
> prompts **v3** · corpus `2026-10-13` · **56 appels** au modèle.
>
> Reproductible : `python -m banc.executer --module tout`

---

## 1. Ce qui est mesuré, et pourquoi

La suite de 100 tests prouve que le code fonctionne. Elle ne dit rien de la
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

**26 questions de référence** : 11 auxquelles le cours répond, 8 franchement
hors sujet, et **7 proches du domaine mais absentes du support** — le cas
difficile, celui où le modèle est tenté de compléter avec ses connaissances
générales. « Combien coûte un abonnement à GitHub Copilot ? » sur l'atelier
testing ; « Comment régler la température d'un modèle ? » sur le cours de
prompt engineering.

Chaque question couverte porte un **témoin** — un mot qui doit réellement
figurer dans le support. Chaque question hors sujet porte un **contre-témoin**
— un mot qui doit en être absent. Le banc d'essai vérifie les deux au
chargement et refuse de démarrer sinon : sans le second, rien ne garantirait
qu'une question « hors sujet » le soit vraiment, et un refus légitime serait
compté comme une erreur. Ce garde-fou vient d'une erreur commise la veille : le tuteur avait
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
| Refus sur les 8 questions franchement éloignées | **8 / 8 = 100 %** |
| **Refus sur les 7 questions proches mais non couvertes** | **7 / 7 = 100 %** |
| Sources citées en moyenne, par réponse ancrée | 1,0 à 2,7 |

**Le second chiffre de refus est le seul qui vaille vraiment.** Refuser « quel
est le PIB de la Tunisie ? » sur un cours de testing ne prouve rien : aucun
modèle ne s'y tromperait. Refuser « combien coûte un abonnement à GitHub
Copilot ? » sur ce même cours est autrement plus exigeant — la question est
plausible, le modèle connaît la réponse, et le support n'en parle pas. Il
refuse quand même, 7 fois sur 7.

Une réserve subsiste : les quatre supports relèvent du même domaine. Un corpus
plus varié éprouverait mieux l'ancrage.

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

## 9. Un second modèle : gemini-3.5-flash — 17 octobre

La question posée était celle du **routage par tâche** : vaut-il la peine de
confier le quiz ou le tuteur à un modèle plus grand ? On a donc opposé
`gemini-3.5-flash-lite`, mesuré le 13 octobre, à son grand frère de la même
génération, `gemini-3.5-flash`, sur le même corpus et avec les mêmes prompts.
Même famille, même palier gratuit : seule la taille du modèle change.

### Ce qui a été mesuré

Les deux résumés obtenus, sur des entrées strictement identiques — mêmes
jetons d'entrée au jeton près, ce qui confirme que seul le modèle diffère :

| Support | Modèle | Latence | Points clés | Jetons sortie |
|---|---|---|---|---|
| Atelier 5 | flash-lite | **2,7 s** | 8 | 373 |
|  | flash | 12,2 s | 6 | 422 |
| Atelier 1 | flash-lite | **2,6 s** | 7 | 426 |
|  | flash | 11,0 s | 5 | 415 |

Le grand modèle est **4 à 4,5 fois plus lent**. Il produit moins de points
clés, ce qui **ne dit rien de leur qualité** : il peut être plus sélectif, ou
avoir omis une notion. Le banc compte les points, il ne les lit pas.

### La fiabilité, qui tranche

Deux passages, huit opérations tentées sur le grand modèle :

| Issue | Opérations |
|---|---|
| Réussie | **2** |
| Service indisponible (503, forte demande), malgré deux reprises | 4 |
| Quota par minute atteint, même avec 15 s de pause entre deux appels | 2 |

Pour comparaison, flash-lite avait passé **20 mesures sur 20** sans échec.

Le quota atteint était bien une limite **par minute** et non par jour :
une requête de contrôle, quelques minutes plus tard, est passée. Les reprises
automatiques sur 503 consomment ce même quota, ce qui accélère l'arrêt.

### Ce qui n'a pas pu être mesuré

L'ancrage du quiz et la justesse du refus du tuteur sur le grand modèle — les
deux métriques qui comptaient le plus pour la question posée. Le banc s'est
arrêté avant.

### Ce que nous en concluons

**Sur le palier gratuit, flash-lite est le seul choix viable pour les trois
tâches.** L'idée d'un routage vers un modèle plus grand n'est pas appuyée par
les données, et celles qui existent vont contre : un tuteur qui met douze
secondes à répondre, ou qui tombe une fois sur deux pendant une
démonstration, coûte plus qu'une réponse un peu moins fine.

La conclusion est **partielle et nous la laissons partielle**. Une campagne en
heure creuse, avec une minute de pause, irait peut-être au bout. Elle
mesurerait alors la qualité ; elle ne changerait pas la fiabilité observée.

### Deux défauts du banc, trouvés en lançant cette comparaison

La conclusion de ce chapitre affirmait jusqu'ici qu'une comparaison « ne
demanderait qu'une exécution supplémentaire ». **C'était faux, deux fois.**

1. **La reprise ignorait le modèle.** Elle filtrait sur la tâche, le corpus et
   la version de prompt. Un second modèle aurait été entièrement ignoré —
   « déjà mesuré » — sans qu'aucune mesure n'existe pour lui.
2. **La reprise comptait un échec comme une mesure.** Un support tombé sur un
   503 passager aurait été ignoré à chaque relance, définitivement.

Les deux sont corrigés. Le second n'aurait pas été vu sans le premier passage
réel : c'est lui qui a produit les échecs.

---

## 10. Conclusion

**Ce que le banc d'essai établit.**

1. Les prompts tiennent : **100 %** de conformité au schéma sur 30 appels, sans
   une seule relance. Décrire la sortie en toutes lettres fonctionne.
2. L'anonymisation masque **tout ce qui a une forme reconnaissable**, et rien
   d'autre. La limite sur les patronymes est désormais chiffrée.
3. Le quiz **n'invente pas ses citations** : 100 % d'ancrage réel.
4. Le tuteur **refuse correctement**, y compris sur les 7 questions proches
   du domaine mais absentes du support — le cas difficile. Et il répond 11
   fois sur 11 quand le cours le permet.
5. Le découpage coûte ce qu'il promet : trois appels au lieu d'un dès deux
   segments.

**Ce qu'il n'établit pas.**

- La **pertinence pédagogique** des résumés et des questions. Aucune métrique
  automatique ne la mesure ; il faudrait un jugement humain sur un échantillon,
  avec une grille et plusieurs correcteurs.
- La **qualité comparée de deux modèles**. Le second modèle de la même
  famille n'a pu être mesuré que sur deux résumés avant que le palier gratuit
  ne l'arrête (section 9) ; un modèle d'un autre fournisseur ne l'a pas été du
  tout, l'API d'Anthropic n'ayant pas de palier gratuit.

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

# un autre modele, sans toucher a .env : la variable d'environnement prime
LLM_MODEL=gemini-3.5-flash python -m banc.executer --module tout --pause 15
```

Chaque résultat est enregistré dans la table `benchmark_runs` dès qu'il est
obtenu : si le quota s'épuise en cours de route, ce qui a été mesuré est
conservé et une relance reprend où elle s'était arrêtée. La reprise est
propre à chaque modèle, et un échec n'y compte pas comme une mesure : il reste
enregistré, mais le support sera refait à la relance suivante.

Le corpus et les questions de référence sont dans `server/banc/corpus.py`.
