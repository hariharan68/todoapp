# AI-Powered Todo App — Documentation

This is the full technical documentation for the codebase in this repository: a
full-stack personal todo app with three AI features built on **LangGraph** and
**Claude** (Anthropic).

| Doc | What's in it |
|---|---|
| [**RUNNING.md**](./RUNNING.md) | **Start here for local development.** Step-by-step instructions to get Postgres, the backend, and the frontend running locally. |
| [**DEPLOYMENT.md**](./DEPLOYMENT.md) | **Start here to deploy.** Running the whole stack on a production server with Docker Compose: configuration, TLS, backups, logging, scaling, troubleshooting. |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | High-level system design: how the three services (Postgres, FastAPI, Vite/React) fit together, request flow, auth flow. |
| [BACKEND.md](./BACKEND.md) | FastAPI backend: directory layout, config, security/auth, DB session handling, every module explained. |
| [FRONTEND.md](./FRONTEND.md) | React frontend: directory layout, routing, auth context, data fetching (TanStack Query), every component/page explained. |
| [AI_AGENTS.md](./AI_AGENTS.md) | The three LangGraph graphs (parser, prioritizer, chat agent) — how each is built, prompted, and wired to the DB. |
| [API_REFERENCE.md](./API_REFERENCE.md) | Every HTTP endpoint: method, path, auth requirement, request/response shape, status codes. |
| [DATABASE.md](./DATABASE.md) | Schema for `users` and `tasks`, relationships, Alembic migration workflow. |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Known limitations, common setup errors, and their fixes. |

## Project summary

- **Backend** — FastAPI + PostgreSQL (SQLAlchemy 2.0 ORM), JWT auth (`passlib[bcrypt]` +
  `python-jose`), schema migrations via Alembic.
- **AI** — three LangGraph graphs using `langchain-anthropic` (Claude): natural-language
  task parsing, AI-based task prioritization, and a conversational tool-using agent that
  can create/list/complete/delete tasks.
- **Frontend** — React 18 (Vite + TypeScript) + Tailwind CSS + TanStack Query (server
  state) + React Router (routing).
- **Infra** — two Compose files. `docker-compose.yml` is for local development and
  runs **only** Postgres, with the backend and frontend running natively on the
  host. `docker-compose.prod.yml` runs the whole stack in containers: Postgres, the
  API under uvicorn, and nginx serving the built SPA and proxying `/api` to the API.

## Repository layout

```
TODO/
├── backend/
│   ├── alembic/                # DB migrations
│   │   ├── env.py
│   │   └── versions/0001_initial.py
│   ├── alembic.ini
│   ├── app/
│   │   ├── main.py             # FastAPI app + router registration
│   │   ├── deps.py             # get_current_user dependency
│   │   ├── core/
│   │   │   ├── config.py       # Settings (env vars)
│   │   │   └── security.py     # password hashing, JWT
│   │   ├── db/
│   │   │   └── database.py     # engine, session, Base
│   │   ├── models/
│   │   │   ├── user.py         # User ORM model
│   │   │   ├── task.py         # Task ORM model
│   │   │   └── schemas.py      # Pydantic request/response models
│   │   ├── agents/
│   │   │   ├── parser_graph.py       # NL -> structured task
│   │   │   ├── prioritizer_graph.py  # score tasks 0-100
│   │   │   ├── chat_graph.py         # ReAct chat agent
│   │   │   └── tools.py              # tools available to the chat agent
│   │   └── api/routes/
│   │       ├── auth.py         # /auth/signup, /auth/login, /auth/logout, /auth/me
│   │       ├── tasks.py        # /tasks CRUD
│   │       ├── parse.py        # /parse, /parse/preview
│   │       ├── prioritize.py   # /prioritize
│   │       └── chat.py         # /chat
│   ├── requirements.txt        # runtime deps, version-pinned
│   ├── requirements-dev.txt    # test-only deps
│   ├── Dockerfile              # multi-stage production image
│   ├── docker-entrypoint.sh    # config preflight, migrations, then uvicorn
│   ├── .dockerignore
│   ├── .env.example
│   └── .env                    # not committed; your local secrets
├── frontend/
│   ├── src/
│   │   ├── main.tsx            # React root, providers
│   │   ├── App.tsx             # routes
│   │   ├── index.css           # Tailwind entry + dark-theme base
│   │   ├── pages/              # Tasks, Chat, Login, Signup
│   │   ├── components/
│   │   │   ├── icons.tsx       # local inline SVG icon set
│   │   │   ├── auth/           # LoginForm, SignupForm, form-controls
│   │   │   ├── tasks/          # TaskForm, TaskList, TaskCard
│   │   │   ├── chat/           # ChatWindow
│   │   │   └── layout/         # AuthSplitLayout, Navbar, ProtectedRoute
│   │   ├── hooks/useTasks.ts   # TanStack Query hooks
│   │   ├── lib/
│   │   │   ├── api-client.ts   # fetch wrapper + typed API calls
│   │   │   └── auth-context.tsx
│   │   └── types/task.ts       # shared TS types
│   ├── package.json
│   ├── vite.config.ts
│   ├── Dockerfile              # build the SPA, serve it with nginx
│   ├── nginx.conf              # SPA fallback, /api proxy, rate limits, caching
│   ├── nginx-security-headers.conf
│   ├── .dockerignore
│   ├── .env.example
│   └── .env
├── docker-compose.yml           # development: Postgres only
├── docker-compose.prod.yml      # production: Postgres + API + nginx
├── .env.production.example      # template for the production .env
├── .gitattributes               # forces LF, so shell scripts work in Linux images
├── README.md                    # top-level quick-start
└── docs/                        # you are here
```

## Where to go next

If you just want to **run the app locally**, go straight to
[RUNNING.md](./RUNNING.md). To **put it on a server**, go to
[DEPLOYMENT.md](./DEPLOYMENT.md). For everything else,
[ARCHITECTURE.md](./ARCHITECTURE.md) is the best next read.
