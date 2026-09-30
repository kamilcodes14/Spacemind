"""
Fetches papers from arXiv's public API for a given query/category and
downloads the PDFs into data/raw/arxiv/.

arXiv's API is free and needs no key: http://export.arxiv.org/api/query
"""

import time
import logging
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import List

import feedparser
import requests

from src.config import ARXIV_API_URL, RAW_DIR

logger = logging.getLogger(__name__)

ARXIV_RAW_DIR = RAW_DIR / "arxiv"
ARXIV_RAW_DIR.mkdir(parents=True, exist_ok=True)


@dataclass
class ArxivPaper:
    arxiv_id: str
    title: str
    authors: List[str]
    summary: str
    published: str
    pdf_url: str
    local_path: str = ""


def search_arxiv(
    query: str = "cat:astro-ph.HE OR cat:astro-ph.CO",
    max_results: int = 25,
    start: int = 0,
) -> List[ArxivPaper]:
    """
    Query arXiv's Atom API and return paper metadata.

    Example queries:
      - "cat:astro-ph.HE"                -> High Energy Astrophysical Phenomena
      - "all:black hole thermodynamics"  -> free text search
      - "cat:astro-ph.CO AND abs:dark matter"
    """
    params = {
        "search_query": query,
        "start": start,
        "max_results": max_results,
        "sortBy": "submittedDate",
        "sortOrder": "descending",
    }
    resp = requests.get(ARXIV_API_URL, params=params, timeout=30)
    resp.raise_for_status()
    feed = feedparser.parse(resp.text)

    papers = []
    for entry in feed.entries:
        arxiv_id = entry.id.split("/abs/")[-1]
        pdf_url = next(
            (link.href for link in entry.links if link.type == "application/pdf"),
            entry.id.replace("/abs/", "/pdf/"),
        )
        papers.append(
            ArxivPaper(
                arxiv_id=arxiv_id,
                title=" ".join(entry.title.split()),
                authors=[a.name for a in getattr(entry, "authors", [])],
                summary=" ".join(entry.summary.split()),
                published=entry.published,
                pdf_url=pdf_url,
            )
        )
    logger.info("arXiv search '%s' returned %d papers", query, len(papers))
    return papers


def download_paper(paper: ArxivPaper, sleep_seconds: float = 1.0) -> ArxivPaper:
    """Download a single paper's PDF to disk. Respects arXiv's rate-limit etiquette."""
    safe_id = paper.arxiv_id.replace("/", "_")
    out_path = ARXIV_RAW_DIR / f"{safe_id}.pdf"

    if not out_path.exists():
        resp = requests.get(paper.pdf_url, timeout=60)
        resp.raise_for_status()
        out_path.write_bytes(resp.content)
        time.sleep(sleep_seconds)  # be polite to arXiv's servers

    paper.local_path = str(out_path)
    return paper


def fetch_and_download(query: str, max_results: int = 25) -> List[ArxivPaper]:
    """Convenience wrapper: search + download in one call."""
    papers = search_arxiv(query=query, max_results=max_results)
    downloaded = []
    for p in papers:
        try:
            downloaded.append(download_paper(p))
        except requests.RequestException as e:
            logger.warning("Failed to download %s: %s", p.arxiv_id, e)
    return downloaded


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    results = fetch_and_download("cat:astro-ph.HE", max_results=5)
    for r in results:
        print(f"{r.arxiv_id} -> {r.local_path}")
