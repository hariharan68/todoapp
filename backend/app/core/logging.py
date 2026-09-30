"""Logging setup.

Production logs go to stdout as one JSON object per line, which is what every
container log shipper (Docker's json-file driver, Loki, CloudWatch) expects.
Development keeps a human-readable line format.

`request_id` is carried in a ContextVar so any log call made while handling a
request is automatically tagged with it, without threading the id through every
function signature.
"""

import json
import logging
import sys
from contextvars import ContextVar
from typing import Any

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)

# Attributes LogRecord always carries; anything else was passed via `extra=`
# and belongs in the JSON output.
_RESERVED = frozenset(
    logging.LogRecord("", 0, "", 0, "", None, None).__dict__
) | {
    "message",
    "asctime",
    "taskName",
    # uvicorn attaches an ANSI-coloured copy of its own message; it is noise
    # in a structured log.
    "color_message",
}


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        request_id = getattr(record, "request_id", None)
        if request_id:
            payload["request_id"] = request_id
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        for key, value in record.__dict__.items():
            if key in _RESERVED or key in payload or key == "request_id":
                continue
            try:
                json.dumps(value)
            except (TypeError, ValueError):
                value = repr(value)
            payload[key] = value

        return json.dumps(payload, default=str)


def configure_logging(level: str = "INFO", json_output: bool = False) -> None:
    """Install our handler as the single root handler.

    Uvicorn installs its own handlers on `uvicorn.error` / `uvicorn.access`.
    The error records are re-pointed at root so every line shares one format;
    the access logger is silenced because this app logs its own access lines.

    Safe to call more than once — it replaces the root handlers rather than
    adding to them, which is what lets the app lifespan re-apply it after
    uvicorn has had its turn.
    """
    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(RequestIdFilter())
    if json_output:
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s %(levelname)-8s %(name)s [%(request_id)s] %(message)s"
            )
        )

    root = logging.getLogger()
    for existing in root.handlers[:]:
        root.removeHandler(existing)
    root.addHandler(handler)
    root.setLevel(level.upper())

    for name in ("uvicorn", "uvicorn.error"):
        target = logging.getLogger(name)
        target.handlers.clear()
        target.propagate = True

    # RequestContextMiddleware already logs one access line per request, with a
    # request id and a duration. Uvicorn's own access log would duplicate every
    # one of those, so silence it here rather than relying on --no-access-log:
    # uvicorn applies its logging config after this module is imported, which
    # re-enables the logger. configure_logging() is called again from the app
    # lifespan, which runs after that, and this is what makes it stick.
    access = logging.getLogger("uvicorn.access")
    access.handlers.clear()
    access.propagate = False
    access.disabled = True

    # SQLAlchemy's own INFO level echoes every statement; keep it at WARNING
    # unless the root level is explicitly DEBUG.
    if root.level > logging.DEBUG:
        logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
