"""
Lightweight persistence for shareable answer links: a person asks a
question, gets a `share_id` back, and anyone with the link can view that
exact Q&A via GET /share/{id}.

Uses SQLite (stdlib, no extra dependency). Note: on Render's free tier,
this file does NOT survive a redeploy or a spin-down restart — fine for
"share this with a friend today", not a permanent archive. Swap in a real
database (Postgres, etc.) later if you need links to outlive redeploys.
"""

import json
import sqlite3
import logging
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from src.config import ANSWERS_DB_PATH

logger = logging.getLogger(__name__)


@contextmanager
def _connect():
    conn = sqlite3.connect(ANSWERS_DB_PATH)
    try:
        yield conn
    finally:
        conn.close()


def init_db() -> None:
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS answers (
                share_id TEXT PRIMARY KEY,
                question TEXT NOT NULL,
                answer TEXT NOT NULL,
                citations_json TEXT NOT NULL,
                follow_ups_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.commit()


def save_answer(
    share_id: str,
    question: str,
    answer: str,
    citations: List[Dict[str, Any]],
    follow_up_questions: List[str],
) -> None:
    with _connect() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO answers
                (share_id, question, answer, citations_json, follow_ups_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                share_id,
                question,
                answer,
                json.dumps(citations),
                json.dumps(follow_up_questions),
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        conn.commit()


def get_answer(share_id: str) -> Optional[Dict[str, Any]]:
    with _connect() as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM answers WHERE share_id = ?", (share_id,)
        ).fetchone()
        if not row:
            return None
        return {
            "share_id": row["share_id"],
            "question": row["question"],
            "answer": row["answer"],
            "citations": json.loads(row["citations_json"]),
            "follow_up_questions": json.loads(row["follow_ups_json"]),
            "created_at": row["created_at"],
        }
