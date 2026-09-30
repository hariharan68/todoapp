# Troubleshooting & Known Limitations

## Known limitations (by design, not bugs)

- **No email verification or password reset.** Signup is immediate; there's no way to
  recover a forgotten password short of direct DB access.
- **Single long-lived access token, no refresh rotation.** A token issued at login/
  signup is valid for `ACCESS_TOKEN_EXPIRE_MINUTES` (default 7 days). Logging out calls
  `POST /auth/logout`, which bumps the user's `token_version` and so revokes every token
  they hold, on all devices. Deploying migration `0003` signs every user out once,
  because tokens issued before it carry no version.
- **Chat memory is in-process (`MemorySaver`).** Conversation history for the chat
  agent lives in backend process memory, keyed by user id. It is lost whenever the
  backend restarts — the next message from that user starts a fresh conversation even
  though nothing about the request changes. To persist memory across restarts, swap
  `MemorySaver()` for `PostgresSaver` (from `langgraph-checkpoint-postgres`) pointed at
  the same Postgres instance, in `backend/app/agents/chat_graph.py`.
- **`priority` is not DB-enforced.** It's a `VARCHAR(10)` validated only by Pydantic at
  the API boundary — see [DATABASE.md](./DATABASE.md).
- Passwords are hashed with bcrypt and never logged or stored in plaintext.

## Setup issues

### `docker-compose up -d` fails or Postgres never becomes healthy

- Make sure Docker Desktop is actually running.
- Check for a port conflict on **5434**: `docker-compose ps` or
  `netstat -ano | findstr 5434` (PowerShell). If something else is bound to 5434,
  either stop it or remap the port in `docker-compose.yml` and update
  `DATABASE_URL` in `backend/.env` to match.
- `docker-compose logs postgres` shows startup errors directly.

### `alembic upgrade head` fails to connect

- Confirm Postgres is up: `docker-compose ps` should show `Up (healthy)`.
- Confirm `DATABASE_URL` in `backend/.env` matches the Docker port (5434 by default,
  **not** 5432 unless you changed the compose file too).
- The default example is
  `postgresql://postgres:postgres@localhost:5434/todo_db` — copy it exactly if unsure.

### `password authentication failed for user "postgres"` on every request

Symptom: the backend starts fine, but any request that touches the database (e.g.
`POST /auth/login`) returns a `500` with
`psycopg2.OperationalError: ... FATAL:  password authentication failed for user "postgres"`.

This almost always means you are reaching **a different Postgres** than this project's
container — most often another local project's container that grabbed the host port
first. Docker can leave `ai_todo_postgres` reporting `Up (healthy)` while its host port
binding is silently empty, so `docker-compose ps` alone is not enough.

Check the published port:

```powershell
docker ps --filter name=ai_todo_postgres --format "{{.Names}}  {{.Status}}  {{.Ports}}"
```

- Healthy: `0.0.0.0:5434->5432/tcp` — the host port is published.
- Broken: `5432/tcp` only, with no `->` mapping — the host port went to someone else.

Find who holds the port, then either stop that container or pick a free host port in
`docker-compose.yml` and `backend/.env`:

```powershell
docker ps --format "{{.Names}}  {{.Ports}}" | findstr 5434
docker-compose up -d          # recreate with the corrected mapping
```

The named volume (`todo_pgdata`) survives a recreate, so no data is lost.

### `pip install -r requirements.txt` — bcrypt `AttributeError` at startup

`requirements.txt` pins `bcrypt<4.1` specifically because `passlib==1.7.4` reads
`bcrypt.__about__.__version__`, an attribute removed in `bcrypt>=4.1`. If you see
`AttributeError: module 'bcrypt' has no attribute '__about__'` at backend startup,
your installed `bcrypt` is too new — reinstall with the pin:

```bash
pip install "bcrypt<4.1" --force-reinstall
```

### PowerShell refuses to run `.venv\Scripts\Activate.ps1`

Execution policy is blocking script execution. Run once per shell session:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

then retry activation.

### Frontend can't reach the backend / CORS errors in the browser console

- Confirm the backend is actually running on port 8005 (`http://localhost:8005/health`
  should return `{"status":"ok"}`).
- Confirm `frontend/.env`'s `VITE_API_URL` points at the right backend URL.
- Confirm `backend/.env`'s `FRONTEND_ORIGINS` includes the frontend's actual origin
  (default covers `http://localhost:5180` and `http://127.0.0.1:5180` — if you're
  accessing the frontend via a different hostname/port, add it here, comma-separated,
  and restart the backend).

## AI feature issues

### AI endpoints (`/parse`, `/prioritize`, `/chat`) return `502`

All three wrap LLM calls in `try/except` and surface any failure as a `502` with the
underlying error message in `detail` — read that message first, it usually says
exactly what's wrong (auth error, rate limit, network failure, etc.).

Common causes:
- `ANTHROPIC_API_KEY` is blank or invalid in `backend/.env` — auth/CRUD/manual task
  creation all still work without a key; only these three endpoints need it.
- You edited `.env` but didn't restart the backend — `Settings()` is read once at
  process start, so `ANTHROPIC_API_KEY` and `CLAUDE_MODEL` changes require a restart
  of `uvicorn`.
- `CLAUDE_MODEL` names a model your API key doesn't have access to.
- Network/firewall blocking outbound requests to the Anthropic API.

### Chat agent "forgets" earlier messages

Expected if the backend restarted since the conversation started (see "Chat memory is
in-process" above) — not a bug, but the current design's tradeoff for simplicity.

### Chat agent says it created/deleted a task but the UI doesn't show it

The frontend invalidates the `["tasks"]` query cache after every chat turn
(`ChatWindow.tsx`), which should trigger a refetch of any currently-mounted
`useTasks()` hook. If you're not on the `/tasks` page when this happens, the list will
simply be up to date next time you visit it — no action needed.

## Getting more detail

- **Backend logs**: the terminal running `uvicorn app.main:app --reload --port 8005` prints
  request logs and full tracebacks for `500`s.
- **Swagger UI** (`http://localhost:8005/docs`): the fastest way to test any single
  endpoint in isolation, independent of the frontend.
- **Browser DevTools Network tab**: inspect the exact request/response for any failed
  frontend call — the `ApiError` thrown by `api-client.ts` carries the backend's
  `detail` message.
