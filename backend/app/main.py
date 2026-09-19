from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth, chat, parse, prioritize, tasks
from app.core.config import settings

app = FastAPI(title="AI Todo App", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(tasks.router)
app.include_router(parse.router)
app.include_router(prioritize.router)
app.include_router(chat.router)


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}

@app.get("/config", tags=["config"])
def config() -> dict[str,bool]:
    """Public Flag the frontend uses to decide which features to decide which feature to show """
    return {"ai_enabled": settings.ai_ebnabled}
