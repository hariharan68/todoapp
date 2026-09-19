import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.core.config import settings

from app.core.security import decode_access_token
from app.db.database import get_db
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

_credentials_exception = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    user_id = decode_access_token(token)
    if user_id is None:
        raise _credentials_exception
    try:
        user_uuid = uuid.UUID(str(user_id))
    except (ValueError, TypeError):
        raise _credentials_exception

    user = db.get(User, user_uuid)
    if user is None:
        raise _credentials_exception
    return user

def require_ai() -> None:
    """Block AI endpoints when no API key is configured."""
    if not settings.ai_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI features are disabled on this server. "
                   "Add an ANTHROPIC_API_KEY to the backend .env to enable them.",
        )
