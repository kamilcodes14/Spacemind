"""
FastAPI layer for SpaceMind.

Run with:
    uvicorn src.api.main:app --reload --port 8000

Then:
    POST http://localhost:8000/ask   {"question": "What is dark matter?"}
"""

import json
import logging
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Optional, Dict, Tuple

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from src.config import RATE_LIMIT_PER_HOUR, BASE_DIR
from src.query.query_engine import ask as ask_assistant
from src.storage import answers_db
from src.ingestion import bootstrap
from src.library import list_papers

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

answers_db.init_db()

limiter = Limiter(key_func=get_remote_address)

@asynccontextmanager
async def lifespan(_app: FastAPI):
    # If the Chroma index is empty (fresh clone / fresh deploy), build it in the
    # background instead of requiring a manual `python scripts/ingest.py`.
    bootstrap.ensure_index(background=True)
    yield


app = FastAPI(
    title="SpaceMind",
    description="Ask natural-language questions over a library of NASA/arXiv space papers.",
    version="0.2.0",
    lifespan=lifespan,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Allow the deployed frontend (or a local dev server) to call this API.
# Tighten allow_origins to your actual frontend domain once you have one.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory chat session store: session_id -> list of (question, answer).
# Resets on server restart — fine for an MVP; move to Redis if you need
# sessions to survive restarts or to scale across multiple instances.
SESSIONS: Dict[str, List[Tuple[str, str]]] = {}
MAX_HISTORY_TURNS = 10

LEARNING_PATHS_PATH = BASE_DIR / "data" / "learning_paths.json"


class QuestionRequest(BaseModel):
    question: str
    top_k: int = 5
    depth: str = "technical"  # "simple" or "technical"
    session_id: Optional[str] = None  # omit/empty for a single-turn question
    use_web: Optional[bool] = None  # None=auto-fallback, True=always, False=papers only


class CitationResponse(BaseModel):
    source_file: str
    origin: str
    snippet: str
    url: Optional[str] = None


class AnswerResponse(BaseModel):
    answer: str
    citations: List[CitationResponse]
    follow_up_questions: List[str]
    confident: bool
    used_web: bool
    share_id: str


class SharedAnswerResponse(BaseModel):
    question: str
    answer: str
    citations: List[CitationResponse]
    follow_up_questions: List[str]
    created_at: str


class LearningPath(BaseModel):
    id: str
    title: str
    description: str
    starter_questions: List[str]


FRONTEND_PATH = BASE_DIR / "frontend" / "index.html"


@app.get("/", include_in_schema=False)
async def serve_frontend():
    """Serve the single-file web UI so visiting the API's own URL just works —
    no need to separately locate and open frontend/index.html by hand."""
    return FileResponse(FRONTEND_PATH)


@app.get("/health")
def health():
    # Always "ok" so the host's health check passes while the first-run index builds.
    return {"status": "ok", "index": bootstrap.get_status()}


@app.post("/ask", response_model=AnswerResponse)
@limiter.limit(f"{RATE_LIMIT_PER_HOUR}/hour")
def ask(request: Request, body: QuestionRequest):
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")
    if body.depth not in ("simple", "technical"):
        raise HTTPException(status_code=400, detail="depth must be 'simple' or 'technical'.")

    if bootstrap.is_building():
        raise HTTPException(
            status_code=503,
            detail="SpaceMind is loading its paper library for the first time — "
            "this takes a few minutes. Please try again shortly.",
        )

    history = SESSIONS.get(body.session_id, []) if body.session_id else []

    try:
        result = ask_assistant(
            body.question,
            top_k=body.top_k,
            depth=body.depth,
            history=history,
            use_web=body.use_web,
        )
    except RuntimeError as e:
        # Raised when the index hasn't been built yet
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.exception("Error answering question")
        raise HTTPException(status_code=500, detail=f"Internal error: {e}")

    if body.session_id:
        updated = history + [(body.question, result.text)]
        SESSIONS[body.session_id] = updated[-MAX_HISTORY_TURNS:]

    citations = [
        CitationResponse(
            source_file=c.source_file, origin=c.origin, snippet=c.snippet, url=c.url
        )
        for c in result.citations
    ]

    share_id = uuid.uuid4().hex[:12]
    answers_db.save_answer(
        share_id=share_id,
        question=body.question,
        answer=result.text,
        citations=[c.model_dump() for c in citations],
        follow_up_questions=result.follow_up_questions,
    )

    return AnswerResponse(
        answer=result.text,
        citations=citations,
        follow_up_questions=result.follow_up_questions,
        confident=result.confident,
        used_web=result.used_web,
        share_id=share_id,
    )


@app.get("/share/{share_id}", response_model=SharedAnswerResponse)
def get_shared_answer(share_id: str):
    record = answers_db.get_answer(share_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Shared answer not found.")
    return SharedAnswerResponse(**record)


@app.get("/library")
def library():
    """Every paper in the index (one row per paper) with title + link."""
    try:
        return list_papers()
    except Exception as e:
        logger.exception("Could not list library")
        raise HTTPException(status_code=500, detail=f"Could not load library: {e}")


@app.get("/learning-paths", response_model=List[LearningPath])
def get_learning_paths():
    if not LEARNING_PATHS_PATH.exists():
        return []
    with open(LEARNING_PATHS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@app.delete("/session/{session_id}")
def clear_session(session_id: str):
    """Clears a conversation's history (e.g. a frontend 'New chat' button)."""
    SESSIONS.pop(session_id, None)
    return {"status": "cleared"}
