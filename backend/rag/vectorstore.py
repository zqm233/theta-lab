"""VectorStore factory — backend-agnostic.

Reads ``RAG_VECTOR_DB`` from the environment (default: ``chroma``)
and dispatches to the matching backend module. Each backend module
implements ``create_vectorstore(embeddings, **kwargs) -> VectorStore``.

Adding a new vector store = one new file + one registry entry below.
"""

from __future__ import annotations

import importlib
import os
from typing import Any

from langchain_core.embeddings import Embeddings
from langchain_core.vectorstores import VectorStore

from backend.rag import vectorstore_chroma

_VECTOR_STORES: dict[str, Any] = {
    "chroma": vectorstore_chroma,
}

try:
    from backend.rag import vectorstore_pgvector
    _VECTOR_STORES["pgvector"] = vectorstore_pgvector
except ImportError:
    pass


def _get_vectorstore_module() -> Any:
    """Get the vector store module based on environment config."""
    name = os.getenv("RAG_VECTOR_DB", "chroma").lower()
    module = _VECTOR_STORES.get(name)
    if module is None:
        supported = ", ".join(sorted(_VECTOR_STORES))
        raise ValueError(
            f"Unsupported RAG_VECTOR_DB: '{name}'. "
            f"Supported: {supported}"
        )
    return module


def get_vectorstore(embeddings: Embeddings, **kwargs: Any) -> VectorStore:
    """Create a vector store using the configured backend.

    Args:
        embeddings: The embeddings instance to use.
        **kwargs: Additional arguments passed to the backend.

    Returns:
        A LangChain VectorStore instance.
    """
    return _get_vectorstore_module().create_vectorstore(embeddings, **kwargs)
