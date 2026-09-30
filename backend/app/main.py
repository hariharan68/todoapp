import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.agents.checkpointer import close_checkpointer
from app.api.routes import auth, chat, parse, prioritize, tasks
from app.core.config import settings
from app.core.logging import configure_logging, request_id_var
from app.core.middleware import RequestContextMiddleware, SecurityHeadersMiddleware
from app.db.database import engine

configure_logging(settings.LOG_LEVEL, json_output=settings.log_json)
logger = logging.getLogger("app.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Re-applied here because uvicorn installs its own logging config after
    # this module is imported, undoing the call below. Lifespan startup runs
    # after that, so this is the version that survives.
    configure_logging(settings.LOG_LEVEL, json_output=settings.log_json)
    logger.info(
        "starting up",
        extra={
            "environment": settings.ENVIRONMENT,
            "ai_enabled": settings.ai_enabled,
            "chat_checkpointer": settings.chat_checkpointer,
            "docs_enabled": settings.docs_enabled,
        },
    )
    yield
    close_checkpointer()
    engine.dispose()
    logger.info("shutdown complete")


app = FastAPI(
    title="AI Todo App",
    version="1.0.0",
    lifespan=lifespan,
    # Hiding the schema in production keeps the full API surface, including
    # request shapes, from being self-documenting to anyone who finds the host.
    docs_url="/docs" if settings.docs_enabled else None,
    redoc_url="/redoc" if settings.docs_enabled else None,
    openapi_url="/openapi.json" if settings.docs_enabled else None,
)

# Order matters: middleware added last runs first. Request ids should be set
# before anything else so every downstream log line carries one.
app.add_middleware(SecurityHeadersMiddleware, hsts=settings.is_production)
app.add_middleware(RequestContextMiddleware)

if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Last line of defence: never let a traceback reach the client.

    Starlette's default would return the stack trace when debug is on. The
    request id in the body is what ties a user's report to the logged detail.
    """
    logger.exception(
        "unhandled exception",
        extra={"method": request.method, "path": request.url.path},
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "Internal server error.",
            "request_id": request_id_var.get(),
        },
    )


app.include_router(auth.router)
app.include_router(tasks.router)
app.include_router(parse.router)
app.include_router(prioritize.router)
app.include_router(chat.router)


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    """Liveness: the process is up. Deliberately touches nothing else.

    A liveness probe that checks the database would restart healthy API
    containers whenever Postgres hiccups.
    """
    return {"status": "ok"}


@app.get("/health/ready", tags=["health"])
def readiness() -> JSONResponse:
    """Readiness: the process can actually serve traffic (database reachable)."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        logger.exception("readiness check failed: database unreachable")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "unavailable", "database": "unreachable"},
        )
    return JSONResponse(content={"status": "ready", "database": "ok"})


@app.get("/config", tags=["config"])
def config() -> dict[str, bool]:
    """Public flag the frontend uses to decide which features to show."""
    return {"ai_enabled": settings.ai_enabled}
