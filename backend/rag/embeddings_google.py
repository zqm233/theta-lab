"""Google Embeddings implementation.

Uses Google Generative AI embeddings (text-embedding-004 or embedding-001).
"""

from __future__ import annotations

import os
from typing import Any

from langchain_google_genai import GoogleGenerativeAIEmbeddings


def create_embeddings(**kwargs: Any) -> GoogleGenerativeAIEmbeddings:
    """Create Google Generative AI embeddings.

    Uses the GOOGLE_API_KEY environment variable (same as main LLM).
    Model defaults to 'text-embedding-004' (without 'models/' prefix).
    """
    model = kwargs.pop("model", "text-embedding-004")
    api_key = kwargs.pop("api_key", None) or os.getenv("GOOGLE_API_KEY")

    return GoogleGenerativeAIEmbeddings(
        model=model,
        google_api_key=api_key,
        **kwargs
    )
