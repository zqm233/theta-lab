"""Embeddings factory — backend-agnostic.

Reads ``RAG_EMBEDDING_PROVIDER`` from the environment (default: ``google``)
and dispatches to the matching backend module. Each backend module
implements ``create_embeddings(**kwargs) -> Embeddings``.

Adding a new provider = one new file + one registry entry below.
"""

from __future__ import annotations

import importlib
import os
from typing import Any

from langchain_core.embeddings import Embeddings

from backend.rag import embeddings_google

_EMBEDDING_PROVIDERS: dict[str, Any] = {
    "google": embeddings_google,
}

try:
    from backend.rag import embeddings_openai
    _EMBEDDING_PROVIDERS["openai"] = embeddings_openai
except ImportError:
    pass


def _get_provider_module() -> Any:
    """Get the embeddings provider module based on environment config."""
    name = os.getenv("RAG_EMBEDDING_PROVIDER", "google").lower()
    module = _EMBEDDING_PROVIDERS.get(name)
    if module is None:
        supported = ", ".join(sorted(_EMBEDDING_PROVIDERS))
        raise ValueError(
            f"Unsupported RAG_EMBEDDING_PROVIDER: '{name}'. "
            f"Supported: {supported}"
        )
    return module


def get_embeddings(**kwargs: Any) -> Embeddings:
    """Create embeddings using the configured provider.

    Returns a LangChain Embeddings instance.
    """
    return _get_provider_module().create_embeddings(**kwargs)
