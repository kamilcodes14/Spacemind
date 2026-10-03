# SpaceMind 🛰️

A retrieval-augmented (RAG) assistant that reads NASA and arXiv space/astrophysics
papers so you don't have to dig through hundreds of PDFs by hand. Ask a question
in plain English, get an answer grounded in your own paper library, with citations
pointing back to the real source papers.

## Features

- **Grounded, cited answers** — every claim is backed by a real chunk of a real
  paper, with a clickable link back to it (arXiv / NTRS / Semantic Scholar)
- **Live web knowledge** — falls back to a real-time web search when the paper
  library doesn't have a confident answer (or always, on request) — not
  limited to what's been ingested
- **Cross-encoder re-ranking** — retrieves a wide pool of candidate chunks, then
  re-ranks them for relevance before generating an answer
- **Confidence fallback** — if nothing in the index is a good enough match, it
  says so instead of guessing
- **Multi-turn conversation** — follow-up questions ("what about X?") are
  understood in context, both via the API (`session_id`) and CLI (`--chat`)
- **Adjustable depth** — toggle between `simple` (beginner-friendly) and
  `technical` answers
- **Suggested follow-ups** — each answer comes with 2-3 natural next questions
- **Shareable answer links** — every answer gets a `share_id`; anyone with the
  link sees that exact Q&A
- **Curated learning paths** — starter question sets for people new to a topic
  (`GET /learning-paths`)
- **Rate limiting** — protects your free Groq tier once this is public
- **OCR fallback** — scanned PDFs with no text layer get OCR'd instead of skipped
- **Four ingestion sources** — arXiv, NASA NTRS, NASA ADS, Semantic Scholar
- **Scheduled re-ingestion** — a GitHub Actions workflow keeps the library
  growing on its own (see `.github/workflows/reingest.yml`)

Runs **free** — no OpenAI/Anthropic API key required:
- **Generation:** [Groq](https://console.groq.com) (hosted, for deployment) or
  [Ollama](https://ollama.com) (local, for offline dev)
- **Embeddings:** HuggingFace `bge-small-en-v1.5` (local, CPU)
- **Vector store:** ChromaDB, persisted to disk

## How it works

```
arXiv / NTRS / ADS / S2  --->  PDF download  --->  OCR fallback  --->  chunk + embed  --->  ChromaDB
                                                                                                 |
                                                                                                 v
                                     your question  --->  condense (if multi-turn)  --->  retrieve wide pool
                                                                                                 |
                                                                                                 v
                                                                              re-rank  --->  confidence check
                                                                                                 |
                                                                                                 v
                                                              LLM answers with [N] citations  --->  follow-ups
```

## Project structure

```
spacemind/
├── src/
│   ├── config.py                    # all settings in one place
│   ├── ingestion/
│   │   ├── arxiv_fetch.py           # search + download arXiv papers
│   │   ├── nasa_ntrs.py             # search + download NASA NTRS reports
│   │   ├── nasa_ads.py              # search ADS, download via arXiv fallback
│   │   ├── semantic_scholar.py      # search + download open-access papers
│   │   └── chunker.py               # PDF -> text (+ OCR fallback) -> chunks
│   ├── embeddings/
│   │   └── embed_config.py          # local bge-small embedding model
│   ├── vectorstore/
│   │   └── chroma_store.py          # build/load the index, dedupes on doc_id
│   ├── query/
│   │   └── query_engine.py          # retrieval, re-ranking, citations, chat, depth
│   ├── storage/
│   │   └── answers_db.py            # SQLite store for shareable answer links
│   └── api/
│       └── main.py                  # FastAPI app
├── scripts/
│   ├── ingest.py                    # CLI: fetch + index papers
│   └── ask.py                       # CLI: ask a question, or --chat for multi-turn
├── frontend/
│   └── index.html                   # single-file web UI
├── .github/workflows/reingest.yml   # scheduled re-ingestion
├── data/                            # downloaded PDFs + Chroma DB + answers.db
├── requirements.txt
└── .env.example
```

## Setup

**1. Install system dependencies:**

- Python 3.10+
- **Tesseract OCR** (for the scanned-PDF fallback — this is a system binary, not
  just a Python package):
  - Windows: [installer here](https://github.com/UB-Mannheim/tesseract/wiki), then
    make sure `tesseract.exe` is on your PATH
  - macOS: `brew install tesseract`
  - Linux: `sudo apt-get install tesseract-ocr`
  - Don't want OCR? Set `OCR_ENABLED=false` in `.env` and skip this.

**2. Install Python dependencies:**

```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

**3. Copy the env template and fill in what you need:**

```bash
cp .env.example .env
```

For **local development**, set `LLM_PROVIDER=ollama` and install Ollama:
```bash
# https://ollama.com/download
ollama pull llama3.2
ollama serve
```

For **anything you'll deploy**, leave `LLM_PROVIDER=groq` (the default) and get
a free key at [console.groq.com/keys](https://console.groq.com/keys).

For **live web knowledge** (beyond the ingested papers), get a free key at
[app.tavily.com](https://app.tavily.com) and set `TAVILY_API_KEY`. Without
it, SpaceMind still works — it just stays papers-only, with a plain
"I don't have enough on this" instead of a web-sourced answer.

## Usage

### 1. Ingest papers

```bash
python scripts/ingest.py --arxiv "cat:astro-ph.HE" --ntrs "dark matter" --max-results 15
```

All four sources support the same pattern — mix and match in one call:

```bash
python scripts/ingest.py \
  --arxiv "cat:astro-ph.CO" \
  --ntrs "black holes" \
  --ads "exoplanet atmospheres" \
  --semantic-scholar "gravitational waves" \
  --max-results 20
```

- `--ads` needs `ADS_API_TOKEN` set (free: [ui.adsabs.harvard.edu/user/settings/token](https://ui.adsabs.harvard.edu/user/settings/token)). ADS is a citation index, not a full-text repository — papers download via their arXiv fallback where one exists; others are metadata-only and skipped.
- `--semantic-scholar` only downloads papers with a direct open-access PDF link; paywalled results are skipped.

Re-running with overlapping queries is safe — papers already in the index
(matched by `doc_id`) are skipped, not duplicated.

Already have PDFs and just want to (re)index them?
```bash
python scripts/ingest.py --skip-fetch
```

### 2. Ask questions — CLI

```bash
python scripts/ask.py "What is the leading candidate for dark matter?"
python scripts/ask.py --depth simple "What causes gamma-ray bursts?"
python scripts/ask.py --chat                    # interactive multi-turn session
python scripts/ask.py --use-web always "What's the latest JWST discovery?"
```

`--use-web`: `auto` (default — papers first, web fallback if not confident),
`always` (skip papers, always search live), `off` (papers only, old strict behavior).

### 3. Ask questions — API

```bash
uvicorn src.api.main:app --reload --port 8000
```

```bash
curl -X POST http://localhost:8000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What causes gamma-ray bursts?", "depth": "simple", "session_id": "abc123"}'
```

Response includes `answer`, `citations` (with real source `url`s, `origin`
is `"web"` for web-sourced ones), `follow_up_questions`, `confident`,
`used_web`, and a `share_id`. Set `"use_web": true` in the request body to
force a live search regardless of paper confidence, or `false` to disable
the fallback entirely.

Other endpoints:
- `GET /share/{share_id}` — retrieve a previously-given answer by its share link
- `GET /learning-paths` — curated starter question sets (edit `data/learning_paths.json` to add your own)
- `DELETE /session/{session_id}` — clear a conversation's history
- `GET /docs` — interactive Swagger UI

`session_id` is any string the client makes up (the frontend generates a
UUID and keeps it in `localStorage`). Omit it for a stateless single-turn
question.

### 4. Frontend

```bash
uvicorn src.api.main:app --reload --port 8000
```
Then open `frontend/index.html` directly in your browser (no build step,
no server needed for the page itself). It includes the depth toggle,
follow-up suggestions, share buttons, and a learning-paths panel.

## Deploying (backend on Render + frontend on Vercel)

**1. Build the index locally** (do this once, before deploying):
```bash
python scripts/ingest.py --arxiv "cat:astro-ph.HE" --ntrs "dark matter" --max-results 15
```
The built `data/chroma_db` gets committed and baked into the backend image, so
the deployed server never needs to re-fetch or re-embed on its own. Sanity-check
first: `python scripts/ask.py "What is dark matter?"`.

**2. Get a free Groq API key** at [console.groq.com/keys](https://console.groq.com/keys).
Note: `llama-3.3-70b-versatile` was retired by Groq on 2026-08-16; this project
defaults to `openai/gpt-oss-120b`. Check
[console.groq.com/docs/models](https://console.groq.com/docs/models) if you
ever hit a model-deprecation error.

**3. Deploy the backend to Render**
- Confirm `data/chroma_db` is non-empty — an empty index means every `/ask` call 503s.
- Push to GitHub. `data/raw`, `data/processed`, and `.env` are gitignored;
  `data/chroma_db` is **not** — you want that committed.
- In Render: **New → Blueprint**, point it at your repo (`render.yaml` is picked up automatically).
- Paste your `GROQ_API_KEY` when prompted, and `TAVILY_API_KEY` if you want
  live web fallback in production (optional — works fine without it).
  Adjust `RATE_LIMIT_PER_HOUR` there too, if you want.
- Confirm it's live: `https://<your-url>/health` → `{"status":"ok"}`.

(No Render account? `docker build` + any Docker-capable host works too.)

**4. Point the frontend at it** — in `frontend/index.html`, change:
```js
const DEFAULT_API_BASE = 'http://localhost:8000';
```
to your Render URL, then commit.

**5. Deploy the frontend to Vercel**
```bash
cd frontend && vercel --prod
```
(or connect the repo in the Vercel dashboard with root directory `frontend/`.)

**Note on Render's free tier:** it spins down after inactivity, so the first
request after a quiet stretch takes ~30–50s to wake back up.

**Note on shareable links:** `data/answers.db` (SQLite) does NOT survive a
Render redeploy or spin-down restart on the free tier. Fine for "share this
with a friend today"; swap in a real database if you need links to last.

## Scheduled re-ingestion

`.github/workflows/reingest.yml` runs weekly (configurable via cron),
ingests a fixed set of queries across core astronomy categories, and
commits the updated `data/chroma_db` back to the repo. Render's default
auto-deploy-on-push then redeploys with the fresh index — no manual steps
once it's set up. Trigger it manually anytime from the repo's **Actions** tab.

## Custom domain

Both Vercel and Render support custom domains for free on their standard
tiers: buy a `.com` wherever you like (Namecheap, Google Domains successor,
etc.), then add it in each project's dashboard under **Settings → Domains**
and follow the DNS instructions they give you. Point the domain at Vercel
(the frontend) — that's what people will actually visit.

## Mobile apps (Play Store / App Store)

Not in this repo yet. The realistic path: wrap `frontend/index.html` in a
thin native shell (Capacitor or React Native + WebView) pointing at your
deployed API, then submit through your own Apple Developer ($99/yr) and
Google Play ($25 one-time) accounts — that review process can't be done by
anyone but you. Ask if you want this scaffolded next.

## Notes

- Swap the embedding or LLM model any time in `.env` — nothing else in the
  codebase needs to change.
- `RERANK_ENABLED=false` in `.env` disables re-ranking if you want faster,
  slightly-less-precise answers.
- `MIN_SIMILARITY_SCORE` controls how willing SpaceMind is to say "I don't
  know" — raise it if it's answering too confidently from weak matches,
  lower it if it's refusing too often.
