import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.deps import get_current_user
from app.models.schemas import (
    BulkTaskIn,
    BulkTaskOut,
    TaskCreate,
    TaskOut,
    TaskUpdate,
)
from app.models.task import Task
from app.models.user import User

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _get_owned_task_or_404(task_id: uuid.UUID, user: User, db: Session) -> Task:
    task = db.scalar(
        select(Task).where(Task.id == task_id, Task.user_id == user.id)
    )
    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Task not found."
        )
    return task


@router.get("/", response_model=list[TaskOut])
def list_tasks(
    completed: Optional[bool] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Task]:
    stmt = select(Task).where(Task.user_id == current_user.id)
    if completed is not None:
        stmt = stmt.where(Task.completed == completed)
    stmt = stmt.order_by(Task.created_at.desc())
    return list(db.scalars(stmt).all())


@router.post("/", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Task:
    task = Task(user_id=current_user.id, **payload.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.post("/bulk", response_model=BulkTaskOut)
def bulk_update_tasks(
    payload: BulkTaskIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BulkTaskOut:
    """Complete, reopen, or delete many of the caller's tasks in one statement.

    Declared above the /{task_id} routes so "bulk" is never parsed as a task id.
    Ownership is enforced by the user_id predicate rather than a per-id 404, so
    another user's ids are silently skipped instead of being confirmed to exist.
    """
    owned = (Task.user_id == current_user.id, Task.id.in_(payload.ids))

    if payload.action == "delete":
        stmt = delete(Task).where(*owned)
    else:
        # A Core UPDATE bypasses the ORM, so updated_at's onupdate=func.now()
        # never fires — set it explicitly or the rows keep a stale timestamp.
        stmt = (
            update(Task)
            .where(*owned)
            .values(completed=payload.action == "complete", updated_at=func.now())
        )

    result = db.execute(stmt.execution_options(synchronize_session=False))
    db.commit()
    return BulkTaskOut(affected=result.rowcount)


@router.get("/{task_id}", response_model=TaskOut)
def get_task(
    task_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Task:
    return _get_owned_task_or_404(task_id, current_user, db)


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(
    task_id: uuid.UUID,
    payload: TaskUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Task:
    task = _get_owned_task_or_404(task_id, current_user, db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(task, field, value)
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    task = _get_owned_task_or_404(task_id, current_user, db)
    db.delete(task)
    db.commit()
