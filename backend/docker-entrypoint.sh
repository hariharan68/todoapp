#!/bin/sh
# Container entrypoint: get the database ready, then hand off to the server.
#
# Migrations and checkpoint-table setup run here, once, in the single
# entrypoint process — before uvicorn forks its workers. Running them per
# worker would have several processes applying the same DDL concurrently.
set -eu

: "${RUN_MIGRATIONS:=true}"
: "${WEB_CONCURRENCY:=2}"
: "${PORT:=8000}"
: "${DB_WAIT_TIMEOUT:=60}"

log() { echo "[entrypoint] $*"; }

# Load and validate configuration before anything else.
#
# Worth doing here rather than leaving it to the app: uvicorn's multiprocess
# supervisor does not die when a worker fails to import. A bad SECRET_KEY would
# leave the container "up" with no worker serving traffic, and `restart:
# unless-stopped` would not help because the parent process never exits.
# Failing in the entrypoint gives a non-zero exit and one clear message.
preflight() {
  if ! python -c "
import sys

try:
    from app.core.config import settings
except Exception as exc:
    # Print only our own validation messages. A pydantic ValidationError
    # renders the whole rejected input dict, which would put the bad
    # SECRET_KEY straight into the container logs.
    messages = []
    get_errors = getattr(exc, 'errors', None)
    if callable(get_errors):
        try:
            messages = [e.get('msg', '') for e in get_errors()]
        except Exception:
            messages = []
    if not messages:
        messages = [f'{type(exc).__name__}: {exc}']
    print('[entrypoint] configuration error:', file=sys.stderr)
    for m in messages:
        print(f'  {m}', file=sys.stderr)
    sys.exit(1)

print(
    f'[entrypoint] config ok: environment={settings.ENVIRONMENT} '
    f'ai_enabled={settings.ai_enabled} '
    f'chat_checkpointer={settings.chat_checkpointer}'
)
"; then
    log "refusing to start - fix the configuration above and redeploy"
    exit 1
  fi
}

wait_for_db() {
  log "waiting up to ${DB_WAIT_TIMEOUT}s for the database"
  python - "$DB_WAIT_TIMEOUT" <<'PY'
import sys, time
import sqlalchemy
from app.core.config import settings

deadline = time.monotonic() + float(sys.argv[1])
engine = sqlalchemy.create_engine(settings.DATABASE_URL, pool_pre_ping=True)
last = None
while time.monotonic() < deadline:
    try:
        with engine.connect() as conn:
            conn.execute(sqlalchemy.text("SELECT 1"))
        print("[entrypoint] database is reachable")
        sys.exit(0)
    except Exception as exc:  # noqa: BLE001 - any failure means "not ready yet"
        last = exc
        time.sleep(1.5)
print(f"[entrypoint] database unreachable: {last}", file=sys.stderr)
sys.exit(1)
PY
}

preflight

if [ "$RUN_MIGRATIONS" = "true" ]; then
  wait_for_db
  log "applying database migrations"
  alembic upgrade head
  log "ensuring chat checkpoint tables exist"
  python -m app.agents.checkpointer setup
else
  log "RUN_MIGRATIONS=$RUN_MIGRATIONS - skipping migrations"
fi

if [ "$#" -gt 0 ]; then
  log "exec: $*"
  exec "$@"
fi

log "starting uvicorn on 0.0.0.0:${PORT} with ${WEB_CONCURRENCY} worker(s)"
# exec so uvicorn becomes PID 1 and receives SIGTERM directly, giving it a
# chance to drain in-flight requests instead of being killed by the shell.
exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "$PORT" \
  --workers "$WEB_CONCURRENCY" \
  --proxy-headers \
  --forwarded-allow-ips '*' \
  --no-access-log
