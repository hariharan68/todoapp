"""LangGraph graph that turns a line of natural language into a structured task.

A single-node StateGraph calls the LLM with `.with_structured_output(ParsedTask)`,
so the model returns a validated Pydantic object instead of a JSON string we would
have to parse by hand.
"""

from datetime import datetime
from typing import TypedDict

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph

from app.core.config import settings
from app.models.schemas import ParsedTask

_SYSTEM_PROMPT = (
    "You are a task-parsing assistant. Given a short piece of natural language, "
    "extract a single structured task. Rules:\n"
    "- title: a concise, actionable summary (required).\n"
    "- description: extra detail if present, otherwise null.\n"
    "- due_date: resolve relative dates (e.g. 'tomorrow', 'next Friday') to an "
    "absolute ISO 8601 datetime using the provided current time; null if none.\n"
    "- priority: infer low/medium/high from urgency words; default medium.\n"
    "- tags: comma-separated labels if implied, otherwise null.\n"
    "Return only the structured task."
)


class ParserState(TypedDict, total=False):
    text: str
    parsed_task: ParsedTask


def _llm() -> ChatAnthropic:
    return ChatAnthropic(model=settings.CLAUDE_MODEL, temperature=0)


def _parse_node(state: ParserState) -> ParserState:
    structured_llm = _llm().with_structured_output(ParsedTask)
    now = datetime.now().astimezone().isoformat()
    result: ParsedTask = structured_llm.invoke(
        [
            SystemMessage(content=_SYSTEM_PROMPT),
            HumanMessage(
                content=f"Current time is {now}.\n\nText to parse:\n{state['text']}"
            ),
        ]
    )
    return {"parsed_task": result}


def _build_graph():
    builder = StateGraph(ParserState)
    builder.add_node("parse", _parse_node)
    builder.add_edge(START, "parse")
    builder.add_edge("parse", END)
    return builder.compile()


graph = _build_graph()


def parse_task_text(text: str) -> ParsedTask:
    """Run the parser graph on `text` and return the structured task."""
    final_state = graph.invoke({"text": text})
    return final_state["parsed_task"]
