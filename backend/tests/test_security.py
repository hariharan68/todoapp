"""Regression tests for the auth and input-validation hardening."""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from jose import jwt

from app.core.config import settings
from app.core.security import create_access_token, verify_password


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _user_id(client, auth) -> str:
    return client.get("/auth/me", headers=auth).json()["id"]


def _mint(claims: dict, key: str | None = None) -> str:
    return jwt.encode(claims, key or settings.SECRET_KEY, algorithm="HS256")


@pytest.fixture
def lenient(client):
    """A client that returns 500s instead of raising, so they can be asserted."""
    return TestClient(client.app, raise_server_exceptions=False)


class TestTokenValidation:
    def test_token_without_expiry_is_rejected(self, client, auth):
        uid = _user_id(client, auth)
        now = datetime.now(timezone.utc)
        token = _mint({"sub": uid, "ver": 0, "type": "access", "iss": "ai-todo", "iat": now})
        assert client.get("/auth/me", headers=_bearer(token)).status_code == 401

    def test_expired_token_is_rejected(self, client, auth):
        uid = _user_id(client, auth)
        past = datetime.now(timezone.utc) - timedelta(hours=1)
        token = _mint({"sub": uid, "ver": 0, "type": "access", "iss": "ai-todo",
                       "iat": past, "exp": past})
        assert client.get("/auth/me", headers=_bearer(token)).status_code == 401

    def test_wrong_signing_key_is_rejected(self, client, auth):
        uid = _user_id(client, auth)
        now = datetime.now(timezone.utc)
        token = _mint({"sub": uid, "ver": 0, "type": "access", "iss": "ai-todo",
                       "iat": now, "exp": now + timedelta(hours=1)}, key="x" * 48)
        assert client.get("/auth/me", headers=_bearer(token)).status_code == 401

    def test_alg_none_is_rejected(self, client, auth):
        uid = _user_id(client, auth)
        import base64, json

        def b64(d):
            return base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b"=").decode()

        exp = int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp())
        token = b64({"alg": "none", "typ": "JWT"}) + "." + b64(
            {"sub": uid, "ver": 0, "type": "access", "iss": "ai-todo", "iat": exp - 60, "exp": exp}
        ) + "."
        assert client.get("/auth/me", headers=_bearer(token)).status_code == 401

    def test_wrong_issuer_is_rejected(self, client, auth):
        uid = _user_id(client, auth)
        now = datetime.now(timezone.utc)
        token = _mint({"sub": uid, "ver": 0, "type": "access", "iss": "someone-else",
                       "iat": now, "exp": now + timedelta(hours=1)})
        assert client.get("/auth/me", headers=_bearer(token)).status_code == 401

    def test_garbage_subject_is_rejected(self, client, auth):
        token = create_access_token("not-a-uuid")
        assert client.get("/auth/me", headers=_bearer(token)).status_code == 401


class TestLogoutRevokesTokens:
    def test_logout_invalidates_the_token(self, client, auth):
        assert client.post("/auth/logout", headers=auth).status_code == 204
        assert client.get("/auth/me", headers=auth).status_code == 401

    def test_logout_revokes_every_session(self, client, auth):
        second = _bearer(
            client.post("/auth/login", json={"email": "primary@example.com",
                                             "password": "secret123"}).json()["access_token"]
        )
        client.post("/auth/logout", headers=auth)
        assert client.get("/tasks/", headers=second).status_code == 401

    def test_logging_in_again_after_logout_works(self, client, auth):
        client.post("/auth/logout", headers=auth)
        res = client.post("/auth/login", json={"email": "primary@example.com",
                                               "password": "secret123"})
        assert client.get("/auth/me", headers=_bearer(res.json()["access_token"])).status_code == 200

    def test_logout_requires_auth(self, client):
        assert client.post("/auth/logout").status_code == 401


class TestPasswords:
    def test_short_password_rejected(self, client):
        res = client.post("/auth/signup", json={"email": "a@example.com", "password": "short7!"})
        assert res.status_code == 422

    def test_password_over_bcrypt_limit_rejected(self, client):
        # 73 bytes: bcrypt would silently drop the last one.
        res = client.post("/auth/signup", json={"email": "a@example.com", "password": "a" * 73})
        assert res.status_code == 422

    def test_multibyte_password_counted_in_bytes(self, client):
        # 20 characters, 80 bytes.
        res = client.post("/auth/signup", json={"email": "a@example.com", "password": "é" * 20 + "😀" * 10})
        assert res.status_code == 422

    def test_huge_login_password_is_422_not_500(self, lenient):
        res = lenient.post("/auth/login", json={"email": "a@example.com", "password": "b" * 100_000})
        assert res.status_code == 422

    def test_unknown_email_still_runs_bcrypt(self, monkeypatch):
        """Timing: an unknown email must cost the same hash work as a known one."""
        from app.core import security

        calls = []
        real = security.pwd_context.verify
        monkeypatch.setattr(security.pwd_context, "verify",
                            lambda *a, **k: calls.append(1) or real(*a, **k))
        assert verify_password("anything", None) is False
        assert calls == [1]

    def test_login_error_is_identical_for_unknown_and_wrong(self, client, auth):
        wrong = client.post("/auth/login", json={"email": "primary@example.com", "password": "wrongpass"})
        unknown = client.post("/auth/login", json={"email": "nobody@example.com", "password": "wrongpass"})
        assert wrong.status_code == unknown.status_code == 401
        assert wrong.json() == unknown.json()


class TestInputLimits:
    @pytest.mark.parametrize("field", ["title", "priority", "completed", "is_focus"])
    def test_explicit_null_on_required_field_is_422(self, lenient, auth, field):
        task = lenient.post("/tasks/", json={"title": "x"}, headers=auth).json()
        res = lenient.patch(f"/tasks/{task['id']}", json={field: None}, headers=auth)
        assert res.status_code == 422

    def test_nullable_fields_can_still_be_cleared(self, client, auth):
        task = client.post("/tasks/", json={"title": "x", "description": "d", "tags": "t"},
                           headers=auth).json()
        res = client.patch(f"/tasks/{task['id']}",
                           json={"description": None, "tags": None, "due_date": None}, headers=auth)
        assert res.status_code == 200
        assert res.json()["description"] is None and res.json()["tags"] is None

    def test_overlong_tags_is_422_not_500(self, lenient, auth):
        res = lenient.post("/tasks/", json={"title": "x", "tags": "a" * 501}, headers=auth)
        assert res.status_code == 422

    def test_overlong_description_is_422(self, client, auth):
        res = client.post("/tasks/", json={"title": "x", "description": "a" * 10_001}, headers=auth)
        assert res.status_code == 422

    def test_ai_inputs_are_bounded(self):
        from pydantic import ValidationError

        from app.models.schemas import ChatIn, ParseIn

        with pytest.raises(ValidationError):
            ParseIn(text="a" * 2_001)
        with pytest.raises(ValidationError):
            ChatIn(message="a" * 4_001)


class TestAgentToolClamping:
    def test_create_task_tool_clamps_model_output(self, client, auth):
        import uuid

        from app.agents.tools import make_tools
        from app.db.database import SessionLocal

        uid = uuid.UUID(_user_id(client, auth))
        with SessionLocal() as db:
            create = make_tools(db, uid)[0]
            create.invoke({"title": "t" * 900, "tags": "g" * 900})
        task = client.get("/tasks/", headers=auth).json()[0]
        assert len(task["title"]) == 500 and len(task["tags"]) == 500


class TestConfigGuards:
    def test_non_hmac_algorithm_is_rejected(self):
        from pydantic import ValidationError

        from app.core.config import Settings

        with pytest.raises(ValidationError):
            Settings(ALGORITHM="none")
