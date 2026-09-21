"""Guards the failure that took the task list down.

`is_focus` was declared on the Task model, exposed in the schemas, and used by
the UI -- but the migration adding it sat outside alembic/versions/ and so never
ran. Every GET /tasks/ raised UndefinedColumn. This compares the migrated
database against the ORM metadata and fails on any such divergence.
"""

from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext

from app.db.database import Base, engine

# Imported for their side effect: registering the tables on Base.metadata.
from app.models import task as _task  # noqa: F401
from app.models import user as _user  # noqa: F401


def test_models_match_migrations():
    with engine.connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn), Base.metadata)

    assert diff == [], (
        "The ORM models and the Alembic migrations disagree. Every model change "
        "needs a migration in backend/alembic/versions/.\n"
        f"Divergences: {diff}"
    )


def test_is_focus_column_exists():
    """The specific regression, named, so a failure reads unambiguously."""
    from sqlalchemy import inspect

    columns = {c["name"] for c in inspect(engine).get_columns("tasks")}
    assert "is_focus" in columns
