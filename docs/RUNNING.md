# Running the App — Step by Step

This is the authoritative, must-follow guide to get the app running locally. Three
things need to be running at once: **Postgres** (Docker), the **backend** (FastAPI on
port 8000), and the **frontend** (Vite on port 5173).

Instructions below give both PowerShell (Windows) and bash (macOS/Linux) commands where
they differ.

## 0. Prerequisites

- **Docker Desktop** — running, for Postgres.
- **Python 3.11+**
- **Node 18+** and npm
- An **Anthropic API key** — only required for the three AI features (natural-language
  parsing, AI prioritization, chat agent). Signup/login and manual task CRUD work
  without one. Get a key at https://console.anthropic.com/.

Verify versions:

```powershell
docker --version
python --version
node --version
npm --version
```

---

## 1. Start Postgres (Docker)

From the repository root (`TODO/`):

```powershell
docker-compose up -d
```

This starts **only** Postgres (`postgres:16`) — nothing else runs in Docker.

- Host port: **5433** (mapped to the container's internal 5432, to avoid clashing with
  a Postgres already installed natively on 5432)
- Database: `todo_db`
- User / password: `postgres` / `postgres`
- Data persists in a named Docker volume (`pgdata`) across restarts

Check it's healthy:

```powershell
docker-compose ps
```

You should see `ai_todo_postgres` as `Up (healthy)`. If port 5432 is free on your
machine and you'd rather use it, change the port mapping in `docker-compose.yml`
(`"5433:5432"` → `"5432:5432"`) **and** update `DATABASE_URL` in `backend/.env` to
match.

To stop Postgres later: `docker-compose down` (add `-v` to also delete the data volume).

---

## 2. Backend (FastAPI)

All commands below are run from the `backend/` directory.

```powershell
cd backend
```

### 2.1 Create and activate a virtual environment

```powershell
python -m venv .venv
```

Windows (PowerShell):
```powershell
.venv\Scripts\Activate.ps1
```
macOS/Linux:
```bash
source .venv/bin/activate
```

> If PowerShell blocks the activation script with an execution-policy error, run
> `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` first, then retry.

### 2.2 Install dependencies

```powershell
pip install -r requirements.txt
```

### 2.3 Configure environment variables

```powershell
copy .env.example .env
```
(macOS/Linux: `cp .env.example .env`)

Then open `backend/.env` and set:

```env
ANTHROPIC_API_KEY=your_anthropic_api_key_here
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/todo_db
SECRET_KEY=change-this-to-something-random-and-long
ACCESS_TOKEN_EXPIRE_MINUTES=10080
CLAUDE_MODEL=claude-sonnet-4-6
```

- **`ANTHROPIC_API_KEY`** — paste your real key here to enable AI parsing,
  prioritization, and chat. Leave blank and everything else (auth, manual task CRUD)
  still works; the AI endpoints will fail with a `502`.
- **`DATABASE_URL`** — must match the Docker Postgres port (5433 by default).
- **`SECRET_KEY`** — used to sign JWTs. Change it to a long random string for anything
  beyond local development.
- **`CLAUDE_MODEL`** — defaults to `claude-sonnet-4-6`; change to any Claude model your
  API key has access to.

### 2.4 Create the database tables

```powershell
alembic upgrade head
```

This runs the initial migration, creating the `users` and `tasks` tables (see
[DATABASE.md](./DATABASE.md)).

### 2.5 Run the API server

```powershell
uvicorn app.main:app --reload
```

- API base URL: **http://localhost:8000**
- Interactive Swagger docs: **http://localhost:8000/docs**
- Health check: **http://localhost:8000/health** → `{"status": "ok"}`

Keep this terminal open — `--reload` restarts the server automatically as you edit
backend code.

#### Migration reference

| Command | Effect |
|---|---|
| `alembic upgrade head` | Apply all pending migrations (fresh or updated DB) |
| `alembic downgrade -1` | Roll back the most recent migration |
| `alembic revision --autogenerate -m "message"` | Generate a new migration after changing a model in `app/models/` |

---

## 3. Frontend (React + Vite)

Open a **second terminal**, from the repository root:

```powershell
cd frontend
npm install
```

### 3.1 Configure environment variables

```powershell
copy .env.example .env
```
(macOS/Linux: `cp .env.example .env`)

`frontend/.env` needs only:

```env
VITE_API_URL=http://localhost:8000
```

This already matches the backend's default port — change it only if you run the
backend elsewhere.

### 3.2 Run the dev server

```powershell
npm run dev
```

- Frontend URL: **http://localhost:5173**

Keep this terminal open too — Vite hot-reloads on file changes.

---

## 4. Verify everything works

With all three (Postgres, backend, frontend) running:

1. Open **http://localhost:5173** in a browser.
2. **Sign up** with any email and a password ≥ 6 characters (entered twice — the confirm
   field is checked client-side) → you're redirected to `/tasks`.
3. Expand **"+ Add task manually"** and add a task (title, optional description/due
   date/priority/tags) — no AI key needed for this.
4. If you configured `ANTHROPIC_API_KEY`:
   - Try the **"Add with AI"** box with text like *"Email the client the proposal by
     Friday 5pm — high priority"*.
   - Click **"AI Re-prioritize"** to score your open tasks.
   - Go to **/chat** and ask the agent to create, list, complete, or delete tasks.
5. Log out and back in — you should only ever see your own tasks.

---

## Daily start / stop (after first-time setup)

Once you've done the setup above once, subsequent runs are just:

```powershell
# Terminal 1 — from repo root
docker-compose up -d

# Terminal 2 — backend
cd backend
.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload

# Terminal 3 — frontend
cd frontend
npm run dev
```

To stop: `Ctrl+C` in the backend and frontend terminals, then `docker-compose down`
from the repo root.

---

## Running with a fresh/existing venv already present

If `backend/.venv` already exists (it does in this repo checkout), you can skip
`python -m venv .venv` and just activate it and reinstall dependencies if
`requirements.txt` changed:

```powershell
cd backend
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

For issues during any of these steps, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).
