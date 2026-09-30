import os
import secrets
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# The placeholder shipped in .env.example. Refusing to boot production with this
# value is the single most important guard here: a known signing key lets anyone
# mint a valid token for any user id.
INSECURE_SECRET_KEY = "change-this-to-something-random-and-long"

MIN_SECRET_KEY_LENGTH = 32


class Settings(BaseSettings):
    """Application configuration, read from environment / .env file."""

    # Deployment
    ENVIRONMENT: Literal["development", "production"] = "development"
    LOG_LEVEL: str = "INFO"
    # Emit one JSON object per log line. Left off in development, where the
    # human-readable formatter is easier to read.
    LOG_JSON: bool | None = None

    # Database
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/todo_db"
    DB_POOL_SIZE: int = Field(default=5, ge=1)
    DB_MAX_OVERFLOW: int = Field(default=10, ge=0)
    DB_POOL_TIMEOUT: int = Field(default=30, ge=1)
    # Recycle connections before a proxy or Postgres itself drops them. 30 min
    # is comfortably under the common 1 hour idle timeouts.
    DB_POOL_RECYCLE: int = Field(default=1800, ge=-1)

    # Auth / JWT
    SECRET_KEY: str = INSECURE_SECRET_KEY
    # 7 days by default; capped at 30 days. POST /auth/logout revokes early.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=10080, ge=5, le=43200)
    # HMAC only. A free-form string would accept "none" or an RSA algorithm
    # name with a shared secret, both of which break signature checking.
    ALGORITHM: Literal["HS256", "HS384", "HS512"] = "HS256"

    # AI
    ANTHROPIC_API_KEY: str = ""
    CLAUDE_MODEL: str = "claude-sonnet-4-6"

    # Where the chat agent keeps per-user conversation history.
    #   memory   - in-process; fast, but each worker has its own copy and a
    #              restart wipes it. Fine for a single-worker dev server.
    #   postgres - shared table; survives restarts and is correct when more
    #              than one worker serves requests.
    #   auto     - postgres in production, memory in development.
    CHAT_CHECKPOINTER: Literal["auto", "memory", "postgres"] = "auto"

    # CORS — origin(s) allowed to call this API. Not needed when the frontend is
    # served from the same origin and proxies /api to this service (the
    # production compose setup), but kept for split-origin deployments.
    FRONTEND_ORIGINS: str = "http://localhost:5180,http://127.0.0.1:5180"

    # Interactive API docs. Off in production by default — /docs hands an
    # attacker a complete map of the API surface.
    DOCS_ENABLED: bool | None = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ---------- derived ----------

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.FRONTEND_ORIGINS.split(",") if o.strip()]

    @property
    def ai_enabled(self) -> bool:
        """True only when a non-empty Anthropic API key is configured."""
        return bool(self.ANTHROPIC_API_KEY.strip())

    @property
    def docs_enabled(self) -> bool:
        if self.DOCS_ENABLED is not None:
            return self.DOCS_ENABLED
        return not self.is_production

    @property
    def log_json(self) -> bool:
        if self.LOG_JSON is not None:
            return self.LOG_JSON
        return self.is_production

    @property
    def chat_checkpointer(self) -> Literal["memory", "postgres"]:
        if self.CHAT_CHECKPOINTER != "auto":
            return self.CHAT_CHECKPOINTER  # type: ignore[return-value]
        return "postgres" if self.is_production else "memory"

    # ---------- validation ----------

    @model_validator(mode="after")
    def _check_production_safety(self) -> "Settings":
        """Fail fast rather than serve production with a known-bad config."""
        if not self.is_production:
            return self

        problems: list[str] = []

        if self.SECRET_KEY.strip() in ("", INSECURE_SECRET_KEY):
            problems.append(
                "SECRET_KEY is unset or still the example placeholder. Generate one "
                'with: python -c "import secrets; print(secrets.token_urlsafe(48))"'
            )
        elif len(self.SECRET_KEY) < MIN_SECRET_KEY_LENGTH:
            problems.append(
                f"SECRET_KEY must be at least {MIN_SECRET_KEY_LENGTH} characters "
                f"(got {len(self.SECRET_KEY)})."
            )

        if not self.DATABASE_URL.strip():
            problems.append("DATABASE_URL is empty.")

        if problems:
            raise ValueError(
                "Refusing to start in ENVIRONMENT=production:\n  - "
                + "\n  - ".join(problems)
            )
        return self


def _build_settings() -> Settings:
    return Settings()


settings = _build_settings()

# LangChain's ChatAnthropic reads ANTHROPIC_API_KEY from the environment.
# Wire it through explicitly so the source of truth is our Settings object
# (and a value from a .env file also reaches LangChain), not implicit magic.
if settings.ANTHROPIC_API_KEY:
    os.environ["ANTHROPIC_API_KEY"] = settings.ANTHROPIC_API_KEY


def generate_secret_key() -> str:
    """Helper for `python -m app.core.config` to print a fresh SECRET_KEY."""
    return secrets.token_urlsafe(48)


if __name__ == "__main__":
    print(generate_secret_key())
