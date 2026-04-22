"""RAG (Retrieval-Augmented Generation) knowledge system.

Provides configurable embeddings and vector store backends for retrieving
domain knowledge to augment agent responses.

Public API:
    get_embeddings(**kwargs) -> Embeddings
    get_vectorstore(embeddings, **kwargs) -> VectorStore
    get_retriever(k=4, score_threshold=None, filter=None) -> BaseRetriever
"""

from __future__ import annotations

from backend.rag.embeddings import get_embeddings
from backend.rag.vectorstore import get_vectorstore

__all__ = ["get_embeddings", "get_vectorstore", "get_retriever"]


def get_retriever(
    k: int = 4,
    score_threshold: float | None = None,
    filter: dict | None = None,
):
    """Create a retriever with the configured embedding and vector store.

    Args:
        k: Number of documents to retrieve (default: 4).
        score_threshold: Minimum similarity score (optional).
        filter: Metadata filter dict (e.g., {"domain": "options"}).

    Returns:
        A LangChain BaseRetriever instance.
    """
    embeddings = get_embeddings()
    vectorstore = get_vectorstore(embeddings)

    search_kwargs = {"k": k}
    if score_threshold is not None:
        search_kwargs["score_threshold"] = score_threshold
    if filter is not None:
        search_kwargs["filter"] = filter

    return vectorstore.as_retriever(search_kwargs=search_kwargs)
