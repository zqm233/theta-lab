"""Chroma vector store implementation.

Uses Chroma for local, file-based vector storage with persistence.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from langchain_chroma import Chroma
from langchain_core.embeddings import Embeddings

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "rag" / "chroma"


def create_vectorstore(
    embeddings: Embeddings,
    collection_name: str = "thetalab_knowledge",
    **kwargs: Any
) -> Chroma:
    """Create a Chroma vector store with file persistence.

    Args:
        embeddings: The embeddings instance.
        collection_name: Name of the Chroma collection (default: "thetalab_knowledge").
        **kwargs: Additional Chroma arguments.

    Returns:
        A Chroma vector store instance.
    """
    persist_dir = kwargs.pop("persist_directory", None) or DATA_DIR
    persist_dir = Path(persist_dir)
    persist_dir.mkdir(parents=True, exist_ok=True)

    logger.info(
        "Creating Chroma vector store: collection=%s, persist_dir=%s",
        collection_name,
        persist_dir
    )

    return Chroma(
        collection_name=collection_name,
        embedding_function=embeddings,
        persist_directory=str(persist_dir),
        **kwargs
    )
