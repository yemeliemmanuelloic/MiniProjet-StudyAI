# Gestion des incidents

> Ce que fait l'équipe quand quelque chose tourne mal sur la version en ligne.
> Pensé pour trois personnes et un hébergement gratuit : peu d'étapes, toutes
> faisables depuis un navigateur.

---

## 1. Ce qui compte comme incident

| Gravité | Exemples | Délai visé |
|---|---|---|
| **Critique** | Une clé ou un mot de passe exposé ; des données d'un étudiant visibles par un autre ; le site sert du contenu qui n'est pas le nôtre | Immédiat |
| **Majeure** | Le site est inaccessible ; plus aucun appel au modèle ne passe ; la connexion échoue pour tous | Dans la journée |
| **Mineure** | Une page s'affiche mal ; une fonction secondaire échoue ; un message est faux | Prochaine mise à jour |

## 2. Les premiers gestes

1. **Constater** : reproduire, noter l'heure, faire une capture.
2. **Lire le journal** : Render → service `studyai-api` → *Logs*. Les refus de
   sécurité apparaissent sous `[studyai.securite]`, les erreurs serveur sous
   `[studyai]`.
3. **Vérifier l'état** : `https://<adresse-de-l-api>/api/health` indique si le
   service tourne et si la clé du modèle est présente.
4. **Prévenir l'équipe** dans le groupe, avec ce qui a été constaté.

## 3. Selon le cas

### Une clé ou un secret exposé

1. **Révoquer d'abord**, comprendre ensuite : régénérer la clé chez le
   fournisseur (Google AI Studio pour Gemini, Supabase pour la base).
2. Remplacer la valeur dans Render → *Environment*. Le service redémarre seul.
3. Si le secret est passé par Git, il est **compromis pour toujours** : le
   retirer de l'historique ne suffit pas, seule la révocation protège.
4. Une clé révoquée n'est jamais réutilisée.

### Le site ne répond plus

- **Une trentaine de secondes au premier accès** : ce n'est pas un incident,
  le palier gratuit endort le serveur.
- **Au-delà** : regarder l'état du dernier déploiement dans Render. S'il a
  échoué, revenir à la version précédente (section 4).

### Le modèle ne répond plus

- `LLM_QUOTA_EXCEEDED` : quota du fournisseur épuisé. Attendre le lendemain,
  ou abaisser `MAX_APPELS_MODELE_PAR_JOUR`.
- `RATE_LIMITED` avec « plafond d'analyses pour aujourd'hui » : notre propre
  plafond global (`app/debit.py`). Normal sous forte charge ; le relever si
  le quota du fournisseur le permet.
- `LLM_UNAVAILABLE` : panne du fournisseur. Rien à faire de notre côté.

### Un abus (comptes en série, tentatives de connexion)

Les garde-fous de `app/debit.py` bloquent déjà l'accident et l'abus naïf.
Les refus sont visibles dans le journal `studyai.securite`. Face à un abus
déterminé : abaisser les seuils dans Render → *Environment*, et si besoin
suspendre temporairement le service.

## 4. Revenir à la version précédente

Render garde l'historique des déploiements : service → *Events* → choisir un
déploiement réussi → **Rollback**. Le front et l'API se déploient séparément ;
revenir sur les deux si l'incident touche leur contrat.

Dans Git, ne jamais réécrire l'historique publié : corriger par un nouveau
commit (`git revert`).

## 5. Après l'incident

Une note courte, ajoutée en fin de ce fichier :

- ce qui s'est passé, quand, et ce qui a été touché ;
- la cause ;
- ce qui a été corrigé ;
- ce qui empêche que cela se reproduise — un test, si c'est possible.

Sans recherche de coupable : la question est « qu'est-ce qui l'a permis ? »,
pas « qui l'a fait ? ».

---

## Journal des incidents

*Aucun incident en production à ce jour.*
