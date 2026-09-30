"""Where the chat agent's per-user conversation history lives.

`MemorySaver` keeps history in the process that handled the request. Production
runs several uvicorn workers, so the same user's next message usually lands on a
different worker with no memory of the conversation — and every deploy wipes it.
`PostgresSaver` puts the history in the database all workers share.

The table is created by `python -m app.agents.checkpointer setup`, run once from
the container entrypoint before the workers start. Doing it there rather than in
each worker avoids several processes racing to run the same DDL.
"""

import logging
import threading
from typing import TYPE_CHECKING

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import MemorySaver

from app.core.config import settings

if TYPE_CHECKING:
    from psycopg_pool import ConnectionPool

logger = logging.getLogger("app.agents.checkpointer")

_lock = threading.Lock()
_checkpointer: BaseCheckpointSaver | None = None
_pool: "ConnectionPool | None" = None


def _build_postgres_pool() -> "ConnectionPool":
    from psycopg.rows import dict_row
    from psycopg_pool import ConnectionPool

    # PostgresSaver requires autocommit and dict rows, and server-side prepared
    # statements must be off to stay compatible with transaction poolers
    # (PgBouncer) sitting in front of Postgres.
    pool = ConnectionPool(
        conninfo=settings.DATABASE_URL,
        min_size=1,
        max_size=settings.DB_POOL_SIZE,
        kwargs={
            "autocommit": True,
            "prepare_threshold": 0,
            "row_factory": dict_row,
        },
        open=False,
    )
    pool.open()
    return pool


def get_checkpointer() -> BaseCheckpointSaver:
    """Return the process-wide checkpointer, building it on first use.

    If the Postgres checkpointer is selected but cannot be reached, chat falls
    back to in-process memory and logs loudly rather than failing the request —
    a degraded chat beats a broken one.
    """
    global _checkpointer, _pool

    if _checkpointer is not None:
        return _checkpointer

    with _lock:
        if _checkpointer is not None:
            return _checkpointer

        if settings.chat_checkpointer == "memory":
            logger.info("chat history: in-process MemorySaver")
            _checkpointer = MemorySaver()
            return _checkpointer

        try:
            from langgraph.checkpoint.postgres import PostgresSaver

            _pool = _build_postgres_pool()
            _checkpointer = PostgresSaver(_pool)
            logger.info("chat history: PostgresSaver")
        except Exception:
            logger.exception(
                "PostgresSaver unavailable; falling back to in-process chat "
                "history. Conversations will not survive restarts and will be "
                "inconsistent across workers."
            )
            _checkpointer = MemorySaver()

        return _checkpointer


def close_checkpointer() -> None:
    """Release the checkpointer's connection pool at shutdown."""
    global _checkpointer, _pool
    if _pool is not None:
        _pool.close()
        _pool = None
    _checkpointer = None


def setup() -> None:
    """Create the checkpoint tables. Idempotent; run once per deploy."""
    if settings.chat_checkpointer != "postgres":
        logger.info(
            "CHAT_CHECKPOINTER resolves to 'memory'; no checkpoint tables needed."
        )
        return

    from langgraph.checkpoint.postgres import PostgresSaver

    pool = _build_postgres_pool()
    try:
        PostgresSaver(pool).setup()
        logger.info("chat checkpoint tables are up to date")
    finally:
        pool.close()


if __name__ == "__main__":
    import sys

    from app.core.logging import configure_logging

    configure_logging(settings.LOG_LEVEL, json_output=settings.log_json)

    if len(sys.argv) > 1 and sys.argv[1] != "setup":
        print("usage: python -m app.agents.checkpointer [setup]", file=sys.stderr)
        raise SystemExit(2)
    setup()
