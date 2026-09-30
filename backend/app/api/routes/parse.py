from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.agents.parser_graph import parse_task_text
from app.core.errors import upstream_error
from app.db.database import get_db
from app.deps import get_current_user, require_ai   # <-- CHANGED: added require_ai
from app.models.schemas import ParsedTask, ParseIn, TaskOut
from app.models.task import Task
from app.models.user import User

router = APIRouter(prefix="/parse", tags=["parse"])


def _run_parser(text: str) -> ParsedTask:
    try:
        return parse_task_text(text)
    except Exception as exc:  # surface AI/config errors as a clean 502
        raise upstream_error(exc, operation="Task text parsing") from exc


@router.post(
    "/preview",
    response_model=ParsedTask,
    dependencies=[Depends(require_ai)],   # <-- CHANGED: added the gate
)
def preview_parse(
    payload: ParseIn,
    current_user: User = Depends(get_current_user),
) -> ParsedTask:
    """Parse free text into a structured task without persisting it."""
    return _run_parser(payload.text)


@router.post(
    "/",
    response_model=TaskOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_ai)],   # <-- CHANGED: added the gate
)
def parse_and_create(
    payload: ParseIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Task:
    """Parse free text and persist the resulting task for the current user."""
    parsed = _run_parser(payload.text)
    task = Task(
        user_id=current_user.id,
        title=parsed.title,
        description=parsed.description,
        due_date=parsed.due_date,
        priority=parsed.priority,
        tags=parsed.tags,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task