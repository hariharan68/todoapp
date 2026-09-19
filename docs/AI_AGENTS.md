# AI Features — LangGraph Agents

All three AI features are implemented as **compiled LangGraph graphs**, not ad-hoc API
calls. Each lives under `backend/app/agents/` and is invoked from a route handler.
All three use `ChatAnthropic` (`langchain-anthropic`) with `model=settings.CLAUDE_MODEL`
and `temperature=0` for deterministic behavior.

## 1. Parser graph — `app/agents/parser_graph.py`

**Purpose**: turn a line of natural language into a structured task.

- **State**: `ParserState(TypedDict)` — `text: str` in, `parsed_task: ParsedTask` out.
- **Graph shape**: single node `"parse"`, `START → parse → END`.
- **Mechanism**: `ChatAnthropic(...).with_structured_output(ParsedTask)` — the model is
  forced to return a validated `ParsedTask` Pydantic object (see
  `app/models/schemas.py`) instead of free text that would need manual JSON parsing.
- **Prompt** (`_SYSTEM_PROMPT`): instructs the model to extract `title` (required,
  concise/actionable), `description` (optional), `due_date` (resolve relative dates
  like "tomorrow" to absolute ISO 8601 using the current time, which is passed in the
  human message), `priority` (infer low/medium/high from urgency words, default
  medium), `tags` (comma-separated, optional).
- **Entry point**: `parse_task_text(text: str) -> ParsedTask` — invokes the compiled
  graph and returns `final_state["parsed_task"]`.
- **Callers**: `POST /parse/preview` (returns the `ParsedTask` without saving) and
  `POST /parse/` (parses, then persists a `Task` built from the result) in
  `app/api/routes/parse.py`.

## 2. Prioritizer graph — `app/agents/prioritizer_graph.py`

**Purpose**: assign every incomplete task an integer urgency/importance score, 0–100.

- **State**: `PrioritizerState(TypedDict)` — `tasks: list[dict]` in, `scores: dict[str, int]` out.
- **Graph shape**: single node `"prioritize"`, `START → prioritize → END`.
- **Mechanism**: `ChatAnthropic(...).with_structured_output(TaskScores)`, where
  `TaskScores = {scores: list[TaskScore]}` and `TaskScore = {id: str, score: int}` —
  defined locally in this module (not `schemas.py`), since they're an internal
  implementation detail of this graph, not an API-facing DTO.
- **Prompt** (`_SYSTEM_PROMPT`): asks the model to weigh due dates (sooner = higher),
  the task's stated `priority` field, and the nature of the work; instructed to return
  a score for every task id given, and only those ids. Tasks are serialized as one
  line each (`id`, `title`, `priority`, `due_date`, `description`) in the human
  message, alongside the current time.
- **Entry point**: `prioritize_tasks(tasks: list[dict]) -> dict[str, int]` — maps task
  id → score. Returns `{}` immediately (no LLM call) if given an empty list.
- **Caller**: `POST /prioritize/` in `app/api/routes/prioritize.py` — loads the current
  user's incomplete tasks, calls this graph, writes `ai_priority_score` back onto each
  `Task` row, commits, and returns the tasks **sorted by score descending**
  (`ai_priority_score or -1` as the sort key, so un-scored tasks sink to the bottom).

Note: `TaskScore.id` is matched back to the DB task by exact string equality (`t.id`
as a str). If the model hallucinates or omits an id, `scores.get(str(task.id))`
returns `None` and that task's score is simply left unchanged.

## 3. Chat agent — `app/agents/chat_graph.py` + `app/agents/tools.py`

**Purpose**: a conversational assistant that can create, list, complete, and delete the
current user's tasks by calling tools, not just describe what it would do.

### Graph construction

Built with `langgraph.prebuilt.create_react_agent(llm, tools, prompt, checkpointer)` —
the standard prebuilt agent→tools→agent ReAct loop, rather than a hand-rolled
`StateGraph`. Constructed **fresh on every call** to `run_chat`, since the tools must
be closed over that request's DB session and user id.

### Tools — `app/agents/tools.py`

`make_tools(db: Session, user_id: uuid.UUID)` returns four `@tool`-decorated functions,
each closing over `db` and `user_id`:

| Tool | Signature | Behavior |
|---|---|---|
| `create_task` | `(title, description=None, due_date=None, priority="medium", tags=None)` | Validates `priority` (falls back to `"medium"` if invalid), parses `due_date` via `datetime.fromisoformat` (returns `None` silently on a bad format), inserts and commits a `Task`, returns a confirmation string with the new task's id |
| `list_tasks` | `(completed=None)` | Returns a newline-delimited text listing (`id`, title, priority, status, due date) — deliberately plain text, not JSON, since it's meant to be read by the LLM, not parsed by code |
| `complete_task` | `(task_id)` | Looks up the task **scoped to `user_id`**; sets `completed=True`; returns a confirmation or "not found" |
| `delete_task` | `(task_id)` | Same ownership check; deletes; returns a confirmation or "not found" |

**Security property**: because `db` and `user_id` are closed over at tool-construction
time (not passed as LLM-controllable arguments), the model cannot access or mutate any
other user's tasks even if it tried to pass a different id — every internal query still
filters by the bound `user_id`.

### Conversation memory

```python
_checkpointer = MemorySaver()   # module-level, shared across all requests/users
```

- LangGraph's `MemorySaver` persists conversation state **in-process**, keyed by
  `thread_id`. This app uses `thread_id = str(user_id)`, so each user has one running
  conversation thread that grows across chat turns.
- Because history lives server-side, **the frontend sends only the newest message**
  per `POST /chat/` call (see `ChatWindow.tsx` and `run_chat`'s single
  `HumanMessage(content=user_message)` input) — never the full transcript.
- This memory is **lost on backend restart** (`MemorySaver` is in-memory, not
  persisted to Postgres or disk). See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for
  the suggested upgrade path (`PostgresSaver`).

### System prompt

Instructs the agent to manage the user's to-do list using the provided tools rather
than just describing what it would do, to list tasks first when it needs an id (to
complete/delete), and to confirm actions in a short, friendly reply.

### Entry point — `run_chat(user_message, user_id, db) -> str`

1. Coerces `user_id` to a `uuid.UUID`.
2. Builds a fresh `ChatAnthropic` client, fresh tools (`make_tools(db, user_uuid)`),
   and a fresh agent graph — reusing only the shared `_checkpointer`.
3. Invokes the agent with `config={"configurable": {"thread_id": str(user_uuid)}}`,
   which is how LangGraph's checkpointer finds/continues that user's conversation.
4. Walks the returned `messages` list **in reverse** looking for the last `AIMessage`
   with non-empty text (`_extract_text` handles both plain-string content and
   Anthropic's list-of-content-block format), and returns that text. Falls back to
   `"Sorry, I couldn't produce a response."` if none is found.

### Caller

`POST /chat/` in `app/api/routes/chat.py` — passes `payload.message`,
`str(current_user.id)`, and the request's `db` session into `run_chat`; wraps any
exception as a `502`.

## Error handling pattern (shared by all three)

Route handlers wrap graph invocation in `try/except Exception` and re-raise as
`HTTPException(502, detail=f"... {exc}")`. This means any failure mode — missing/
invalid `ANTHROPIC_API_KEY`, network error, rate limiting, a malformed structured
output the model returns — surfaces to the frontend as a catchable `502` with a
message, rather than an opaque `500`.

## Configuration

Both the model and the API key are read once from `Settings` at process start
(`backend/app/core/config.py`):

- `ANTHROPIC_API_KEY` — if unset, `ChatAnthropic` calls fail (typically an
  authentication error), which the route handlers turn into a `502`.
- `CLAUDE_MODEL` — defaults to `claude-sonnet-4-6`; any Claude model available to your
  API key can be substituted.

Changing either requires **restarting the backend process** — they're read once into
the `settings` singleton at import time.
