"""
Local, free embedding model setup (HuggingFace bge-small).
No API key or paid service required.
"""

import logging
from llama_index.embeddings.huggingface import HuggingFaceEmbedding

from src.config import EMBED_MODEL_NAME

logger = logging.getLogger(__name__)

_embed_model_cache = None


def get_embed_model() -> HuggingFaceEmbedding:
    """
    Returns a cached HuggingFaceEmbedding instance so the model
    is only loaded into memory once per process.
    """
    global _embed_model_cache
    if _embed_model_cache is None:
        logger.info("Loading embedding model: %s", EMBED_MODEL_NAME)
        _embed_model_cache = HuggingFaceEmbedding(model_name=EMBED_MODEL_NAME)
    return _embed_model_cache
