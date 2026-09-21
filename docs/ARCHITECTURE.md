# Architecture

## System overview

Three independent processes, none containerized except Postgres:

```
┌─────────────────────┐        HTTP (JSON, Bearer JWT)        ┌──────────────────────────┐
│   Frontend (Vite)    │ ─────────────────────────────────▶  │   Backend (FastAPI)       │
│   React + TS         │ ◀─────────────────────────────────  │   Uvicorn, port 8005      │
│   localhost:5180      │                                      │                          │
└─────────────────────┘                                      │  ┌────────────────────┐  │
                                                                │  │  Auth (JWT)        │  │
                                                                │  ├────────────────────┤  │
                                                                │  │  Tasks CRUD        │  │
                                                                │  ├────────────────────┤  │
                                                                │  │  LangGraph agents  │──┼──▶ Anthropic API (Claude)
                                                                │  └────────────────────┘  │
                                                                └────────────┬─────────────┘
                                                                             │ SQLAlchemy (psycopg2)
                                                                             ▼
                                                                ┌──────────────────────────┐
                                                                │  PostgreSQL 16 (Docker)   │
                                                                │  localhost:5434            │
                                                                └──────────────────────────┘
```

- The frontend never talks to Postgres or Anthropic directly — everything goes through
  the FastAPI backend.
- The backend is the only component with the `ANTHROPIC_API_KEY`; the browser never
  sees it.
- Postgres is the only piece run in Docker (see `docker-compose.yml`); the backend and
  frontend run as native processes so `--reload` / Vite HMR work normally.

## Request flow

1. Frontend calls a REST endpoint via `apiClient` (`frontend/src/lib/api-client.ts`),
   attaching `Authorization: Bearer <jwt>` from `localStorage` if present.
2. FastAPI's `CORSMiddleware` allows the configured frontend origins
   (`FRONTEND_ORIGINS` in `backend/app/core/config.py`).
3. Protected routes depend on `get_current_user` (`backend/app/deps.py`), which decodes
   the JWT and loads the `User` row from Postgres.
4. Route handlers use SQLAlchemy (`Session`) to read/write `users`/`tasks`, or — for the
   three AI endpoints — call into a LangGraph graph under `app/agents/`, which itself
   calls the Anthropic API via `langchain-anthropic`.
5. Responses are serialized through Pydantic models in `app/models/schemas.py` and
   returned as JSON.

## Auth flow

- **Signup / Login** (`/auth/signup`, `/auth/login`) return a JWT (`Token.access_token`)
  signed with `SECRET_KEY` (HS256), containing `sub = user_id` and an `exp` claim
  (`ACCESS_TOKEN_EXPIRE_MINUTES`, default 7 days).
- The frontend stores the token in `localStorage` under the key `ai_todo_token`
  (`TOKEN_KEY` in `api-client.ts`) and attaches it to every subsequent request.
- On any `401` response, the frontend's `apiClient.request` wrapper clears the token and
  redirects to `/login` — except on `/login` and `/signup`, where a 401 means bad
  credentials and the error message is surfaced on the form instead (see
  `frontend/src/lib/api-client.ts`).
- `AuthProvider` (`frontend/src/lib/auth-context.tsx`) hydrates the current user by
  calling `GET /auth/me` whenever a token is present, and exposes `login`, `signup`,
  `logout`, `user`, `token`, `loading` via `useAuth()`.
- There is **no refresh-token rotation** — a single long-lived access token. See
  [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for implications.

## Data ownership / multi-tenancy

Every task is scoped to a `user_id` foreign key. All read/write paths — REST routes
*and* the chat agent's tools — filter by the authenticated user's id, so one user can
never see or mutate another user's tasks:

- REST: every query in `app/api/routes/tasks.py` includes `Task.user_id == current_user.id`.
- Chat agent: `make_tools(db, user_id)` in `app/agents/tools.py` closes over the
  request's `user_id` and bakes it into every tool's queries — the LLM has no way to
  pass a different user id even if it tried.

## The three AI features

All three are described in depth in [AI_AGENTS.md](./AI_AGENTS.md); in short:

| Feature | Endpoint | Graph | Shape |
|---|---|---|---|
| Natural-language task parsing | `POST /parse/`, `POST /parse/preview` | `parser_graph.py` | Single-node `StateGraph`, `.with_structured_output(ParsedTask)` |
| AI prioritization | `POST /prioritize/` | `prioritizer_graph.py` | Single-node `StateGraph`, `.with_structured_output(TaskScores)` |
| Conversational agent | `POST /chat/` | `chat_graph.py` + `tools.py` | `langgraph.prebuilt.create_react_agent` ReAct loop with 4 tools |

Each graph builds a **fresh `ChatAnthropic` client per call** (model from
`settings.CLAUDE_MODEL`, `temperature=0`). `Settings()` is instantiated once at import
time (`backend/app/core/config.py`), so changing `CLAUDE_MODEL` or
`ANTHROPIC_API_KEY` in `.env` requires restarting the backend process to take effect.

The chat agent additionally holds **server-side conversation memory** via a
module-level `MemorySaver` checkpointer keyed by `thread_id = user_id`, so the client
only ever sends the newest message, never full history. This memory is in-process and
resets on backend restart (see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for the
suggested `PostgresSaver` upgrade).

## Frontend architecture

- **Routing** (`App.tsx`, React Router): `/login`, `/signup` public; `/tasks`, `/chat`
  wrapped in `<ProtectedRoute>`; unmatched paths redirect to `/tasks`.
- **Server state**: TanStack Query (`useTasks.ts`) owns all task data — queries and
  mutations, with automatic cache invalidation (`["tasks"]` key) after every mutation
  including the chat agent's side effects (`ChatWindow.tsx` manually invalidates
  `["tasks"]` after every chat turn, since the agent may have changed data the query
  cache doesn't know about).
- **Auth state**: React Context (`auth-context.tsx`) — not TanStack Query — since it's
  small, global, and drives route protection.
- **Styling**: Tailwind CSS utility classes inline in components; no CSS-in-JS or
  component library.

See [BACKEND.md](./BACKEND.md) and [FRONTEND.md](./FRONTEND.md) for file-by-file detail.
