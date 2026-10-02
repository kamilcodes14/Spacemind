"""
ChromaDB vector store setup — persisted locally to disk so the index
survives between runs and doesn't need to be rebuilt every time.
"""

import logging
from typing import List, Optional

import chromadb
from llama_index.core import (
    VectorStoreIndex,
    StorageContext,
    Settings,
)
from llama_index.core.schema import BaseNode
from llama_index.vector_stores.chroma import ChromaVectorStore

from src.config import CHROMA_DIR, CHROMA_COLLECTION_NAME
from src.embeddings.embed_config import get_embed_model

logger = logging.getLogger(__name__)


def get_chroma_collection(collection_name: str = CHROMA_COLLECTION_NAME):
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    return client.get_or_create_collection(collection_name)


def _paper_key(source, file_name):
    return (source or "", file_name or "")


def _existing_doc_ids(collection) -> set:
    """Papers already present in the collection, identified by (source, file_name).

    NOTE: we can't use the stored "doc_id" for this - the Chroma integration
    overwrites it with its own random UUID, so it would never match a new paper
    and every ingest run would index everything again (duplicate chunks).
    """
    if collection.count() == 0:
        return set()
    existing = collection.get(include=["metadatas"])
    return {
        _paper_key(m.get("source"), m.get("file_name"))
        for m in existing.get("metadatas", [])
        if m and m.get("file_name")
    }


def build_index(nodes: List[BaseNode]) -> VectorStoreIndex:
    """
    Embeds `nodes` (via the local bge-small model) and writes them into
    the persisted Chroma collection, returning a queryable index. Nodes
    from a paper that's already indexed (same source + file name) are skipped, so
    ingesting overlapping categories/queries won't create duplicates.
    """
    Settings.embed_model = get_embed_model()

    collection = get_chroma_collection()
    already_indexed = _existing_doc_ids(collection)
    new_nodes = [
        n
        for n in nodes
        if _paper_key(n.metadata.get("source"), n.metadata.get("file_name"))
        not in already_indexed
    ]
    skipped = len(nodes) - len(new_nodes)
    if skipped:
        logger.info("Skipped %d chunks from already-indexed papers", skipped)

    vector_store = ChromaVectorStore(chroma_collection=collection)
    storage_context = StorageContext.from_defaults(vector_store=vector_store)

    if not new_nodes:
        logger.info("Nothing new to index — every paper in this batch was already indexed.")
        return VectorStoreIndex.from_vector_store(
            vector_store, embed_model=Settings.embed_model
        )

    index = VectorStoreIndex(
        new_nodes,
        storage_context=storage_context,
        embed_model=Settings.embed_model,
    )
    logger.info(
        "Indexed %d new chunks into Chroma collection '%s' (%d total vectors now)",
        len(new_nodes),
        CHROMA_COLLECTION_NAME,
        collection.count(),
    )
    return index


def load_index() -> Optional[VectorStoreIndex]:
    """
    Loads an existing index from the persisted Chroma collection
    without re-embedding anything. Returns None if the collection
    is empty (nothing has been ingested yet).
    """
    Settings.embed_model = get_embed_model()

    collection = get_chroma_collection()
    if collection.count() == 0:
        logger.warning(
            "Chroma collection '%s' is empty — run scripts/ingest.py first.",
            CHROMA_COLLECTION_NAME,
        )
        return None

    vector_store = ChromaVectorStore(chroma_collection=collection)
    index = VectorStoreIndex.from_vector_store(
        vector_store, embed_model=Settings.embed_model
    )
    return index
