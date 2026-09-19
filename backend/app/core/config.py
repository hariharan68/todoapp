import os

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration, read from environment / .env file."""

    # Database
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/todo_db"

    # Auth / JWT
    SECRET_KEY: str = "change-this-to-something-random-and-long"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days
    ALGORITHM: str = "HS256"

    # AI
    ANTHROPIC_API_KEY: str = ""
    CLAUDE_MODEL: str = "claude-sonnet-4-6"

    # CORS — the Vite dev server origin(s) allowed to call this API
    FRONTEND_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.FRONTEND_ORIGINS.split(",") if o.strip()]

    @property
    def ai_enabled(self) -> bool:
        """True only when a non-empty Anthropic API key is configured."""
        return bool(self.ANTHROPIC_API_KEY.strip())


settings = Settings()

# LangChain's ChatAnthropic reads ANTHROPIC_API_KEY from the environment.
# Wire it through explicitly so the source of truth is our Settings object
# (and a value from a .env file also reaches LangChain), not implicit magic.
if settings.ANTHROPIC_API_KEY:
    os.environ["ANTHROPIC_API_KEY"] = settings.ANTHROPIC_API_KEY
