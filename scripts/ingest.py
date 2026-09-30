"""
End-to-end ingestion pipeline:
  1. Fetch papers from arXiv and/or NASA NTRS
  2. Load + chunk the downloaded PDFs
  3. Embed the chunks (local bge-small) and write them into Chroma

Usage:
    python scripts/ingest.py --arxiv "cat:astro-ph.HE" --ntrs "dark matter" --max-results 10
    python scripts/ingest.py --skip-fetch     # just re-index whatever's already in data/raw/
"""

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.ingestion.arxiv_fetch import fetch_and_download as fetch_arxiv
from src.ingestion.nasa_ntrs import fetch_and_download as fetch_ntrs
from src.ingestion.nasa_ads import fetch_and_download as fetch_ads
from src.ingestion.semantic_scholar import fetch_and_download as fetch_s2
from src.ingestion.chunker import load_documents, chunk_documents
from src.vectorstore.chroma_store import build_index

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(description="Ingest papers into SpaceMind.")
    parser.add_argument("--arxiv", type=str, default=None, help="arXiv search query, e.g. 'cat:astro-ph.HE'")
    parser.add_argument("--ntrs", type=str, default=None, help="NASA NTRS search query, e.g. 'dark matter'")
    parser.add_argument("--ads", type=str, default=None, help="NASA ADS search query (needs ADS_API_TOKEN)")
    parser.add_argument("--semantic-scholar", type=str, default=None, help="Semantic Scholar search query (open-access papers only)")
    parser.add_argument("--max-results", type=int, default=15, help="Max results per source")
    parser.add_argument("--skip-fetch", action="store_true", help="Skip downloading; just re-index data/raw/")
    args = parser.parse_args()

    if not args.skip_fetch:
        if args.arxiv:
            logger.info("Fetching from arXiv: %s", args.arxiv)
            fetch_arxiv(args.arxiv, max_results=args.max_results)
        if args.ntrs:
            logger.info("Fetching from NASA NTRS: %s", args.ntrs)
            fetch_ntrs(args.ntrs, page_size=args.max_results)
        if args.ads:
            logger.info("Fetching from NASA ADS: %s", args.ads)
            fetch_ads(args.ads, rows=args.max_results)
        if args.semantic_scholar:
            logger.info("Fetching from Semantic Scholar: %s", args.semantic_scholar)
            fetch_s2(args.semantic_scholar, limit=args.max_results)
        if not any([args.arxiv, args.ntrs, args.ads, args.semantic_scholar]):
            logger.info("No source query given, skipping fetch. Use --skip-fetch to silence this.")

    logger.info("Loading + chunking documents from data/raw/ ...")
    documents = load_documents()
    if not documents:
        logger.warning("No documents found in data/raw/. Nothing to index.")
        return

    nodes = chunk_documents(documents)
    logger.info("Embedding + indexing %d chunks into Chroma ...", len(nodes))
    build_index(nodes)
    logger.info("Done. Ask questions with: python scripts/ask.py \"your question\"")


if __name__ == "__main__":
    main()
