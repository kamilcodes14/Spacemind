"""
Central configuration for SpaceMind.
All paths, model names, and API settings live here so nothing is
hardcoded deeper in the codebase.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# --- Paths -------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
CHROMA_DIR = DATA_DIR / "chroma_db"

for d in (RAW_DIR, PROCESSED_DIR, CHROMA_DIR):
    d.mkdir(parents=True, exist_ok=True)

# --- Embeddings (local, free) -------------------------------------------
EMBED_MODEL_NAME = os.getenv("EMBED_MODEL_NAME", "BAAI/bge-small-en-v1.5")

# --- LLM generation -------------------------------------------------------
# "groq"   -> hosted, free-tier inference (needed for public deployment —
#             a deployed server has no GPU and can't serve concurrent users
#             fast enough on a local model).
# "ollama" -> local, free, no API key — keep this for offline development.
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "groq")

# Groq (used when LLM_PROVIDER=groq). Get a free key at console.groq.com/keys
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

# Ollama (used when LLM_PROVIDER=ollama)
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_REQUEST_TIMEOUT = float(os.getenv("OLLAMA_REQUEST_TIMEOUT", "180"))
# Capped so Ollama doesn't allocate a huge KV cache on CPU-only setups
# (some models default to 128K context, which can OOM a laptop).
OLLAMA_NUM_CTX = int(os.getenv("OLLAMA_NUM_CTX", "4096"))

# --- Vector store --------------------------------------------------------
CHROMA_COLLECTION_NAME = os.getenv("CHROMA_COLLECTION_NAME", "spacemind")

# --- Chunking --------------------------------------------------------------
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "1024"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "128"))

# --- Retrieval -------------------------------------------------------------
TOP_K = int(os.getenv("TOP_K", "5"))
# Pull this many candidates before re-ranking down to TOP_K — gives the
# re-ranker a wider pool to pick the genuinely best chunks from.
RETRIEVE_TOP_K = int(os.getenv("RETRIEVE_TOP_K", str(TOP_K * 3)))

# --- Re-ranking --------------------------------------------------------------
# Cross-encoder re-ranking noticeably improves answer relevance for the same
# retrieved pool, at the cost of a bit of extra CPU per query.
RERANK_ENABLED = os.getenv("RERANK_ENABLED", "true").lower() == "true"
RERANK_MODEL = os.getenv("RERANK_MODEL", "cross-encoder/ms-marco-MiniLM-L-6-v2")

# --- Confidence fallback -----------------------------------------------------
# If the best-matching chunk scores below this, we say "I don't have enough
# on this yet" instead of forcing the LLM to answer from a weak match.
MIN_SIMILARITY_SCORE = float(os.getenv("MIN_SIMILARITY_SCORE", "0.35"))

# --- OCR fallback ------------------------------------------------------------
# Scanned PDFs (no embedded text layer) get OCR'd instead of skipped, when
# extracted text falls below this many characters. Needs the Tesseract
# binary installed on the machine running ingestion (not just the Python
# package) — see README.
OCR_ENABLED = os.getenv("OCR_ENABLED", "true").lower() == "true"
OCR_MIN_CHARS = int(os.getenv("OCR_MIN_CHARS", "200"))

# --- Source APIs -----------------------------------------------------------
NASA_NTRS_SEARCH_URL = "https://ntrs.nasa.gov/api/citations/search"
ARXIV_API_URL = "http://export.arxiv.org/api/query"
ARXIV_ABS_URL = "https://arxiv.org/abs/"
NTRS_CITATION_URL = "https://ntrs.nasa.gov/citations/"

# NASA ADS — free, but needs an account token: https://ui.adsabs.harvard.edu/user/settings/token
ADS_API_TOKEN = os.getenv("ADS_API_TOKEN", "")
ADS_SEARCH_URL = "https://api.adsabs.harvard.edu/v1/search/query"
ADS_ABS_URL = "https://ui.adsabs.harvard.edu/abs/"

# Semantic Scholar — free, no key required for light/personal use. An
# optional key (https://www.semanticscholar.org/product/api) raises rate limits.
SEMANTIC_SCHOLAR_API_KEY = os.getenv("SEMANTIC_SCHOLAR_API_KEY", "")
SEMANTIC_SCHOLAR_SEARCH_URL = "https://api.semanticscholar.org/graph/v1/paper/search"
SEMANTIC_SCHOLAR_ABS_URL = "https://www.semanticscholar.org/paper/"

# --- Answer sharing ------------------------------------------------------------
# SQLite is enough for an MVP's shareable-answer links. Note: on Render's
# free tier this file does NOT survive a redeploy or a spun-down restart —
# fine for "share this answer with a friend today", not a permanent archive.
# Swap in a real database later if that matters for your use case.
ANSWERS_DB_PATH = os.getenv("ANSWERS_DB_PATH", str(DATA_DIR / "answers.db"))

# --- Rate limiting -----------------------------------------------------------
# Protects your free Groq tier once this is public. Per-IP, per-hour, on /ask.
RATE_LIMIT_PER_HOUR = os.getenv("RATE_LIMIT_PER_HOUR", "30")

# --- Web search (live "web knowledge" beyond the ingested paper library) -----
# Free tier, built for LLM use: https://app.tavily.com
# Used automatically when the paper library doesn't have a confident match,
# or always, if the caller explicitly asks for it (use_web=true).
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")
TAVILY_SEARCH_URL = "https://api.tavily.com/search"
WEB_SEARCH_ENABLED = os.getenv("WEB_SEARCH_ENABLED", "true").lower() == "true"
WEB_SEARCH_MAX_RESULTS = int(os.getenv("WEB_SEARCH_MAX_RESULTS", "4"))

# --- Auto-ingest on first start ---------------------------------------------------
# If the Chroma index is empty when the server (or scripts/ask.py) starts, build
# it automatically from these queries — no manual `python scripts/ingest.py`.
# Keep BOOTSTRAP_MAX_RESULTS small: on a free host (512 MB RAM) every extra PDF
# costs time and memory. Once data/chroma_db is populated (or committed to git and
# baked into the Docker image), this never runs again.
AUTO_INGEST_ON_STARTUP = os.getenv("AUTO_INGEST_ON_STARTUP", "true").lower() == "true"
BOOTSTRAP_ARXIV_QUERIES = [
    q.strip() for q in os.getenv(
        "BOOTSTRAP_ARXIV_QUERIES", "cat:astro-ph.HE,cat:astro-ph.CO"
    ).split(",") if q.strip()
]
BOOTSTRAP_NTRS_QUERIES = [
    q.strip() for q in os.getenv(
        "BOOTSTRAP_NTRS_QUERIES", "black holes,dark matter"
    ).split(",") if q.strip()
]
BOOTSTRAP_MAX_RESULTS = int(os.getenv("BOOTSTRAP_MAX_RESULTS", "8"))
