"""Turning internal failures into safe client responses.

Raw exception text from the AI stack can carry request payloads, upstream URLs,
provider error bodies and — in the worst case — fragments of credentials. In
production the client gets a fixed sentence and the detail goes to the log,
correlated by request id. Development keeps the detail inline, because that is
where you actually want it.
"""

import logging

from fastapi import HTTPException, status

from app.core.config import settings

logger = logging.getLogger("app.errors")

UPSTREAM_MESSAGE = (
    "The AI service failed to handle this request. Please try again; if it keeps "
    "happening, check the server logs."
)


def upstream_error(exc: Exception, *, operation: str) -> HTTPException:
    """Log `exc` and return the 502 to raise back to the client.

    Returns rather than raises so callers keep an explicit `raise`, which
    preserves the exception chain and keeps control flow obvious.
    """
    logger.exception("%s failed", operation, extra={"operation": operation})
    detail = (
        UPSTREAM_MESSAGE
        if settings.is_production
        else f"{operation} failed: {type(exc).__name__}: {exc}"
    )
    return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)
