"""Cross-cutting HTTP middleware: request ids, access logs, security headers."""

import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

from app.core.logging import request_id_var

access_logger = logging.getLogger("app.access")

REQUEST_ID_HEADER = "X-Request-ID"

# Sent on every API response. The API serves JSON to a separate origin, so the
# page-oriented headers (CSP, frame options) matter less here than on the
# frontend's nginx — but a stray HTML error page or a browser opening /docs
# should still be constrained.
_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Opener-Policy": "same-origin",
}


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Assign each request an id, log its outcome, and time it.

    An inbound X-Request-ID is trusted and reused so a trace started at the
    reverse proxy stays joined up; otherwise a fresh id is generated.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        incoming = request.headers.get(REQUEST_ID_HEADER, "").strip()
        request_id = incoming[:128] or uuid.uuid4().hex
        token = request_id_var.set(request_id)
        started = time.perf_counter()

        try:
            response = await call_next(request)
        except Exception:
            # The exception handler installed on the app turns this into a 500
            # response; log it here so the access line is never missing.
            access_logger.exception(
                "request failed",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "duration_ms": round((time.perf_counter() - started) * 1000, 2),
                },
            )
            # Deliberately not reset: the app-level exception handler runs
            # after this and reads the id to return it to the client. Each
            # request gets its own context, so the value cannot leak.
            raise

        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        response.headers[REQUEST_ID_HEADER] = request_id
        access_logger.info(
            "%s %s -> %s",
            request.method,
            request.url.path,
            response.status_code,
            extra={
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": duration_ms,
            },
        )
        request_id_var.reset(token)
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, hsts: bool = False) -> None:
        super().__init__(app)
        self.hsts = hsts

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        for header, value in _SECURITY_HEADERS.items():
            response.headers.setdefault(header, value)
        # Only meaningful once traffic is actually HTTPS; enabling it over plain
        # HTTP would pin browsers to a scheme the server can't serve.
        if self.hsts:
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        return response
