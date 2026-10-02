"""
Local, free embedding model setup (BAAI/bge-small-en-v1.5).
No API key or paid service required.

Uses fastembed (ONNX runtime, no PyTorch) so the app fits on a small free host.
If fastembed isn't installed it falls back to the PyTorch/HuggingFace backend.
Both run the same model, so an index built with one works with the other.
"""

import logging
from typing import Any, List

from llama_index.core.base.embeddings.base import BaseEmbedding
from pydantic import PrivateAttr

from src.config import EMBED_MODEL_NAME

logger = logging.getLogger(__name__)

_embed_model_cache = None


class FastEmbedModel(BaseEmbedding):
    """Minimal llama-index embedding wrapper around fastembed.TextEmbedding."""

    _model: Any = PrivateAttr()

    def __init__(self, model_name: str, **kwargs: Any) -> None:
        super().__init__(model_name=model_name, **kwargs)
        from fastembed import TextEmbedding

        self._model = TextEmbedding(model_name=model_name)

    @classmethod
    def class_name(cls) -> str:
        return "FastEmbedModel"

    def _embed(self, texts: List[str]) -> List[List[float]]:
        return [vec.tolist() for vec in self._model.embed(texts)]

    def _get_query_embedding(self, query: str) -> List[float]:
        return self._embed([query])[0]

    async def _aget_query_embedding(self, query: str) -> List[float]:
        return self._get_query_embedding(query)

    def _get_text_embedding(self, text: str) -> List[float]:
        return self._embed([text])[0]

    def _get_text_embeddings(self, texts: List[str]) -> List[List[float]]:
        return self._embed(texts)


def get_embed_model():
    """Returns a cached embedding model so it is only loaded once per process."""
    global _embed_model_cache
    if _embed_model_cache is None:
        logger.info("Loading embedding model: %s", EMBED_MODEL_NAME)
        try:
            import fastembed  # noqa: F401

            _embed_model_cache = FastEmbedModel(model_name=EMBED_MODEL_NAME)
        except ImportError:
            logger.warning("fastembed not installed - falling back to HuggingFace (needs PyTorch)")
            from llama_index.embeddings.huggingface import HuggingFaceEmbedding

            _embed_model_cache = HuggingFaceEmbedding(model_name=EMBED_MODEL_NAME)
    return _embed_model_cache
