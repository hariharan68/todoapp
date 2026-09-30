# Deployment

How to run this app on a production server with Docker Compose.

The stack is three containers:

| Service    | Image                | Exposed              | Role                                              |
| ---------- | -------------------- | -------------------- | ------------------------------------------------- |
| `web`      | built from `frontend/` | host port (`WEB_PORT`) | nginx: serves the built SPA, proxies `/api` to the API, rate-limits auth |
| `backend`  | built from `backend/`  | internal only        | FastAPI under uvicorn; runs migrations at startup  |
| `postgres` | `postgres:16`          | internal only        | database, on a named volume                       |

Only `web` publishes a port. The API and the database are reachable only on the
internal compose network, so they stay unreachable from the internet even if the
host firewall is wrong.

The browser talks to `/api` on the same origin that served the page, and nginx
proxies it to the backend. That means **CORS is not part of production at all**,
and there is no API hostname baked into the frontend bundle.

---

## 1. Prerequisites on the server

- Docker Engine 24+ with the Compose plugin (`docker compose version`)
- Ports: whatever you set as `WEB_PORT` (80 by default)
- ~2 GB RAM is comfortable for all three containers

## 2. Get the code onto the server

```bash
git clone <your-repo-url> ai-todo
cd ai-todo
```

## 3. Create the environment file

```bash
cp .env.production.example .env
```

Then edit `.env`. Two values are mandatory and the stack refuses to start
without them:

```bash
# A strong database password
POSTGRES_PASSWORD=...

# The JWT signing key — at least 32 characters of randomness
SECRET_KEY=...
```

Generate the signing key:

```bash
docker run --rm python:3.11-slim \
  python -c "import secrets; print(secrets.token_urlsafe(48))"
```

`SECRET_KEY` is the single most important value here. Anyone who knows it can
mint a valid token for any account, so the backend **refuses to boot** when
`ENVIRONMENT=production` and the key is empty, shorter than 32 characters, or
still the example placeholder. That is deliberate: a loud failure at startup is
much better than a quietly forgeable login.

Add `ANTHROPIC_API_KEY` if you want the AI features. Without it, signup, login
and all task CRUD work normally; the three AI endpoints return a 503 explaining
the key is missing, and the app stays fully usable.

## 4. Start it

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

First boot does the following, in order:

1. Postgres initialises the `pgdata` volume and becomes healthy.
2. The backend entrypoint waits for the database, runs `alembic upgrade head`,
   then creates the LangGraph chat-checkpoint tables.
3. uvicorn starts `WEB_CONCURRENCY` workers.
4. nginx starts once the backend reports healthy.

Watch it come up:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f backend
```

## 5. Verify

```bash
# nginx is serving
curl -i http://localhost/healthz

# the API is reachable through the proxy and can see the database
curl -s http://localhost/api/health/ready

# end-to-end: create an account
curl -s -X POST http://localhost/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"a-real-password"}'
```

Then open the host in a browser and sign up through the UI.

---

## TLS

The `web` container serves plain HTTP on purpose — TLS belongs in front of it,
where certificate renewal lives. Pick one:

**Caddy on the host** (simplest; automatic Let's Encrypt):

Set `WEB_PORT=8080` in `.env`, change the `web` port binding in
`docker-compose.prod.yml` to `127.0.0.1:8080:80` so only the host proxy can
reach it, then:

```
todo.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

**nginx on the host**: same idea — `proxy_pass http://127.0.0.1:8080;` with
certbot managing the certificate.

**A cloud load balancer or Cloudflare**: terminate TLS there and forward to the
host.

Whichever you choose, two follow-ups:

1. Uncomment the `Strict-Transport-Security` line in
   `frontend/nginx-security-headers.conf`. It is commented out because sending
   HSTS over plain HTTP pins browsers to a scheme the server isn't serving yet.
2. Uncomment and set `set_real_ip_from` in `frontend/nginx.conf` to the proxy's
   network. Without it every request appears to come from the proxy's single
   IP, which turns the per-IP rate limits into one global limit and makes the
   access logs useless.

Both need a rebuild of the `web` image to take effect.

---

## Operations

### Deploying a new version

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Migrations run automatically in the backend entrypoint. Compose recreates only
the containers whose image or config changed; the `pgdata` volume is untouched.

### Backups

The database is the only state. Everything else is rebuildable from the repo.

```bash
# Dump
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists \
  | gzip > "backup-$(date +%F).sql.gz"

# Restore
gunzip -c backup-2026-09-30.sql.gz \
  | docker compose -f docker-compose.prod.yml exec -T postgres \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

Put the dump command in a cron job that ships the file off the server. A backup
that only exists on the machine it backs up is not a backup.

### Logs

Both app containers log to stdout; Docker's json-file driver captures them,
capped at 5 x 10 MB per container so they cannot fill the disk.

```bash
docker compose -f docker-compose.prod.yml logs -f backend
```

The backend emits one JSON object per line in production. Every request gets an
`X-Request-ID` (reusing an inbound one if present), and every log line made
while handling it carries the same `request_id`. When a user reports an error,
the 500 response body includes that id — grep for it:

```bash
docker compose -f docker-compose.prod.yml logs backend | grep <request-id>
```

### Shell access

```bash
docker compose -f docker-compose.prod.yml exec backend sh
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

### Rotating the signing key

Change `SECRET_KEY` in `.env` and `up -d` the backend. Every existing token
becomes invalid and all users are logged out — which is exactly what you want
after a suspected leak.

### Scaling

`WEB_CONCURRENCY` sets the uvicorn worker count; `(2 x cores) + 1` is a
reasonable start. Each worker keeps its own SQLAlchemy pool, so raise
`DB_POOL_SIZE` with it and keep
`WEB_CONCURRENCY x (DB_POOL_SIZE + DB_MAX_OVERFLOW)` below Postgres'
`max_connections` (100 by default).

Chat history is stored in Postgres in production, not in process memory, so any
worker can serve any user's next message and a restart does not lose the
conversation.

---

## Configuration reference

Everything below is read from the environment. `.env.production.example`
documents each one inline.

| Variable                      | Default             | Notes                                                  |
| ----------------------------- | ------------------- | ------------------------------------------------------ |
| `ENVIRONMENT`                 | `production` (image) | `production` turns on the startup guards, JSON logs, HSTS, shared chat memory, and hides `/docs` |
| `SECRET_KEY`                  | —                   | **Required.** >= 32 chars                              |
| `POSTGRES_USER` / `_PASSWORD` / `_DB` | —           | **Required.** Applied only when the volume is first created |
| `DATABASE_URL`                | built by compose    | —                                                      |
| `ANTHROPIC_API_KEY`           | empty               | Empty disables the AI endpoints (503), nothing else    |
| `CLAUDE_MODEL`                | `claude-sonnet-4-6` | Used by all three AI features                          |
| `WEB_PORT`                    | `80`                | Host port for nginx                                    |
| `WEB_CONCURRENCY`             | `2`                 | uvicorn workers                                        |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `10080` (7 days)    | No refresh rotation, so this is the only expiry control |
| `LOG_LEVEL`                   | `INFO`              | —                                                      |
| `DB_POOL_SIZE`                | `5`                 | Per worker                                             |
| `DB_MAX_OVERFLOW`             | `10`                | Per worker                                             |
| `CHAT_CHECKPOINTER`           | `auto`              | `auto` = postgres in production, memory in development |
| `DOCS_ENABLED`                | unset               | Unset means off in production. `true` re-enables `/docs` |
| `VITE_API_URL`                | `/api`              | Build-time; baked into the bundle                      |
| `FRONTEND_ORIGINS`            | empty               | Only needed for a split-origin deployment              |
| `RUN_MIGRATIONS`              | `true`              | Set `false` to run `alembic upgrade head` yourself     |

---

## What production mode changes

Setting `ENVIRONMENT=production` (the image default) is not cosmetic:

- **Startup validation.** Boot fails on a weak or placeholder `SECRET_KEY`, or
  an empty `DATABASE_URL`.
- **No `/docs`, `/redoc` or `/openapi.json`.** The full API surface is not
  self-documenting to whoever finds the host. `DOCS_ENABLED=true` overrides.
- **Errors stop leaking internals.** AI failures return a fixed sentence and
  the real exception goes to the log. In development the detail stays inline,
  where you want it.
- **No traceback ever reaches a client.** An unhandled exception returns
  `{"detail": "Internal server error.", "request_id": "..."}`.
- **JSON logs** on stdout, one object per line.
- **Shared chat memory** in Postgres, so multiple workers agree.
- **HSTS** is offered by the API (`Strict-Transport-Security`).

---

## Troubleshooting

**`Refusing to start in ENVIRONMENT=production: SECRET_KEY ...`**
Working as intended — `SECRET_KEY` in `.env` is missing, too short, or still
the placeholder. Generate one (step 3) and `up -d` again.

**`POSTGRES_PASSWORD is required`**
Compose could not find `.env`, or the variable is empty. `.env` must sit in the
same directory as `docker-compose.prod.yml`.

**Backend restarting, logs say the database is unreachable**
The entrypoint waits 60s (`DB_WAIT_TIMEOUT`) for Postgres. Check
`logs postgres` — usually the volume was created with different credentials
than `.env` now specifies. Postgres applies `POSTGRES_PASSWORD` only when it
initialises the volume. Either restore the old password, or (destroying all
data) `docker compose -f docker-compose.prod.yml down -v`.

**Login works, then everything returns 401**
`SECRET_KEY` changed between issuing and validating the token. Expected after a
rotation; log in again.

**AI features return 503**
`ANTHROPIC_API_KEY` is not set. Everything else keeps working.

**429 from the login endpoint**
The nginx rate limit (10/min per IP). If legitimate users hit it, you are
probably behind another proxy without `set_real_ip_from` configured, so every
user shares one apparent IP — see the TLS section.

**Browser shows the old version after a deploy**
`index.html` is served `no-cache` and assets are fingerprinted, so this should
not happen. If it does, confirm the `web` image actually rebuilt:
`up -d --build` — plain `up -d` reuses the existing image.
