"""
Live web search — gives SpaceMind knowledge beyond its ingested paper
library (current events, anything not yet in the index, general questions).

Uses Tavily's API (https://tavily.com), which is built for LLMs to call:
it returns clean text snippets, not raw HTML to parse. Free tier covers
1,000 searches/month, no card required.

Treated as best-effort everywhere it's used — never raises, just returns
an empty list if no key is configured or the request fails, so a flaky
network or missing key degrades to "papers only" rather than crashing.
"""

import logging
from dataclasses import dataclass
from typing import List

import requests

from src.config import TAVILY_API_KEY, TAVILY_SEARCH_URL, WEB_SEARCH_MAX_RESULTS

logger = logging.getLogger(__name__)


@dataclass
class WebResult:
    title: str
    url: str
    snippet: str


def search_web(query: str, max_results: int = WEB_SEARCH_MAX_RESULTS) -> List[WebResult]:
    """Searches the live web. Returns [] (never raises) if unavailable."""
    if not TAVILY_API_KEY:
        logger.info("TAVILY_API_KEY not set — web search unavailable.")
        return []

    try:
        resp = requests.post(
            TAVILY_SEARCH_URL,
            json={
                "api_key": TAVILY_API_KEY,
                "query": query,
                "max_results": max_results,
                "search_depth": "basic",
            },
            timeout=15,
        )
        resp.raise_for_status()
        results = resp.json().get("results", [])
        return [
            WebResult(
                title=r.get("title", "Untitled"),
                url=r.get("url", ""),
                snippet=(r.get("content", "") or "")[:500],
            )
            for r in results
        ]
    except requests.RequestException as e:
        logger.warning("Web search failed (non-fatal): %s", e)
        return []


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    for r in search_web("James Webb Space Telescope latest discovery"):
        print(f"- {r.title} ({r.url})")
