"""Test fixtures.

The test database is built by running the Alembic chain, not
Base.metadata.create_all(). That distinction is the whole point: create_all()
reads the ORM models, so it would happily produce a database containing every
column the models declare -- including one no migration ever adds -- and the
suite would pass green while production 500s. Tests must exercise the same
migrations production runs.
"""

import os
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import psycopg2
import pytest
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

BACKEND_DIR = Path(__file__).resolve().parent.parent
TEST_DB_NAME = "todo_test"


def _source_url() -> str:
    """The app's configured URL, read before app.core.config is imported."""
    from dotenv import dotenv_values

    env = dotenv_values(BACKEND_DIR / ".env")
    return env.get("DATABASE_URL") or os.environ.get(
        "DATABASE_URL", "postgresql://postgres:postgres@localhost:5434/todo_db"
    )


def _swap_database(url: str, name: str) -> str:
    parts = urlsplit(url)
    return urlunsplit(parts._replace(path=f"/{name}"))


TEST_DATABASE_URL = _swap_database(_source_url(), TEST_DB_NAME)

# Must be set before anything imports app.core.config, which builds its
# Settings singleton -- and app.db.database, which builds the engine -- at
# import time. Real env vars outrank the .env file in pydantic-settings.
os.environ["DATABASE_URL"] = TEST_DATABASE_URL


def _recreate_test_database() -> None:
    admin_url = _swap_database(_source_url(), "postgres")
    conn = psycopg2.connect(admin_url)
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                "WHERE datname = %s AND pid <> pg_backend_pid()",
                (TEST_DB_NAME,),
            )
            cur.execute(f'DROP DATABASE IF EXISTS "{TEST_DB_NAME}"')
            cur.execute(f'CREATE DATABASE "{TEST_DB_NAME}"')
    finally:
        conn.close()


@pytest.fixture(scope="session", autouse=True)
def migrated_database():
    from alembic import command
    from alembic.config import Config

    _recreate_test_database()

    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", TEST_DATABASE_URL)
    command.upgrade(cfg, "head")

    yield TEST_DATABASE_URL


@pytest.fixture(autouse=True)
def clean_tables(migrated_database):
    """Each test starts from an empty database.

    TRUNCATE ... CASCADE rather than a transaction rollback, because TestClient
    runs the app's own sessions and they commit for real.
    """
    from sqlalchemy import text

    from app.db.database import engine

    yield
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE tasks, users RESTART IDENTITY CASCADE"))


@pytest.fixture
def client(migrated_database):
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        yield c


def _register(client, email: str) -> dict[str, str]:
    res = client.post("/auth/signup", json={"email": email, "password": "secret123"})
    assert res.status_code == 201, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


@pytest.fixture
def auth(client):
    """Headers for a signed-up user."""
    return _register(client, "primary@example.com")


@pytest.fixture
def other_auth(client):
    """Headers for a second user, to prove per-user isolation."""
    return _register(client, "other@example.com")
