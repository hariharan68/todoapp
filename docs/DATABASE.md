# Database

**Engine**: PostgreSQL 16, run via Docker Compose (`docker-compose.yml`), exposed on
host port **5433** (container internally listens on 5432). Database name `todo_db`,
user/password `postgres`/`postgres`.

**ORM**: SQLAlchemy 2.0 declarative models (`Mapped[...]` / `mapped_column`) under
`backend/app/models/`. **Migrations**: Alembic, under `backend/alembic/`.

## Schema

### `users`

| Column | Type | Constraints |
|---|---|---|
| `id` | `UUID` | PK, default `uuid4()` (generated in Python, not by Postgres) |
| `email` | `VARCHAR(320)` | unique, indexed (`ix_users_email`), not null |
| `hashed_password` | `VARCHAR(255)` | not null (bcrypt hash) |
| `created_at` | `TIMESTAMPTZ` | not null, server default `now()` |

Relationship: `tasks` — one-to-many to `Task`, `cascade="all, delete-orphan"` (deleting
a user deletes all their tasks at the ORM level; the FK also has `ondelete="CASCADE"`
at the DB level as a backstop).

### `tasks`

| Column | Type | Constraints |
|---|---|---|
| `id` | `UUID` | PK, default `uuid4()` |
| `user_id` | `UUID` | FK → `users.id`, `ON DELETE CASCADE`, indexed (`ix_tasks_user_id`), not null |
| `title` | `VARCHAR(500)` | not null |
| `description` | `TEXT` | nullable |
| `due_date` | `TIMESTAMPTZ` | nullable |
| `priority` | `VARCHAR(10)` | not null, default `"medium"` (app-level `Literal["low","medium","high"]`; **not** a DB-level CHECK/enum constraint) |
| `ai_priority_score` | `INTEGER` | nullable, 0–100, set by `POST /prioritize/` |
| `completed` | `BOOLEAN` | not null, default `false` |
| `tags` | `VARCHAR(500)` | nullable, free-form comma-separated string (not a separate table/array) |
| `created_at` | `TIMESTAMPTZ` | not null, server default `now()` |
| `updated_at` | `TIMESTAMPTZ` | not null, server default `now()`, auto-updated via `onupdate=func.now()` on any ORM-level update |

Relationship: `user` — many-to-one back to `User`.

### Entity relationship

```
users (1) ──< (many) tasks
  id ────────────── user_id  (ON DELETE CASCADE)
```

## Migrations (Alembic)

- Config: `backend/alembic.ini` — `sqlalchemy.url` is intentionally left blank;
  `backend/alembic/env.py` injects it at runtime from `settings.DATABASE_URL`, so
  migrations always run against whatever `backend/.env` currently points at.
- `env.py` imports `app.models.task` and `app.models.user` explicitly so their tables
  register on `Base.metadata`, which `--autogenerate` diffs against.
- `compare_type=True` is set for both online and offline migration modes, so column
  type changes are detected by autogenerate, not just added/removed columns.

### Current migrations

| Revision | File | Description |
|---|---|---|
| `0001_initial` | `alembic/versions/0001_initial.py` | Creates `users` and `tasks` with all columns/indexes/FK described above. `down_revision = None` — this is the root migration. |

### Common commands

```bash
# Apply all pending migrations (run this after cloning, and after every pull that
# touches app/models/)
alembic upgrade head

# Roll back the most recent migration
alembic downgrade -1

# After changing a model in app/models/user.py or app/models/task.py:
alembic revision --autogenerate -m "describe the change"
alembic upgrade head
```

Run all `alembic` commands from `backend/` with the virtualenv activated (see
[RUNNING.md](./RUNNING.md)).

### Notes / gotchas

- `priority` is a plain `VARCHAR(10)`, validated only at the application layer
  (Pydantic's `Priority = Literal["low", "medium", "high"]`). Writing directly to the
  DB (or a future migration that bypasses the ORM) will not be constrained to those
  three values.
- IDs are generated client-side (Python `uuid.uuid4()`) at `mapped_column(default=...)`
  time, not by a Postgres `DEFAULT gen_random_uuid()` — so a row inserted via raw SQL
  outside the ORM would need to supply its own UUID.
- No soft-delete: `DELETE /tasks/{id}` and the chat agent's `delete_task` tool both
  perform a hard delete.
