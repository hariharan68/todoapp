"""The production guard rails in app.core.config.

These matter more than they look: a production deploy that boots with the
example SECRET_KEY lets anyone forge a token for any user id. The point of
these tests is that the failure is loud and at startup, not silent and
exploitable.
"""

import pytest

from app.core.config import INSECURE_SECRET_KEY, Settings


def _settings(**overrides) -> Settings:
    """Build Settings from explicit values only.

    `_env_file=None` keeps the developer's own backend/.env from leaking in and
    making the result depend on whose machine the suite runs on.
    """
    base = {
        "ENVIRONMENT": "production",
        "SECRET_KEY": "x" * 48,
        "DATABASE_URL": "postgresql://u:p@db:5432/todo_db",
    }
    base.update(overrides)
    return Settings(_env_file=None, **base)


class TestSecretKeyGuard:
    def test_rejects_the_example_placeholder(self):
        with pytest.raises(ValueError, match="SECRET_KEY"):
            _settings(SECRET_KEY=INSECURE_SECRET_KEY)

    def test_rejects_empty(self):
        with pytest.raises(ValueError, match="SECRET_KEY"):
            _settings(SECRET_KEY="")

    def test_rejects_too_short(self):
        with pytest.raises(ValueError, match="at least 32"):
            _settings(SECRET_KEY="short-but-not-the-placeholder")

    def test_accepts_a_long_random_key(self):
        assert _settings(SECRET_KEY="y" * 64).SECRET_KEY == "y" * 64

    def test_development_is_left_alone(self):
        """The placeholder must stay usable for local work."""
        s = Settings(
            _env_file=None,
            ENVIRONMENT="development",
            SECRET_KEY=INSECURE_SECRET_KEY,
        )
        assert s.SECRET_KEY == INSECURE_SECRET_KEY


class TestDatabaseUrlGuard:
    def test_rejects_empty_database_url(self):
        with pytest.raises(ValueError, match="DATABASE_URL"):
            _settings(DATABASE_URL="")


class TestEnvironmentDerivedDefaults:
    def test_docs_are_off_in_production(self):
        assert _settings().docs_enabled is False

    def test_docs_are_on_in_development(self):
        assert Settings(_env_file=None, ENVIRONMENT="development").docs_enabled is True

    def test_docs_can_be_forced_on(self):
        assert _settings(DOCS_ENABLED=True).docs_enabled is True

    def test_logs_are_json_in_production(self):
        assert _settings().log_json is True

    def test_chat_memory_is_shared_in_production(self):
        """Several workers must not each keep their own copy of the history."""
        assert _settings().chat_checkpointer == "postgres"

    def test_chat_memory_is_in_process_in_development(self):
        s = Settings(_env_file=None, ENVIRONMENT="development")
        assert s.chat_checkpointer == "memory"

    def test_explicit_checkpointer_overrides_the_environment(self):
        assert _settings(CHAT_CHECKPOINTER="memory").chat_checkpointer == "memory"


class TestCorsOrigins:
    def test_splits_and_strips(self):
        s = _settings(FRONTEND_ORIGINS="https://a.example , https://b.example")
        assert s.cors_origins == ["https://a.example", "https://b.example"]

    def test_empty_means_no_origins(self):
        """Same-origin deployments should not register CORS middleware at all."""
        assert _settings(FRONTEND_ORIGINS="").cors_origins == []


class TestAiGate:
    def test_disabled_without_a_key(self):
        assert _settings(ANTHROPIC_API_KEY="").ai_enabled is False

    def test_whitespace_is_not_a_key(self):
        assert _settings(ANTHROPIC_API_KEY="   ").ai_enabled is False

    def test_enabled_with_a_key(self):
        assert _settings(ANTHROPIC_API_KEY="sk-ant-test").ai_enabled is True
