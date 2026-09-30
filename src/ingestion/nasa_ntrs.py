"""
Fetches technical reports from NASA's Technical Reports Server (NTRS).

NTRS's public search API needs no key:
https://ntrs.nasa.gov/api/citations/search
"""

import time
import logging
from pathlib import Path
from dataclasses import dataclass
from typing import List, Optional

import requests

from src.config import NASA_NTRS_SEARCH_URL, RAW_DIR

logger = logging.getLogger(__name__)

NTRS_RAW_DIR = RAW_DIR / "ntrs"
NTRS_RAW_DIR.mkdir(parents=True, exist_ok=True)

NTRS_BASE_URL = "https://ntrs.nasa.gov"


def _resolve_pdf_url(url: str) -> str:
    """NTRS sometimes returns relative paths (e.g. '/api/citations/.../x.pdf')
    instead of full URLs. Prefix the host when that happens."""
    if url.startswith("http://") or url.startswith("https://"):
        return url
    return NTRS_BASE_URL + url


@dataclass
class NtrsDocument:
    ntrs_id: str
    title: str
    abstract: str
    published: str
    pdf_url: Optional[str]
    local_path: str = ""


def search_ntrs(query: str = "dark matter", page_size: int = 25) -> List[NtrsDocument]:
    """
    Query NTRS's citation search API and return document metadata,
    including a direct PDF download link where NTRS has one on file.
    """
    body = {
        "q": query,
        "page": {"size": page_size, "from": 0},
    }
    resp = requests.post(NASA_NTRS_SEARCH_URL, json=body, timeout=30)
    resp.raise_for_status()
    payload = resp.json()

    docs = []
    for r in payload.get("results", []):
        citation = r.get("citation", r)
        pdf_url = None
        for dl in citation.get("downloads", []):
            if dl.get("links", {}).get("pdf"):
                pdf_url = _resolve_pdf_url(dl["links"]["pdf"])
                break
        docs.append(
            NtrsDocument(
                ntrs_id=str(citation.get("id", "")),
                title=citation.get("title", "Untitled"),
                abstract=citation.get("abstract", ""),
                published=citation.get("publicationDate", ""),
                pdf_url=pdf_url,
            )
        )
    logger.info("NTRS search '%s' returned %d documents", query, len(docs))
    return docs


def download_document(doc: NtrsDocument, sleep_seconds: float = 1.0) -> NtrsDocument:
    """Download a single NTRS document's PDF, if NTRS exposes one."""
    if not doc.pdf_url:
        return doc

    out_path = NTRS_RAW_DIR / f"{doc.ntrs_id}.pdf"
    if not out_path.exists():
        resp = requests.get(doc.pdf_url, timeout=60)
        resp.raise_for_status()
        out_path.write_bytes(resp.content)
        time.sleep(sleep_seconds)

    doc.local_path = str(out_path)
    return doc


def fetch_and_download(query: str, page_size: int = 25) -> List[NtrsDocument]:
    """Convenience wrapper: search + download in one call."""
    docs = search_ntrs(query=query, page_size=page_size)
    downloaded = []
    for d in docs:
        try:
            downloaded.append(download_document(d))
        except requests.RequestException as e:
            logger.warning("Failed to download %s: %s", d.ntrs_id, e)
    return downloaded


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    results = fetch_and_download("dark matter detection", page_size=5)
    for r in results:
        print(f"{r.ntrs_id} -> {r.local_path or '(no PDF available)'}")
