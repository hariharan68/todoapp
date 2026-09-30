"""LangChain tools for the chat agent.

`make_tools(db, user_id)` returns a fresh set of tools closed over a specific DB
session and user id. Because every query is filtered by that `user_id`, the agent
can never read or mutate another user's tasks.
"""

import uuid
from datetime import datetime
from typing import Optional

from langchain_core.tools import tool
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.schemas import DESCRIPTION_MAX, TAGS_MAX, TITLE_MAX
from app.models.task import Task


def _parse_due_date(due_date: Optional[str]) -> Optional[datetime]:
    if not due_date:
        return None
    try:
        return datetime.fromisoformat(due_date)
    except ValueError:
        return None


def make_tools(db: Session, user_id: uuid.UUID):
    """Build user- and session-scoped tools for the chat agent."""

    def _get_owned_task(task_id: str) -> Optional[Task]:
        try:
            tid = uuid.UUID(str(task_id))
        except (ValueError, TypeError):
            return None
        return db.scalar(
            select(Task).where(Task.id == tid, Task.user_id == user_id)
        )

    @tool
    def create_task(
        title: str,
        description: Optional[str] = None,
        due_date: Optional[str] = None,
        priority: str = "medium",
        tags: Optional[str] = None,
    ) -> str:
        """Create a new task for the current user.

        Args:
            title: Short actionable title (required).
            description: Optional longer detail.
            due_date: Optional ISO 8601 date/time string (e.g. 2026-09-10T17:00:00).
            priority: One of "low", "medium", "high". Defaults to "medium".
            tags: Optional comma-separated tags.
        """
        if priority not in ("low", "medium", "high"):
            priority = "medium"
        # Arguments come from the model, so clamp them to the column widths
        # rather than let an over-long value fail the insert.
        task = Task(
            user_id=user_id,
            title=(title or "Untitled task")[:TITLE_MAX],
            description=description[:DESCRIPTION_MAX] if description else None,
            due_date=_parse_due_date(due_date),
            priority=priority,
            tags=tags[:TAGS_MAX] if tags else None,
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        return f'Created task "{task.title}" (id={task.id}).'

    @tool
    def list_tasks(completed: Optional[bool] = None) -> str:
        """List the current user's tasks.

        Args:
            completed: Optionally filter — True for done, False for open, None for all.
        """
        stmt = select(Task).where(Task.user_id == user_id)
        if completed is not None:
            stmt = stmt.where(Task.completed == completed)
        stmt = stmt.order_by(Task.created_at.desc())
        tasks = db.scalars(stmt).all()
        if not tasks:
            return "No tasks found."
        lines = []
        for t in tasks:
            status = "done" if t.completed else "open"
            due = t.due_date.isoformat() if t.due_date else "no due date"
            lines.append(
                f"- id={t.id} | {t.title} | priority={t.priority} | "
                f"{status} | due: {due}"
            )
        return "\n".join(lines)

    @tool
    def complete_task(task_id: str) -> str:
        """Mark one of the current user's tasks as completed.

        Args:
            task_id: The id of the task to complete.
        """
        task = _get_owned_task(task_id)
        if task is None:
            return f"No task found with id {task_id}."
        task.completed = True
        db.commit()
        return f'Marked task "{task.title}" as completed.'

    @tool
    def delete_task(task_id: str) -> str:
        """Delete one of the current user's tasks.

        Args:
            task_id: The id of the task to delete.
        """
        task = _get_owned_task(task_id)
        if task is None:
            return f"No task found with id {task_id}."
        title = task.title
        db.delete(task)
        db.commit()
        return f'Deleted task "{title}".'

    return [create_task, list_tasks, complete_task, delete_task]
