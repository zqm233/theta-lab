"""OpenAI Embeddings implementation.

Uses OpenAI text-embedding models (text-embedding-3-small or ada-002).
"""

from __future__ import annotations

import os
from typing import Any

from langchain_openai import OpenAIEmbeddings


def create_embeddings(**kwargs: Any) -> OpenAIEmbeddings:
    """Create OpenAI embeddings.

    Uses the OPENAI_API_KEY environment variable.
    Model defaults to 'text-embedding-3-small' (cheaper, good quality).
    """
    model = kwargs.pop("model", "text-embedding-3-small")
    api_key = kwargs.pop("api_key", None) or os.getenv("OPENAI_API_KEY")

    return OpenAIEmbeddings(
        model=model,
        openai_api_key=api_key,
        **kwargs
    )
