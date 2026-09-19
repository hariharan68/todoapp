from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.prioritizer_graph import prioritize_tasks
from app.db.database import get_db
from app.deps import get_current_user, require_ai   # <-- CHANGED: added require_ai
from app.models.schemas import TaskOut
from app.models.task import Task
from app.models.user import User

router = APIRouter(prefix="/prioritize", tags=["prioritize"])


@router.post(
    "/",
    response_model=list[TaskOut],
    dependencies=[Depends(require_ai)],   # <-- CHANGED: added the gate
)
def prioritize(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Task]:
    """Score the current user's incomplete tasks and store the AI priority scores."""
    tasks = list(
        db.scalars(
            select(Task)
            .where(Task.user_id == current_user.id, Task.completed.is_(False))
            .order_by(Task.created_at.desc())
        ).all()
    )
    if not tasks:
        return []

    payload = [
        {
            "id": str(t.id),
            "title": t.title,
            "description": t.description,
            "priority": t.priority,
            "due_date": t.due_date.isoformat() if t.due_date else None,
        }
        for t in tasks
    ]

    try:
        scores = prioritize_tasks(payload)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to prioritize tasks: {exc}",
        )

    for task in tasks:
        score = scores.get(str(task.id))
        if score is not None:
            task.ai_priority_score = int(score)
    db.commit()
    for task in tasks:
        db.refresh(task)

    tasks.sort(key=lambda t: (t.ai_priority_score or -1), reverse=True)
    return tasks