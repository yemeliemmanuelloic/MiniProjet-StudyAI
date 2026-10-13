# Dépannage — outils en ligne de commande sous Windows

Problèmes rencontrés pendant le projet et leur solution. À lire avant de perdre une heure dessus.

---

## 1. `could not prompt: Fonction incorrecte.`

**Symptôme.** Une commande interactive affiche son menu dans Git Bash puis s'interrompt aussitôt.

```
$ gh auth login
? Where do you use GitHub?  [Use arrows to move, type to filter]
> GitHub.com
  Other
could not prompt: Fonction incorrecte.
```

**Cause.** Git Bash repose sur MSYS2, qui émule un pseudo-terminal POSIX. Les binaires **Windows natifs** — `gh.exe`, `vercel`, `npm login`, `prisma init` — attendent une vraie console Windows pour lire les touches. L'émulation suffit à afficher, pas à lire. Le message est la traduction française de « Incorrect function », remontée par l'API Windows.

**Solutions, de la plus simple à la plus générale.**

Préfixer par `winpty`, qui fait le pont entre les deux mondes et est fourni avec Git for Windows :

```bash
winpty gh auth login
```

Ou lancer la commande depuis **PowerShell**, qui est une vraie console :

```powershell
gh auth login
```

Ou éviter l'interaction, quand l'outil le permet — c'est l'option à privilégier dans un script :

```bash
gh auth login --with-token < jeton.txt && rm jeton.txt
```

**Règle à retenir.** Git Bash pour les scripts et les commandes non interactives ; PowerShell ou `winpty` dès qu'un outil pose une question. Les commandes concernées dans ce projet : `gh auth login`, `vercel login`, `railway login`, `npm login`, `prisma init`, `docker login`.

---

## 2. `refusing to allow an OAuth App to create or update workflow .github/workflows/ci.yml`

**Symptôme.** Le `git push` est rejeté en bloc dès qu'un commit touche un fichier de `.github/workflows/`.

**Cause.** Un jeton capable d'écrire dans ce dossier peut faire exécuter du code arbitraire sur l'infrastructure GitHub à chaque push. GitHub exige donc une portée distincte : `repo` ne suffit pas, il faut `workflow`.

**Solution.**

```bash
gh auth refresh -h github.com -s workflow
git push -u origin main
```

Si `gh` reste inutilisable, créer un jeton personnel classique sur <https://github.com/settings/tokens> en cochant **`repo`** et **`workflow`**. Au prochain `git push`, Git demande des identifiants : saisir son nom d'utilisateur, et **le jeton en guise de mot de passe**.

**À noter.** Le push est atomique : un rejet ne laisse rien à moitié envoyé. On corrige la cause et on relance la même commande.

---

## 3. Chrome en mode sans interface n'écrit pas le PDF

**Symptôme.** `tools/md2pdf.py` se termine en code 0 sans produire de fichier.

**Cause.** Sans `--user-data-dir` dédié, Chrome détecte une instance déjà lancée, lui délègue la demande et sort immédiatement.

**Solution.** Déjà corrigée dans le script : profil temporaire dédié, et vérification que le PDF se termine bien par `%%EOF`. Sur un document chargé de diagrammes, Chrome écrit le fichier puis tarde à rendre la main — le dépassement de délai n'est donc pas traité comme un échec.

---

## 4. Accents et caractères spéciaux dans la sortie Python

**Symptôme.** `UnicodeEncodeError: 'charmap' codec can't encode character`.

**Cause.** La console Windows utilise par défaut la page de code ANSI, pas UTF-8.

**Solution.**

```bash
PYTHONIOENCODING=utf-8 python mon_script.py
```

---

## 5. Le fichier `.env` ne doit jamais partir sur le dépôt

**Vérification avant chaque commit :**

```bash
git status --short | grep -E "\.env$|\.env\."
```

Toute ligne affichée est une alerte. Le `.gitignore` du projet couvre `.env` à tous les niveaux, mais un `git add -f` ou un `.gitignore` modifié peut contourner la protection.

**Si une clé a été commitée** : la considérer comme compromise et la révoquer immédiatement chez le fournisseur. La retirer de l'historique ne suffit pas — elle a été écrite sur disque, poussée, et potentiellement indexée.

---

## `Activate.ps1 ne peut pas être chargé, car l'exécution de scripts est désactivée`

**Symptôme.** L'activation de l'environnement Python échoue sous PowerShell.

```
.venv\Scripts\Activate.ps1 : Impossible de charger le fichier
.venv\Scripts\Activate.ps1, car l'exécution de scripts est désactivée
sur ce système.
```

**Cause.** La politique d'exécution par défaut de PowerShell (`Restricted`)
interdit les scripts `.ps1`, y compris ceux que l'on vient de créer soi-même.

**Solution retenue : ne pas activer du tout.** Appeler directement le Python de
l'environnement virtuel :

```bash
.venv/Scripts/python.exe -m uvicorn app.main:application --reload --port 3002
```

L'activation ne sert qu'à raccourcir les commandes ; elle n'est nécessaire à
rien. C'est la raison pour laquelle le README écrit les commandes sous cette
forme.

Si vous tenez à activer, la politique se desserre pour la session courante
seulement :

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
```

Au niveau `Process`, le réglage disparaît à la fermeture de la fenêtre — rien
n'est modifié durablement sur la machine.

---

## `[Errno 10048] error while attempting to bind on address` (port déjà utilisé)

**Symptôme.** Le serveur refuse de démarrer.

**Cause.** Une instance précédente tourne encore — souvent une fenêtre fermée
sans `Ctrl+C`.

**Solution.** Identifier le processus qui occupe le port, puis l'arrêter :

```powershell
netstat -ano | findstr :3002
taskkill /PID <le_PID_affiche> /F
```

Même chose avec `:5174` pour le front.
