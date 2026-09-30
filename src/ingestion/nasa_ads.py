"""
Fetches paper metadata from NASA's Astrophysics Data System (ADS).

ADS is primarily a citation/metadata index, not a full-text repository —
most papers don't have a directly downloadable PDF through ADS itself.
Where a paper has an arXiv identifier (common for astro papers), we
download the PDF from arXiv instead; papers with no arXiv fallback are
recorded as metadata-only and skipped for indexing.

Needs a free API token: https://ui.adsabs.harvard.edu/user/settings/token
"""

import time
import logging
from pathlib import Path
from dataclasses import dataclass
from typing import List, Optional

import requests

from src.config import ADS_API_TOKEN, ADS_SEARCH_URL, RAW_DIR
from src.ingestion.arxiv_fetch import ArxivPaper, download_paper

logger = logging.getLogger(__name__)

ADS_RAW_DIR = RAW_DIR / "ads"
ADS_RAW_DIR.mkdir(parents=True, exist_ok=True)


@dataclass
class AdsPaper:
    bibcode: str
    title: str
    abstract: str
    published: str
    arxiv_id: Optional[str]
    local_path: str = ""


def search_ads(query: str = "dark matter", rows: int = 25) -> List[AdsPaper]:
    """Query ADS's search API and return paper metadata."""
    if not ADS_API_TOKEN:
        raise RuntimeError(
            "ADS_API_TOKEN is not set. Get a free token at "
            "https://ui.adsabs.harvard.edu/user/settings/token and set it "
            "as an environment variable to use --ads."
        )

    headers = {"Authorization": f"Bearer {ADS_API_TOKEN}"}
    params = {
        "q": query,
        "rows": rows,
        "fl": "bibcode,title,abstract,pubdate,identifier",
    }
    resp = requests.get(ADS_SEARCH_URL, headers=headers, params=params, timeout=30)
    resp.raise_for_status()
    docs = resp.json().get("response", {}).get("docs", [])

    papers = []
    for d in docs:
        arxiv_id = None
        for ident in d.get("identifier", []):
            if ident.lower().startswith("arxiv:"):
                arxiv_id = ident.split(":", 1)[1]
                break

        title = d.get("title", ["Untitled"])
        papers.append(
            AdsPaper(
                bibcode=d.get("bibcode", ""),
                title=title[0] if isinstance(title, list) else str(title),
                abstract=d.get("abstract", "") or "",
                published=d.get("pubdate", ""),
                arxiv_id=arxiv_id,
            )
        )
    logger.info("ADS search '%s' returned %d records", query, len(papers))
    return papers


def download_paper_ads(paper: AdsPaper, sleep_seconds: float = 1.0) -> AdsPaper:
    """
    Downloads the PDF via arXiv when the ADS record has an arXiv ID.
    Records with no arXiv fallback are left metadata-only (no local_path).
    """
    if not paper.arxiv_id:
        logger.info(
            "No arXiv fallback for ADS record %s ('%s') — metadata only, skipping PDF.",
            paper.bibcode,
            paper.title[:60],
        )
        return paper

    # Reuse the arXiv downloader — same PDF, just discovered via ADS.
    arxiv_stub = ArxivPaper(
        arxiv_id=paper.arxiv_id,
        title=paper.title,
        authors=[],
        summary=paper.abstract,
        published=paper.published,
        pdf_url=f"https://arxiv.org/pdf/{paper.arxiv_id}",
    )
    downloaded = download_paper(arxiv_stub, sleep_seconds=sleep_seconds)
    paper.local_path = downloaded.local_path
    return paper


def fetch_and_download(query: str, rows: int = 25) -> List[AdsPaper]:
    """Convenience wrapper: search + download (where possible) in one call."""
    papers = search_ads(query=query, rows=rows)
    downloaded = []
    for p in papers:
        try:
            downloaded.append(download_paper_ads(p))
        except requests.RequestException as e:
            logger.warning("Failed to download ADS record %s: %s", p.bibcode, e)
    return downloaded


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    results = fetch_and_download("dark matter detection", rows=5)
    for r in results:
        print(f"{r.bibcode} -> {r.local_path or '(metadata only, no PDF)'}")
