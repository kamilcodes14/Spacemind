# Backend image for SpaceMind (runs on Render's free 512 MB plan).
#
# The image ships with the pre-built index in data/chroma_db, so the server
# answers immediately. Embeddings use fastembed (ONNX, no PyTorch), which keeps
# memory well under 512 MB.

FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download the small embedding model at build time so the first question
# isn't slow and doesn't depend on a download at runtime.
ENV FASTEMBED_CACHE_PATH=/app/.fastembed_cache
RUN python -c "from fastembed import TextEmbedding; TextEmbedding('BAAI/bge-small-en-v1.5')"

COPY . .

ENV PYTHONUNBUFFERED=1

EXPOSE 8000

CMD ["sh", "-c", "uvicorn src.api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
