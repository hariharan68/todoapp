# Backend — FastAPI

Location: `backend/app/`. Entry point: `app/main.py`, served by Uvicorn
(`uvicorn app.main:app --reload`).

## Directory layout

```
backend/app/
├── main.py            # FastAPI app instance, CORS, router registration, /health
├── deps.py            # get_current_user — shared auth dependency
├── core/
│   ├── config.py      # Settings (pydantic-settings, reads .env)
│   └── security.py    # password hashing (bcrypt), JWT create/decode
├── db/
│   └── database.py     # SQLAlchemy engine, SessionLocal, Base, get_db
├── models/
│   ├── user.py         # User ORM model
│   ├── task.py         # Task ORM model
│   └── schemas.py       # Pydantic request/response DTOs
├── agents/              # LangGraph graphs — see AI_AGENTS.md
│   ├── parser_graph.py
│   ├── prioritizer_graph.py
│   ├── chat_graph.py
│   └── tools.py
└── api/routes/
    ├── auth.py
    ├── tasks.py
    ├── parse.py
    ├── prioritize.py
    └── chat.py
```

## `main.py`

Creates the `FastAPI` app, adds `CORSMiddleware` (origins from
`settings.cors_origins`, credentials allowed, all methods/headers allowed), registers
all five routers, and defines `GET /health` → `{"status": "ok"}`.

## `core/config.py` — `Settings`

A `pydantic-settings` `BaseSettings` subclass, populated from `backend/.env` (or real
env vars). Fields:

| Field | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/todo_db` | SQLAlchemy connection string |
| `SECRET_KEY` | `change-this-to-something-random-and-long` | JWT signing secret |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `10080` (7 days) | JWT lifetime |
| `ALGORITHM` | `HS256` | JWT signing algorithm |
| `ANTHROPIC_API_KEY` | `""` | Claude API key; blank disables AI endpoints |
| `CLAUDE_MODEL` | `claude-sonnet-4-6` | Model used by all three LangGraph graphs |
| `FRONTEND_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated CORS allow-list |

The module-level singleton `settings = Settings()` is created once at import time. A
side effect at the bottom of the file copies `ANTHROPIC_API_KEY` into
`os.environ["ANTHROPIC_API_KEY"]` if set, because `langchain-anthropic`'s
`ChatAnthropic` reads the key from the environment — this keeps `Settings` as the
single source of truth while still satisfying that library's expectation.

## `core/security.py`

- `hash_password` / `verify_password` — bcrypt via `passlib.CryptContext`.
- `create_access_token(user_id)` — signs a JWT with `sub=user_id` and an `exp` claim
  `ACCESS_TOKEN_EXPIRE_MINUTES` in the future.
- `decode_access_token(token)` — verifies signature/expiry and returns the `sub` claim,
  or `None` on any failure (expired, tampered, malformed).

## `db/database.py`

- `engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)`
- `SessionLocal` — `sessionmaker(autocommit=False, autoflush=False)`
- `Base(DeclarativeBase)` — shared declarative base for all ORM models and Alembic
  autogenerate metadata
- `get_db()` — FastAPI dependency generator; yields a `Session`, always closes it in a
  `finally` block

## `deps.py` — `get_current_user`

```python
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User
```

- Uses `OAuth2PasswordBearer(tokenUrl="/auth/login")` to pull the bearer token from the
  `Authorization` header (this also makes the token field appear in `/docs`'s "Authorize"
  button).
- Decodes the token via `decode_access_token`; on failure (or a malformed/nonexistent
  user id) raises `401 Could not validate credentials`.
- Loads the `User` by primary key; every route in `tasks.py`, `parse.py`,
  `prioritize.py`, and `chat.py` depends on this to get the current user, and every
  data query is filtered by that user's id.

## `models/user.py` — `User`

Table `users`: `id` (UUID PK, default `uuid4`), `email` (unique, indexed), 
`hashed_password`, `created_at` (server default `now()`). Has a `tasks` relationship
(`cascade="all, delete-orphan"` — deleting a user deletes their tasks).

## `models/task.py` — `Task`

Table `tasks`: `id` (UUID PK), `user_id` (FK → `users.id`, `ondelete=CASCADE`, indexed),
`title`, `description` (nullable), `due_date` (nullable, timezone-aware), `priority`
(string, default `"medium"`), `ai_priority_score` (nullable int, 0–100, set by the
prioritizer), `completed` (bool, default `False`), `tags` (nullable string, free-form
comma-separated), `created_at`, `updated_at` (auto-updated via `onupdate=func.now()`).

## `models/schemas.py` — Pydantic DTOs

Grouped by feature:

- **Auth**: `SignupIn`, `LoginIn`, `Token`, `UserOut`
- **Tasks**: `TaskCreate`, `TaskUpdate` (all fields optional, `exclude_unset` used on
  PATCH), `TaskOut`
- **Parse**: `ParseIn`, `ParsedTask` (the structured-output shape the parser LLM call
  returns — also reused directly as the `/parse/preview` response model)
- **Chat**: `ChatIn`, `ChatOut`

`Priority = Literal["low", "medium", "high"]` is shared across schemas.

## Routes

Each router file's responsibility is one line each here; see
[API_REFERENCE.md](./API_REFERENCE.md) for exact request/response shapes.

| File | Prefix | Routes |
|---|---|---|
| `auth.py` | `/auth` | `POST /signup`, `POST /login`, `GET /me` |
| `tasks.py` | `/tasks` | `GET /`, `POST /`, `GET /{id}`, `PATCH /{id}`, `DELETE /{id}` — all scoped to `current_user.id`, 404 if the task belongs to someone else or doesn't exist |
| `parse.py` | `/parse` | `POST /preview` (parse only, don't persist), `POST /` (parse + create task) |
| `prioritize.py` | `/prioritize` | `POST /` — scores all incomplete tasks, persists `ai_priority_score`, returns tasks sorted by score descending |
| `chat.py` | `/chat` | `POST /` — one turn with the conversational agent |

Common patterns across routes:

- AI routes (`parse.py`, `prioritize.py`, `chat.py`) wrap graph invocation in
  `try/except Exception` and re-raise as `HTTPException(502, ...)` — any LangChain/
  Anthropic error (bad API key, rate limit, network error) surfaces to the client as a
  clean 502 rather than an unhandled 500.
- `tasks.py` has a private helper `_get_owned_task_or_404` used by `get`, `update`, and
  `delete` to enforce ownership + existence in one place.

## Database migrations (Alembic)

- `alembic.ini` leaves `sqlalchemy.url` blank; `alembic/env.py` injects it at runtime
  from `settings.DATABASE_URL`, so migrations always target whatever `.env` points at.
- `alembic/env.py` imports `app.models.task` and `app.models.user` so their tables
  register on `Base.metadata` for `--autogenerate` to see.
- Current migrations: `0001_initial.py` — creates `users` and `tasks` with all columns,
  indexes (`ix_users_email` unique, `ix_tasks_user_id`), and the FK with
  `ondelete="CASCADE"`.

See [DATABASE.md](./DATABASE.md) for the full schema reference and migration workflow.

## Dependencies (`requirements.txt`)

`fastapi`, `uvicorn[standard]`, `sqlalchemy`, `psycopg2-binary`, `alembic`, `pydantic`,
`pydantic-settings`, `email-validator`, `python-dotenv`, `passlib[bcrypt]`
(`bcrypt<4.1` pinned — passlib 1.7.4 reads a `bcrypt.__about__.__version__` attribute
removed in bcrypt 4.1+), `python-jose[cryptography]`, `python-multipart`, `langgraph`,
`langchain-anthropic`, `langchain-core`.
