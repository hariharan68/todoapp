from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

Priority = Literal["low", "medium", "high"]


# ---------- Auth ----------
class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr


# ---------- Tasks ----------
class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    priority: Priority = "medium"
    tags: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=500)
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    priority: Optional[Priority] = None
    completed: Optional[bool] = None
    tags: Optional[str] = None


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


# ---------- Parse ----------
class ParseIn(BaseModel):
    text: str = Field(min_length=1)


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
    message: str = Field(min_length=1)


class ChatOut(BaseModel):
    reply: str
