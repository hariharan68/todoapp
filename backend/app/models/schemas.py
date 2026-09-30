from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.security import BCRYPT_MAX_BYTES

Priority = Literal["low", "medium", "high"]

# Column widths from app/models/task.py. Longer values used to reach Postgres
# and come back as a 500.
TITLE_MAX = 500
TAGS_MAX = 500
DESCRIPTION_MAX = 10_000
# Bounds on text sent to Claude: each request costs money and tokens, so an
# unbounded field lets one client run up the bill.
PARSE_TEXT_MAX = 2_000
CHAT_MESSAGE_MAX = 4_000
PASSWORD_MIN = 8


# ---------- Auth ----------
class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=PASSWORD_MIN, max_length=128)

    @field_validator("password")
    @classmethod
    def _fits_bcrypt(cls, value: str) -> str:
        if len(value.encode("utf-8")) > BCRYPT_MAX_BYTES:
            raise ValueError(
                f"Password must be at most {BCRYPT_MAX_BYTES} bytes "
                "(fewer characters if it contains emoji or non-Latin letters)."
            )
        return value


class LoginIn(BaseModel):
    email: EmailStr
    # Only bounded, not re-validated: accounts created before the 8-character
    # minimum must still be able to sign in. The cap keeps passlib from raising
    # on multi-kilobyte input.
    password: str = Field(min_length=1, max_length=128)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr


# ---------- Tasks ----------
class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=TITLE_MAX)
    description: Optional[str] = Field(default=None, max_length=DESCRIPTION_MAX)
    due_date: Optional[datetime] = None
    priority: Priority = "medium"
    tags: Optional[str] = Field(default=None, max_length=TAGS_MAX)


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=TITLE_MAX)
    description: Optional[str] = Field(default=None, max_length=DESCRIPTION_MAX)
    due_date: Optional[datetime] = None
    priority: Optional[Priority] = None
    completed: Optional[bool] = None
    tags: Optional[str] = Field(default=None, max_length=TAGS_MAX)
    is_focus: Optional[bool] = None

    @field_validator("title", "priority", "completed", "is_focus")
    @classmethod
    def _not_null(cls, value):
        # These columns are NOT NULL. Omitting a field leaves it unchanged;
        # sending an explicit null used to reach the database and 500.
        if value is None:
            raise ValueError("may be omitted but not null")
        return value


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    title: str
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    priority: Priority
    ai_priority_score: Optional[int] = None
    completed: bool
    tags: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    is_focus: bool = False  # <-- NEW


BulkTaskAction = Literal["complete", "uncomplete", "delete"]


class BulkTaskIn(BaseModel):
    ids: list[UUID] = Field(min_length=1, max_length=500)
    action: BulkTaskAction


class BulkTaskOut(BaseModel):
    # Ids that aren't the caller's simply don't match, so this can be lower
    # than len(ids) without that being an error.
    affected: int


# ---------- Parse ----------
class ParseIn(BaseModel):
    text: str = Field(min_length=1, max_length=PARSE_TEXT_MAX)


class ParsedTask(BaseModel):
    """Structured shape the parser graph extracts from free text."""

    title: str = Field(description="Short, actionable title for the task.")
    description: Optional[str] = Field(
        default=None, description="Optional longer detail, or null if none."
    )
    due_date: Optional[datetime] = Field(
        default=None,
        description="Due date/time in ISO 8601 if the text implies one, else null.",
    )
    priority: Priority = Field(
        default="medium", description="One of: low, medium, high."
    )
    tags: Optional[str] = Field(
        default=None,
        description="Optional comma-separated tags/labels, or null if none.",
    )


# ---------- Chat ----------
class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=CHAT_MESSAGE_MAX)


class ChatOut(BaseModel):
    reply: str
