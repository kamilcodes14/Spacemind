"""
Loads downloaded PDFs (from arXiv, NTRS, ADS, and Semantic Scholar) into
LlamaIndex Documents and splits them into chunks/nodes ready for embedding.
"""

import logging
from pathlib import Path
from typing import List

from llama_index.core import Document
from llama_index.core.node_parser import SentenceSplitter
from llama_index.core.schema import BaseNode
from pypdf import PdfReader

from src.config import RAW_DIR, CHUNK_SIZE, CHUNK_OVERLAP, OCR_ENABLED, OCR_MIN_CHARS

logger = logging.getLogger(__name__)


def _extract_pdf_text(pdf_path: Path) -> str:
    reader = PdfReader(str(pdf_path))
    pages = []
    for page in reader.pages:
        try:
            pages.append(page.extract_text() or "")
        except Exception as e:  # malformed page, skip rather than fail the batch
            logger.warning("Could not extract a page from %s: %s", pdf_path.name, e)
    text = "\n".join(pages)

    if OCR_ENABLED and len(text.strip()) < OCR_MIN_CHARS:
        ocr_text = _ocr_pdf_text(pdf_path)
        if len(ocr_text.strip()) > len(text.strip()):
            logger.info(
                "%s looked scanned (%d chars of embedded text) — used OCR instead (%d chars)",
                pdf_path.name,
                len(text.strip()),
                len(ocr_text.strip()),
            )
            return ocr_text

    return text


def _ocr_pdf_text(pdf_path: Path, dpi: int = 200) -> str:
    """
    Rasterizes each page and runs Tesseract OCR over it. Used as a fallback
    for scanned PDFs that have no embedded text layer.

    Requires the Tesseract binary on PATH (not just the Python package —
    see README for install instructions per OS), and PyMuPDF for rendering.
    """
    try:
        import fitz  # PyMuPDF
        import pytesseract
        from PIL import Image
        import io
    except ImportError:
        logger.warning(
            "OCR dependencies (pymupdf, pytesseract, pillow) not installed — "
            "skipping OCR fallback for %s",
            pdf_path.name,
        )
        return ""

    try:
        doc = fitz.open(str(pdf_path))
        texts = []
        zoom = dpi / 72
        matrix = fitz.Matrix(zoom, zoom)
        for page in doc:
            pix = page.get_pixmap(matrix=matrix)
            img = Image.open(io.BytesIO(pix.tobytes("png")))
            texts.append(pytesseract.image_to_string(img))
        doc.close()
        return "\n".join(texts)
    except Exception as e:
        logger.warning("OCR failed for %s: %s", pdf_path.name, e)
        return ""


def load_documents(raw_dir: Path = RAW_DIR) -> List[Document]:
    """
    Walk data/raw/**/*.pdf and turn each file into a LlamaIndex Document,
    tagging it with source + filename metadata so citations can point back
    to the original paper later.
    """
    documents = []
    for pdf_path in sorted(raw_dir.rglob("*.pdf")):
        text = _extract_pdf_text(pdf_path)
        if not text.strip():
            logger.warning("No extractable text in %s, skipping", pdf_path.name)
            continue

        source = pdf_path.parent.name  # "arxiv", "ntrs", "ads", or "semantic_scholar"
        documents.append(
            Document(
                text=text,
                metadata={
                    "source": source,
                    "file_name": pdf_path.name,
                    "doc_id": pdf_path.stem,
                },
            )
        )
    logger.info("Loaded %d documents from %s", len(documents), raw_dir)
    return documents


def chunk_documents(
    documents: List[Document],
    chunk_size: int = CHUNK_SIZE,
    chunk_overlap: int = CHUNK_OVERLAP,
) -> List[BaseNode]:
    """Split documents into overlapping chunks (nodes) for embedding."""
    splitter = SentenceSplitter(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
    nodes = splitter.get_nodes_from_documents(documents)
    logger.info("Split %d documents into %d chunks", len(documents), len(nodes))
    return nodes


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    docs = load_documents()
    nodes = chunk_documents(docs)
    print(f"{len(docs)} documents -> {len(nodes)} chunks")
