# Frontend — React + Vite

Location: `frontend/src/`. Entry point: `src/main.tsx`, served by Vite
(`npm run dev`, port 5173).

## Directory layout

```
frontend/src/
├── main.tsx                       # React root: QueryClientProvider, BrowserRouter, AuthProvider
├── App.tsx                        # Routes
├── index.css                      # Tailwind entry
├── pages/
│   ├── Login.tsx
│   ├── Signup.tsx
│   ├── Tasks.tsx
│   └── Chat.tsx
├── components/
│   ├── icons.tsx                  # local inline SVG icon set (no icon dependency)
│   ├── auth/
│   │   ├── LoginForm.tsx
│   │   ├── SignupForm.tsx
│   │   └── form-controls.tsx      # shared FormField / FormError / SubmitButton / AuthSwitch
│   ├── tasks/
│   │   ├── TaskForm.tsx           # AI quick-add + collapsible manual form
│   │   ├── TaskList.tsx           # presentational list
│   │   └── TaskCard.tsx           # card + inline edit mode
│   ├── chat/
│   │   └── ChatWindow.tsx
│   └── layout/
│       ├── AuthSplitLayout.tsx    # split layout shared by Login + Signup
│       ├── Navbar.tsx
│       └── ProtectedRoute.tsx
├── hooks/
│   └── useTasks.ts                # TanStack Query hooks
├── lib/
│   ├── api-client.ts              # fetch wrapper + typed backend calls
│   └── auth-context.tsx           # AuthProvider / useAuth
└── types/
    └── task.ts                    # shared TS types (mirror of backend schemas)
```

## Bootstrapping (`main.tsx`)

Provider order: `QueryClientProvider` (TanStack Query, `retry: 1`,
`refetchOnWindowFocus: false`) → `BrowserRouter` → `AuthProvider` → `App`.

## Routing (`App.tsx`)

| Path | Component | Protected? |
|---|---|---|
| `/login` | `Login` | No |
| `/signup` | `Signup` | No |
| `/tasks` | `Tasks` | Yes |
| `/chat` | `Chat` | Yes |
| `*` | redirect to `/tasks` | — |

`<Navbar>` renders above all routes but returns `null` when logged out.

## Auth (`lib/auth-context.tsx`)

`AuthProvider` owns:

- `token: string | null` — initialized from `localStorage[TOKEN_KEY]`
  (`TOKEN_KEY = "ai_todo_token"`, defined in `api-client.ts`)
- `user: AuthUser | null` — hydrated by calling `GET /auth/me` whenever `token` changes
  (an effect); on failure, clears the token and logs out
- `loading: boolean` — true while hydrating the user on initial load
- `login(email, password)` / `signup(email, password)` — call the backend, persist the
  returned token, then fetch `/auth/me`
- `logout()` — clears token + user, does not call the backend (JWTs aren't revoked
  server-side; logout is purely client-side)

`useAuth()` throws if called outside `<AuthProvider>`.

`ProtectedRoute` (`components/layout/ProtectedRoute.tsx`): redirects to `/login` if no
token; shows a "Loading…" state while `loading`; redirects to `/login` if hydration
finished but there's still no `user` (e.g. token was invalid/expired).

## API client (`lib/api-client.ts`)

- `API_URL` — from `import.meta.env.VITE_API_URL`, default `http://localhost:8000`.
- `request<T>(path, options)` — shared fetch wrapper:
  - Sets `Content-Type: application/json` and `Authorization: Bearer <token>` (if a
    token exists in `localStorage`).
  - On `401`: reads the backend's `{ detail }` message, clears the stored token, and
    hard-redirects to `/login` — **except** on `/login` and `/signup`, where a 401 means
    "bad credentials" and the form needs to stay mounted to display the reason. Throws
    `ApiError(401, detail)` either way.
  - On any other non-OK status: attempts to read `{ detail }` from the JSON body (FastAPI's
    error shape) and throws `ApiError(status, detail)`.
  - On `204 No Content`: resolves `undefined`.
- `apiClient` — the typed surface used everywhere else in the app: `signup`, `login`,
  `getMe`, `listTasks`, `createTask`, `updateTask`, `deleteTask`, `parseText`,
  `previewParse`, `prioritize`, `chat`. Each maps 1:1 to a backend endpoint (see
  [API_REFERENCE.md](./API_REFERENCE.md)).

## Server state (`hooks/useTasks.ts`)

All backed by TanStack Query, keyed under `["tasks", ...]`:

| Hook | Type | Behavior |
|---|---|---|
| `useTasks(completed?)` | query | `GET /tasks/`, key includes the `completed` filter |
| `useCreateTask()` | mutation | `POST /tasks/`, invalidates `["tasks"]` on success |
| `useParseTask()` | mutation | `POST /parse/`, invalidates `["tasks"]` on success |
| `useUpdateTask()` | mutation | `PATCH /tasks/{id}`, invalidates `["tasks"]` on success |
| `useDeleteTask()` | mutation | `DELETE /tasks/{id}`, invalidates `["tasks"]` on success |
| `usePrioritize()` | mutation | `POST /prioritize/`, invalidates `["tasks"]` on success |

Every mutation invalidates the same broad `["tasks"]` key rather than surgically
patching the cache — simple and correct at this app's scale, at the cost of one extra
`GET /tasks/` after each write.

## Types (`types/task.ts`)

`Priority`, `Task`, `TaskCreate`, `TaskUpdate`, `ParsedTask`, `AuthUser` — hand-written
TypeScript mirrors of the backend's Pydantic schemas. There is no code generation
between backend and frontend; if a backend schema field changes, this file must be
updated manually.

## Pages

- **`Login.tsx`** / **`Signup.tsx`** — thin wrappers that pass a `title`/`subtitle` and
  the matching form into `<AuthSplitLayout>`.
- **`Tasks.tsx`** — the main authenticated view. Owns the `useTasks()` query and derives
  everything from it: the active/urgent/upcoming counts, the selected filter, the
  "AI Urgency Matrix" sort, and the set of task ids created via the AI input this
  session. Renders the header + "AI Re-prioritize" button (`usePrioritize`),
  `<TaskForm>`, the filter tabs, and `<TaskList>`.
- **`Chat.tsx`** — wraps `<ChatWindow>`.

## Components

### `layout/AuthSplitLayout.tsx`

The shared shell for `/login` and `/signup`: a single centered card, split on `lg`
screens into a brand/feature panel (wordmark, headline, a hairline-separated list of the
three AI features, a bcrypt reassurance line) and the form panel. Below `lg` the brand
panel is hidden and only the form shows. Takes `title`, `subtitle`, and the form as
`children`.

### `auth/form-controls.tsx`

Shared, presentational form pieces used by both auth forms, so they stay identical:

- **`FormField`** — label + input, with an optional `hint` and an optional `error`. For
  `type="password"` it renders a reveal/hide toggle. An `error` switches the border and
  message to the rose palette and sets `aria-invalid` + `aria-describedby`.
- **`FormError`** — form-level message with an icon and `role="alert"`.
- **`SubmitButton`** — primary button with a spinner and `loadingLabel` while pending.
- **`AuthSwitch`** — the "New to AI Todo? Create an account" line, using a router `Link`.

### `auth/LoginForm.tsx`, `auth/SignupForm.tsx`

Controlled forms holding their own field/error/submitting state and calling
`useAuth().login` / `.signup`, then navigating to `/tasks`.

Signup collects **email, password, and confirm password**. Confirm-password is a purely
client-side concern — it is never sent to the backend, whose `SignupIn` schema takes only
email and password. Validation order: password length (≥ 6 chars, mirroring the backend's
`Field(min_length=6, max_length=128)`), then the confirmation match. The mismatch is also
shown live under the confirm field as soon as the user types in it, and the form-level
error is suppressed while that inline error is visible so the same message never appears
twice.

### `tasks/TaskForm.tsx`

An AI-first quick-add card: a single free-text input plus an "Add with AI" button that
calls `useParseTask()` (`POST /parse/`), which parses *and* creates the task server-side
in one call. On success it reports the new task's id upward via `onAiCreated`, so
`Tasks.tsx` can badge it as AI-extracted.

Below it, a "+ Add task manually" toggle reveals the full manual form (title, description,
due date, priority, tags) backed by `useCreateTask()` — the same capability as before,
just no longer competing with the AI input for attention.

### `tasks/TaskList.tsx` / `tasks/TaskCard.tsx`

`TaskList` is presentational: it takes `tasks`, `isLoading`, `isError`, `error`, and
`aiCreatedIds` as props (the query itself lives in `Tasks.tsx`, which needs the data for
counts and filtering) and renders loading/error/empty states or a list of `TaskCard`s.

`TaskCard` has two modes. **Display** shows a custom completion toggle (`useUpdateTask`
patching `{completed}`, its ring tinted rose for high-priority tasks), the title
(struck through when completed), a dotted priority badge (low=emerald, medium=amber,
high=rose), `#tag` pills, description, formatted due date, an "AI score" badge when
`ai_priority_score` is set, an "Extracted automatically" marker for AI-created tasks,
and edit/delete buttons. **Edit** (the pencil) swaps the card for an inline form over
title/description/due date/priority/tags, saving via `useUpdateTask`.

> Note: `aiCreatedIds` is session-only React state. There is no backend column recording
> that a task came from the parser, so the "Extracted automatically" marker disappears on
> reload. Persisting it would need a new `Task` field and a migration.

### `chat/ChatWindow.tsx`

Self-contained chat UI with local `messages: Message[]` state (not persisted — a page
refresh loses the visible transcript, even though the backend's LangGraph checkpointer
still remembers the actual conversation). On send:

1. Appends the user message locally, shows a "Thinking…" bubble.
2. Calls `apiClient.chat(text)` — **only the new message is sent**, per the backend's
   server-side memory design (see [AI_AGENTS.md](./AI_AGENTS.md)).
3. Appends the assistant's reply.
4. Calls `qc.invalidateQueries({ queryKey: ["tasks"] })` — since the agent may have
   created/completed/deleted tasks via its tools, the tasks view is refreshed
   regardless of whether the user is currently looking at it.

Enter (without Shift) sends the message.

### `layout/Navbar.tsx`

A sticky, blurred bar: the wordmark, a segmented Tasks/Chat control highlighting the
active route, and the logged-in user's avatar initial, email, and logout button. Renders
nothing if not logged in.

### `components/icons.tsx`

A small set of hand-written inline SVG icon components sharing one stroke style. This
exists so the UI has icons without adding an icon-library dependency — anything unused
should be deleted rather than left to accumulate.

## Styling

Tailwind CSS (`tailwind.config.ts`, `postcss.config.js`), applied as utility classes
directly in JSX — no separate stylesheet per component, no CSS modules or
styled-components.

The app is **dark-theme only**: `index.css` sets a `slate-950` base, and the palette is
neutral slate with indigo/violet/sky reserved for accents and AI affordances. That file
also carries two small fixes worth knowing about — a `-webkit-autofill` override (Chrome
otherwise paints autofilled inputs near-white, breaking the dark theme) and a
`prefers-reduced-motion` block that neutralizes animations and transitions.

`tailwind.config.ts` extends the theme with the `fade-up` / `fade-in` keyframes used for
entrance animations.

## Build

```
npm run build   # tsc (type-check) && vite build → frontend/dist/
npm run preview # serve the production build locally
```
