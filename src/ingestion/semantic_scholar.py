"""
Fetches open-access papers from Semantic Scholar's Graph API.

Free, no key required for light/personal use (an optional key raises
rate limits — see SEMANTIC_SCHOLAR_API_KEY in config). Only papers with
a direct open-access PDF link are downloadable; paywalled results are
skipped.
"""

import time
import logging
from pathlib import Path
from dataclasses import dataclass
from typing import List, Optional

import requests

from src.config import (
    SEMANTIC_SCHOLAR_API_KEY,
    SEMANTIC_SCHOLAR_SEARCH_URL,
    RAW_DIR,
)

logger = logging.getLogger(__name__)

S2_RAW_DIR = RAW_DIR / "semantic_scholar"
S2_RAW_DIR.mkdir(parents=True, exist_ok=True)


@dataclass
class SemanticScholarPaper:
    paper_id: str
    title: str
    abstract: str
    published: str
    pdf_url: Optional[str]
    local_path: str = ""


def search_semantic_scholar(
    query: str = "dark matter", limit: int = 25
) -> List[SemanticScholarPaper]:
    """Query Semantic Scholar's Graph API for open-access papers."""
    headers = {}
    if SEMANTIC_SCHOLAR_API_KEY:
        headers["x-api-key"] = SEMANTIC_SCHOLAR_API_KEY

    params = {
        "query": query,
        "limit": limit,
        "fields": "title,abstract,year,openAccessPdf",
        "openAccessPdf": "",  # only return results that have an OA PDF
    }
    resp = requests.get(
        SEMANTIC_SCHOLAR_SEARCH_URL, headers=headers, params=params, timeout=30
    )
    resp.raise_for_status()
    data = resp.json().get("data", [])

    papers = []
    for d in data:
        oa = d.get("openAccessPdf") or {}
        papers.append(
            SemanticScholarPaper(
                paper_id=d.get("paperId", ""),
                title=d.get("title", "Untitled"),
                abstract=d.get("abstract", "") or "",
                published=str(d.get("year", "")),
                pdf_url=oa.get("url"),
            )
        )
    logger.info("Semantic Scholar search '%s' returned %d records", query, len(papers))
    return papers


def download_paper(
    paper: SemanticScholarPaper, sleep_seconds: float = 1.0
) -> SemanticScholarPaper:
    """Download a single paper's open-access PDF, if one exists."""
    if not paper.pdf_url or not paper.paper_id:
        return paper

    out_path = S2_RAW_DIR / f"{paper.paper_id}.pdf"
    if not out_path.exists():
        resp = requests.get(paper.pdf_url, timeout=60)
        resp.raise_for_status()
        # Some OA links resolve to an HTML landing page instead of a raw
        # PDF — a quick content-type/magic-bytes check avoids saving junk.
        if not resp.content.startswith(b"%PDF"):
            logger.warning(
                "OA link for %s didn't return a PDF, skipping", paper.paper_id
            )
            return paper
        out_path.write_bytes(resp.content)
        time.sleep(sleep_seconds)

    paper.local_path = str(out_path)
    return paper


def fetch_and_download(
    query: str, limit: int = 25
) -> List[SemanticScholarPaper]:
    """Convenience wrapper: search + download in one call."""
    papers = search_semantic_scholar(query=query, limit=limit)
    downloaded = []
    for p in papers:
        try:
            downloaded.append(download_paper(p))
        except requests.RequestException as e:
            logger.warning("Failed to download %s: %s", p.paper_id, e)
    return downloaded


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    results = fetch_and_download("exoplanet atmosphere", limit=5)
    for r in results:
        print(f"{r.paper_id} -> {r.local_path or '(no open-access PDF)'}")
