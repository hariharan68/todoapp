"""LangGraph graph that scores a list of tasks by priority.

A single-node StateGraph asks the LLM (via `.with_structured_output(TaskScores)`)
to assign each task an integer urgency/importance score from 0-100.
"""

from datetime import datetime
from typing import TypedDict

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field

from app.core.config import settings

_SYSTEM_PROMPT = (
    "You are a productivity assistant that prioritizes a user's to-do list. "
    "For every task you are given, assign an integer score from 0 (least urgent/"
    "important) to 100 (most urgent/important). Weigh due dates (sooner = higher), "
    "the stated priority field, and the nature of the work. Return a score for "
    "every task id you were given, and only those ids."
)


class TaskScore(BaseModel):
    id: str = Field(description="The task id exactly as provided.")
    score: int = Field(description="Priority score from 0 to 100.")


class TaskScores(BaseModel):
    scores: list[TaskScore]


class PrioritizerState(TypedDict, total=False):
    tasks: list[dict]
    scores: dict[str, int]


def _llm() -> ChatAnthropic:
    return ChatAnthropic(model=settings.CLAUDE_MODEL, temperature=0)


def _prioritize_node(state: PrioritizerState) -> PrioritizerState:
    tasks = state["tasks"]
    if not tasks:
        return {"scores": {}}

    structured_llm = _llm().with_structured_output(TaskScores)
    now = datetime.now().astimezone().isoformat()
    lines = []
    for t in tasks:
        lines.append(
            f"- id={t['id']} | title={t.get('title')!r} | "
            f"priority={t.get('priority')} | due_date={t.get('due_date')} | "
            f"description={t.get('description')!r}"
        )
    tasks_block = "\n".join(lines)

    result: TaskScores = structured_llm.invoke(
        [
            SystemMessage(content=_SYSTEM_PROMPT),
            HumanMessage(
                content=f"Current time is {now}.\n\nTasks:\n{tasks_block}"
            ),
        ]
    )
    return {"scores": {s.id: s.score for s in result.scores}}


def _build_graph():
    builder = StateGraph(PrioritizerState)
    builder.add_node("prioritize", _prioritize_node)
    builder.add_edge(START, "prioritize")
    builder.add_edge("prioritize", END)
    return builder.compile()


graph = _build_graph()


def prioritize_tasks(tasks: list[dict]) -> dict[str, int]:
    """Return a mapping of task id -> priority score for the given tasks."""
    final_state = graph.invoke({"tasks": tasks})
    return final_state.get("scores", {})
