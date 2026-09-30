# Backend image for SpaceMind.
#
# Important: this image bakes in whatever is currently in data/chroma_db.
# Run `python scripts/ingest.py` locally BEFORE building this image, so the
# index is already built and the deployed server doesn't need a persistent
# disk or to re-fetch/re-embed papers on startup.
#
# Build:  docker build -t spacemind .
# Run:    docker run -p 8000:8000 -e GROQ_API_KEY=your_key spacemind

FROM python:3.11-slim

WORKDIR /app

# build-essential is needed for some packages (e.g. chromadb's deps) to
# compile on slim images. tesseract-ocr is needed for the OCR fallback on
# scanned PDFs (the pytesseract Python package just calls out to it).
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1

EXPOSE 8000

# Render (and most PaaS hosts) inject $PORT at runtime; default to 8000
# for local `docker run`.
CMD ["sh", "-c", "uvicorn src.api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
