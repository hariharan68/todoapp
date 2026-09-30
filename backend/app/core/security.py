from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# bcrypt only reads the first 72 bytes of a password and silently ignores the
# rest, so two passwords sharing a 72-byte prefix are the same password. Signup
# rejects anything longer instead of storing a hash that means less than the
# user typed.
BCRYPT_MAX_BYTES = 72

TOKEN_ISSUER = "ai-todo"
TOKEN_TYPE = "access"

# Verified against when the email is unknown, so a failed login costs the same
# bcrypt work either way and response time doesn't reveal which emails exist.
_DUMMY_HASH = pwd_context.hash("timing-equaliser-not-a-real-password")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str | None) -> bool:
    """Check a password; with no hash (unknown user), burn equal time and fail."""
    if hashed_password is None:
        pwd_context.verify(plain_password, _DUMMY_HASH)
        return False
    return pwd_context.verify(plain_password, hashed_password)


@dataclass(frozen=True)
class TokenClaims:
    user_id: str
    token_version: int


def create_access_token(user_id: str, token_version: int = 0) -> str:
    """Create a signed JWT whose `sub` claim is the user's id.

    `ver` ties the token to the user's current token_version, so bumping that
    column (logout) invalidates every token issued before it.
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "ver": token_version,
        "type": TOKEN_TYPE,
        "iss": TOKEN_ISSUER,
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> TokenClaims | None:
    """Return the claims from a valid token, or None if invalid/expired.

    `exp`, `iat` and `sub` are required: python-jose only checks `exp` when it
    is present, so without this a token minted with no expiry is valid forever.
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            issuer=TOKEN_ISSUER,
            options={"require_exp": True, "require_iat": True, "require_sub": True},
        )
    except JWTError:
        return None
    if payload.get("type") != TOKEN_TYPE:
        return None
    user_id = payload.get("sub")
    version = payload.get("ver")
    if not isinstance(user_id, str) or not isinstance(version, int):
        return None
    return TokenClaims(user_id=user_id, token_version=version)
