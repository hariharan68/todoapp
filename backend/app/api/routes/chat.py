from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.agents.chat_graph import run_chat
from app.db.database import get_db
from app.deps import get_current_user, require_ai   # <-- CHANGED: added require_ai
from app.models.schemas import ChatIn, ChatOut
from app.models.user import User

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post(
    "/",
    response_model=ChatOut,
    dependencies=[Depends(require_ai)],   # <-- CHANGED: added the gate
)
def chat(
    payload: ChatIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChatOut:
    """Send a message to the task-management agent.

    Conversation history is held server-side by LangGraph's checkpointer, keyed by
    the user's id, so the client only sends the newest message.
    """
    try:
        reply = run_chat(payload.message, str(current_user.id), db)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Chat agent failed: {exc}",
        )
    return ChatOut(reply=reply)