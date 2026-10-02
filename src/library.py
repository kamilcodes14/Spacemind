"""
Lists the papers SpaceMind has indexed (one entry per paper), with a
readable title and a link. Powers the "Library" page.

Titles aren't stored in the index, so they're looked up once from arXiv /
NASA NTRS and cached in memory. If a lookup fails the paper is still listed
(by its ID), so this never breaks the page.
"""

import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List, Optional

import feedparser
import requests

from src.config import ARXIV_ABS_URL, NTRS_CITATION_URL, SEMANTIC_SCHOLAR_ABS_URL
from src.vectorstore.chroma_store import get_chroma_collection

logger = logging.getLogger(__name__)

_TITLE_CACHE: Dict[str, Optional[str]] = {}
_LIBRARY_CACHE: Dict[str, object] = {"key": None, "papers": []}
_TIMEOUT = 6


def _fetch_arxiv_titles(ids: List[str]) -> Dict[str, str]:
    """One batched arXiv request for many papers."""
    titles: Dict[str, str] = {}
    if not ids:
        return titles
    try:
        resp = requests.get(
            "https://export.arxiv.org/api/query",
            params={"id_list": ",".join(ids), "max_results": len(ids)},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        for entry in feedparser.parse(resp.text).entries:
            arxiv_id = entry.id.rsplit("/abs/", 1)[-1]  # e.g. 2609.37293v1
            titles[arxiv_id] = " ".join(entry.title.split())
    except Exception as e:
        logger.info("arXiv title lookup skipped: %s", e)
    return titles


def _fetch_ntrs_title(doc_id: str) -> Optional[str]:
    try:
        resp = requests.get(
            f"https://ntrs.nasa.gov/api/citations/{doc_id}", timeout=_TIMEOUT
        )
        resp.raise_for_status()
        title = resp.json().get("title")
        return " ".join(title.split()) if title else None
    except Exception as e:
        logger.info("NTRS title lookup skipped for %s: %s", doc_id, e)
        return None


def _paper_url(origin: str, doc_id: str) -> Optional[str]:
    if origin == "arxiv":
        return ARXIV_ABS_URL + doc_id
    if origin == "ntrs":
        return NTRS_CITATION_URL + doc_id
    if origin == "semantic_scholar":
        return SEMANTIC_SCHOLAR_ABS_URL + doc_id
    return None


def list_papers() -> List[dict]:
    collection = get_chroma_collection()
    total = collection.count()
    if _LIBRARY_CACHE["key"] == total and _LIBRARY_CACHE["papers"]:
        return _LIBRARY_CACHE["papers"]  # type: ignore[return-value]

    metadatas = collection.get(include=["metadatas"]).get("metadatas") or []

    # Group chunks into papers.
    papers: Dict[tuple, dict] = {}
    for m in metadatas:
        if not m:
            continue
        # NOTE: Chroma overwrites the stored "doc_id" with an internal UUID, so the
        # real paper id is taken from the file name (e.g. 2609.37293v1.pdf).
        origin = m.get("source", "unknown")
        file_name = m.get("file_name", "")
        doc_id = file_name[:-4] if file_name.lower().endswith(".pdf") else file_name
        if not doc_id:
            continue
        key = (origin, doc_id)
        if key not in papers:
            papers[key] = {"origin": origin, "doc_id": doc_id, "chunks": 0}
        papers[key]["chunks"] += 1

    # Look up titles we haven't seen yet.
    missing_arxiv = [d for (o, d) in papers if o == "arxiv" and d not in _TITLE_CACHE]
    for arxiv_id, title in _fetch_arxiv_titles(missing_arxiv).items():
        _TITLE_CACHE[arxiv_id] = title
    for d in missing_arxiv:
        _TITLE_CACHE.setdefault(d, None)

    missing_ntrs = [d for (o, d) in papers if o == "ntrs" and d not in _TITLE_CACHE]
    if missing_ntrs:
        with ThreadPoolExecutor(max_workers=8) as pool:
            for d, title in zip(missing_ntrs, pool.map(_fetch_ntrs_title, missing_ntrs)):
                _TITLE_CACHE[d] = title

    result = []
    for (origin, doc_id), info in papers.items():
        result.append(
            {
                "origin": origin,
                "doc_id": doc_id,
                "title": _TITLE_CACHE.get(doc_id),
                "url": _paper_url(origin, doc_id),
                "chunks": info["chunks"],
            }
        )
    result.sort(key=lambda p: (p["origin"], (p["title"] or p["doc_id"]).lower()))

    _LIBRARY_CACHE["key"] = total
    _LIBRARY_CACHE["papers"] = result
    return result
