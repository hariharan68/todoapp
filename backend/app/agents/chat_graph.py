"""Conversational task-management agent, built as a LangGraph ReAct loop.

`langgraph.prebuilt.create_react_agent` wires the standard agent -> tools -> agent
loop for us. A module-level `MemorySaver` checkpointer holds each user's conversation
history server-side, keyed by `thread_id = user_id`, so the frontend only ever sends
the newest message — never the full history.

The tools are rebuilt per request (bound to the request's DB session and user id via
`make_tools`), while the checkpointer is shared across requests so memory persists.
"""

import uuid

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, HumanMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import create_react_agent
from sqlalchemy.orm import Session

from app.agents.tools import make_tools
from app.core.config import settings

# Shared, in-process conversation memory. Keyed by thread_id (the user id), it
# survives across requests but resets when the backend process restarts.
# Swap for a persistent checkpointer (e.g. PostgresSaver) to survive restarts.
_checkpointer = MemorySaver()

_SYSTEM_PROMPT = (
    "You are a helpful assistant that manages the user's personal to-do list. "
    "You can create, list, complete, and delete tasks using the provided tools. "
    "When the user asks you to change their tasks, use the tools rather than just "
    "describing what to do. When you need a task's id (to complete or delete it), "
    "list the tasks first to find it. Confirm what you did in a short, friendly reply."
)


def _extract_text(message: AIMessage) -> str:
    """Anthropic messages may carry content as a string or a list of blocks."""
    content = message.content
    if isinstance(content, str):
        return content
    parts: list[str] = []
    for block in content:
        if isinstance(block, str):
            parts.append(block)
        elif isinstance(block, dict) and block.get("type") == "text":
            parts.append(block.get("text", ""))
    return "".join(parts).strip()


def run_chat(user_message: str, user_id: str, db: Session) -> str:
    """Send one user message to the agent and return the final AI reply text."""
    user_uuid = user_id if isinstance(user_id, uuid.UUID) else uuid.UUID(str(user_id))

    llm = ChatAnthropic(model=settings.CLAUDE_MODEL, temperature=0)
    tools = make_tools(db, user_uuid)
    agent = create_react_agent(
        llm,
        tools=tools,
        prompt=_SYSTEM_PROMPT,
        checkpointer=_checkpointer,
    )

    result = agent.invoke(
        {"messages": [HumanMessage(content=user_message)]},
        config={"configurable": {"thread_id": str(user_uuid)}},
    )

    messages = result["messages"]
    for message in reversed(messages):
        if isinstance(message, AIMessage):
            text = _extract_text(message)
            if text:
                return text
    return "Sorry, I couldn't produce a response."
