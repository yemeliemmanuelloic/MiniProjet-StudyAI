# StudyAI

Assistant de révision. L'étudiant importe un cours (texte collé, PDF à couche
texte, Word `.docx` ou PowerPoint `.pptx`) ; l'application en produit un **résumé**, un **quiz d'auto-évaluation**
et répond à ses questions via un **tuteur ancré sur le cours**.

Mini-projet du module *IA for Software Engineering* (5SAE9, A.U. 2026-2027).

> **Documentation complète dans [`docs/`](docs/README.md)** — produit,
> architecture, base de données, API, sécurité, tests, prompts et décisions
> techniques. Un agent de codage lit [`docs/AGENTS.md`](docs/AGENTS.md) en
> premier.

---

## Pile technique

| Couche | Choix | Pourquoi |
|---|---|---|
| Front | React 18, Vite, TypeScript | Imposé par l'énoncé (React/Vue) |
| Back | Python 3.12+, FastAPI, Pydantic v2 | Documentation OpenAPI produite automatiquement, et écosystème adapté au découpage de textes longs |
| Base | PostgreSQL (Supabase), SQLAlchemy 2, Alembic | Migrations versionnées |
| Modèle | Gemini ou Anthropic, au choix | Bascule par une variable d'environnement, sans toucher au code |
| Lecture des supports | PyMuPDF, python-docx, python-pptx | PDF, `.docx` et `.pptx` — les supports du module sont justement distribués en Office. Bibliothèques Python pures : rien à installer sur le poste |

---

## Les trois modules IA

| Module | Température | Garde-fou principal |
|---|---|---|
| Résumé | 0.2 | Interdiction d'ajouter des connaissances extérieures au cours |
| Quiz | 0.7 | `sourceQuote` obligatoire : pas de citation du cours, pas de question |
| Tuteur | 0.1 | `grounded: false` quand les passages ne permettent pas de répondre |

Tous trois passent par le même pipeline : **anonymisation → découpage →
appel → validation stricte → réhydratation**. Une sortie non conforme au schéma
n'est jamais stockée ni affichée ; elle déclenche une relance, puis une erreur
`LLM_INVALID_OUTPUT`.

### Cours longs

Un cours plus long que `SEGMENT_CHARS` n'est **pas tronqué** : il est découpé en
segments qui respectent les paragraphes, avec recouvrement.

- **Résumé** : chaque segment est résumé, puis les résumés partiels sont fusionnés.
- **Quiz** : les questions sont réparties sur des segments échelonnés sur tout le cours.
- **Tuteur** : seuls les segments les plus proches de la question sont envoyés (BM25).

Si le cours dépasse `MAX_SEGMENTS × SEGMENT_CHARS`, il est amputé — mais
l'étudiant en est **averti à l'écran**, dans les `warnings` du résumé.

---

## Installation

### 1. Base de données

Créer un projet Supabase, puis copier les deux chaînes de connexion du panneau
*Connect* : le pooler de transactions (port 6543) et le pooler de sessions
(port 5432).

### 2. Back — première installation

```bash
cd server
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
cp .env.example .env          # puis compléter DATABASE_URL, DIRECT_URL, JWT_SECRET, GEMINI_API_KEY
.venv/Scripts/python.exe -m alembic upgrade head
```

> Les commandes appellent **directement** le Python de l'environnement virtuel,
> sans l'activer. C'est volontaire : sous Windows, `Activate.ps1` est souvent
> bloqué par la politique d'exécution de PowerShell, et l'activation n'apporte
> rien ici. Sous Linux ou macOS, remplacer `.venv/Scripts/python.exe` par
> `.venv/bin/python`.

### 3. Front — première installation

```bash
cd client
npm install
```

### 4. Lancer — deux terminaux

**Terminal 1, l'API :**

```bash
cd server
.venv/Scripts/python.exe -m uvicorn app.main:application --reload --port 3002
```

**Terminal 2, l'application :**

```bash
cd client
npm run dev
```

| | |
|---|---|
| Application | <http://localhost:5174> |
| Documentation de l'API | <http://localhost:3002/docs> |
| État du service | <http://localhost:3002/api/health> |

Les deux serveurs se rechargent tout seuls à chaque modification. Pour les
arrêter : `Ctrl+C` dans chaque terminal.

**Sans projet Supabase ?** L'application tourne sur une base SQLite locale :
remplacer les deux premières lignes de `server/.env` par
`DATABASE_URL=sqlite:///./demo-locale.db` et la même valeur pour `DIRECT_URL`,
puis relancer la migration. Les trois modules IA fonctionnent à l'identique.

---

## Tests

```bash
cd server
python -m pytest tests -q
```

Les tests portent sur les deux parties déterministes et critiques :
l'**anonymisation** (aucune donnée personnelle ne doit sortir) et le
**découpage** (aucun passage du cours ne doit disparaître). Ils n'appellent
jamais le fournisseur de modèle : une suite de tests qui dépend du réseau n'est
pas une suite de tests.

---

## Organisation du code

```
server/app/
  llm/              pipeline.py est la SEULE entrée publique du module.
    redact.py       anonymisation (+ restauration)
    client.py       appel bas niveau — ne pas importer hors de llm/
    run_task.py     validation de schéma et relance
    pipeline.py     masquage, découpage, agrégation, réhydratation
    providers/      gemini.py, anthropic.py
  prompts/          les prompts versionnés — livrable du projet
  services/
    segmentation.py découpage et sélection des segments
    study.py        logique métier des trois modules
  routers/          auth, courses, study
  schemas/          api.py (HTTP) et llm.py (sorties des modules IA)
```

La règle de confidentialité est **structurelle** : le reste de l'application
n'appelle que les trois fonctions de `llm/pipeline.py`, qui anonymisent
systématiquement. Aucun chemin ne permet d'envoyer un cours brut au modèle,
parce qu'aucun autre chemin n'existe.
