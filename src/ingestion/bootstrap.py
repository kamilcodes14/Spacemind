"""
Auto-ingestion on first start.

Problem this solves: the Chroma index used to exist only after you manually ran
`python scripts/ingest.py` in a terminal. On a fresh clone / fresh deploy the
index is empty, so every question failed with "No documents indexed yet".

`ensure_index()` checks the Chroma collection and, if it's empty, runs the same
fetch -> chunk -> embed -> index pipeline that scripts/ingest.py runs, using the
BOOTSTRAP_* queries in src/config.py. If the collection already has vectors it
does nothing, so restarts are instant.
"""

import logging
import threading

from src.config import (
    AUTO_INGEST_ON_STARTUP,
    BOOTSTRAP_ARXIV_QUERIES,
    BOOTSTRAP_NTRS_QUERIES,
    BOOTSTRAP_MAX_RESULTS,
)
from src.vectorstore.chroma_store import get_chroma_collection

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_state = {"status": "idle", "error": None}  # idle | building | ready | failed


def get_status() -> dict:
    return dict(_state)


def is_building() -> bool:
    return _state["status"] == "building"


def _index_has_data() -> bool:
    return get_chroma_collection().count() > 0


def _build() -> None:
    # Heavy imports live here so app startup itself stays fast.
    from src.ingestion.arxiv_fetch import fetch_and_download as fetch_arxiv
    from src.ingestion.nasa_ntrs import fetch_and_download as fetch_ntrs
    from src.ingestion.chunker import load_documents, chunk_documents
    from src.vectorstore.chroma_store import build_index

    try:
        for q in BOOTSTRAP_ARXIV_QUERIES:
            logger.info("Bootstrap: fetching arXiv '%s'", q)
            try:
                fetch_arxiv(q, max_results=BOOTSTRAP_MAX_RESULTS)
            except Exception:
                logger.exception("Bootstrap: arXiv fetch failed for '%s' (continuing)", q)
        for q in BOOTSTRAP_NTRS_QUERIES:
            logger.info("Bootstrap: fetching NTRS '%s'", q)
            try:
                fetch_ntrs(q, page_size=BOOTSTRAP_MAX_RESULTS)
            except Exception:
                logger.exception("Bootstrap: NTRS fetch failed for '%s' (continuing)", q)

        documents = load_documents()
        if not documents:
            raise RuntimeError("Bootstrap downloaded no documents (network/API problem?).")

        nodes = chunk_documents(documents)
        logger.info("Bootstrap: embedding + indexing %d chunks ...", len(nodes))
        build_index(nodes)
        _state.update(status="ready", error=None)
        logger.info("Bootstrap complete — SpaceMind is ready.")
    except Exception as e:
        logger.exception("Bootstrap failed")
        _state.update(status="failed", error=str(e))


def ensure_index(background: bool = True) -> str:
    """
    Make sure the index has data. Returns the resulting status.

    background=True  -> start building in a daemon thread and return immediately
                        (used by the API so the server can boot and pass health checks).
    background=False -> block until done (used by the CLI).
    """
    with _lock:
        if _state["status"] == "building":
            return "building"
        if _index_has_data():
            _state.update(status="ready", error=None)
            return "ready"
        if not AUTO_INGEST_ON_STARTUP:
            logger.warning("Index is empty and AUTO_INGEST_ON_STARTUP=false — run scripts/ingest.py.")
            return "idle"
        _state.update(status="building", error=None)

    if background:
        threading.Thread(target=_build, name="spacemind-bootstrap", daemon=True).start()
    else:
        _build()
    return _state["status"]
