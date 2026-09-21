# AI-Powered Todo App

A full-stack personal todo app with AI features built on **LangGraph**:

- **Backend** — FastAPI + PostgreSQL (SQLAlchemy), JWT auth (bcrypt + python-jose)
- **AI** — three LangGraph graphs using `langchain-anthropic` (Claude): natural-language
  task parsing, AI prioritization, and a conversational tool-using agent
- **Frontend** — React (Vite + TypeScript) + Tailwind CSS + TanStack Query + React Router

---

## Prerequisites

- Docker (for Postgres)
- Python 3.11+
- Node 18+ / npm
- An Anthropic API key (only needed for the AI features — auth and CRUD work without one)

---

## 1. Start Postgres

From the repo root:

```bash
docker-compose up -d
```

This starts **only** Postgres (image `postgres:16`) on **`localhost:5434`** with database
`todo_db` (user/password `postgres`/`postgres`) and a named volume so data persists.
Nothing else runs in Docker — the backend and frontend run natively.

> **Port note:** the container is published on host port **5434** (mapped to the
> container's internal 5432) to avoid clashing with any Postgres already installed
> natively on 5432, or with other local projects that commonly take 5433.
> `backend/.env.example` already points `DATABASE_URL` at 5434. If another port suits
> your machine better, change it in `docker-compose.yml` and `backend/.env` together.

---

## 2. Backend

```bash
cd backend

# create + activate a virtualenv
python -m venv .venv
# Windows (PowerShell):
.venv\Scripts\Activate.ps1
# macOS/Linux:
# source .venv/bin/activate

pip install -r requirements.txt

# configure environment
cp .env.example .env          # Windows: copy .env.example .env
# then edit .env and paste your real ANTHROPIC_API_KEY

# create the database tables
alembic upgrade head

# run the API (http://localhost:8005, docs at /docs)
uvicorn app.main:app --reload --port 8005
```

### Migration commands

- Apply all migrations to a fresh/updated DB: `alembic upgrade head`
- Roll back the last migration: `alembic downgrade -1`

The initial migration creates the `users` and `tasks` tables. To add future schema
changes: edit the models, then `alembic revision --autogenerate -m "message"` and
`alembic upgrade head`.

### Endpoints

- `GET  /health`
- `POST /auth/signup`, `POST /auth/login`, `GET /auth/me`
- `GET/POST /tasks/`, `GET/PATCH/DELETE /tasks/{id}` (all user-scoped)
- `POST /parse/` (parse NL → create task), `POST /parse/preview` (parse only)
- `POST /prioritize/` (score the user's incomplete tasks)
- `POST /chat/` (`{message}` → `{reply}`)

---

## 3. Frontend

```bash
cd frontend

npm install

cp .env.example .env          # Windows: copy .env.example .env
# VITE_API_URL defaults to http://localhost:8005

npm run dev                   # http://localhost:5180
```

---

## Using it

1. Sign up (email, password, confirm password) → you're redirected to **/tasks**.
2. Optionally use the **Add with AI** box to create a task from natural language (for
  example, *"Email the client the proposal by Friday 5pm — high priority"*). The title,
  due date, priority and tags are extracted for you.
3. Prefer to fill in the fields yourself? Expand **+ Add task manually** for the full
  form (title, description, due date, priority, tags). Creating, editing, completing and
  deleting tasks do not require AI — only the AI box does.
4. Filter with the **All / Urgent / Upcoming** tabs, edit a task with the pencil icon, or
  click **AI Re-prioritize** to give each open task an AI priority score.
5. Go to **/chat** and ask the agent to create / list / complete / delete tasks —
   changes are reflected back on **/tasks**.
6. Log out and back in → you only ever see your own tasks.

---

## LangGraph architecture

Each AI feature is a **compiled LangGraph graph**, not a one-off API call:

- **Parser** (`app/agents/parser_graph.py`) — a single-node `StateGraph` that calls the
  LLM with `.with_structured_output(ParsedTask)`, returning a validated task object.
- **Prioritizer** (`app/agents/prioritizer_graph.py`) — a single-node `StateGraph` that
  scores every task (`.with_structured_output(TaskScores)`).
- **Chat agent** (`app/agents/chat_graph.py` + `tools.py`) — a ReAct-style loop built
  with `langgraph.prebuilt.create_react_agent`. Its tools (`create_task`, `list_tasks`,
  `complete_task`, `delete_task`) are produced by `make_tools(db, user_id)`, a closure
  factory that binds every tool to the current DB session and user id — so the agent can
  never touch another user's tasks.

**Conversation memory is held server-side.** The chat graph uses a `MemorySaver`
checkpointer keyed by `thread_id = user_id`. LangGraph stores the running conversation
itself, so the frontend sends **only the newest message** on each `/chat/` call — never
the full history.

The Anthropic model is read from `CLAUDE_MODEL` (default `claude-sonnet-4-6`) and the key
from `ANTHROPIC_API_KEY`, both wired through `app/core/config.py`. Pasting a real key into
`backend/.env` makes every AI feature work with no code changes.

---

## Known limitations

- **No email verification or password reset.**
- **Single long-lived access token** — no refresh-token rotation; the token lives for
  `ACCESS_TOKEN_EXPIRE_MINUTES` (default 7 days).
- **`MemorySaver` is in-process** — chat history resets if the backend restarts. A
  persistent checkpointer such as **`PostgresSaver`** (from `langgraph-checkpoint-postgres`)
  is a drop-in upgrade: swap the `MemorySaver()` in `chat_graph.py` for a `PostgresSaver`
  pointed at the same Postgres instance.
- Passwords are hashed with bcrypt and never stored or logged in plaintext.
