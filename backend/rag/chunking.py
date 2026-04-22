"""Text chunking strategies for document ingestion.

Provides utilities to split documents into chunks suitable for embedding
and retrieval.
"""

from __future__ import annotations

from typing import Any

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document


def create_text_splitter(
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
    **kwargs: Any
) -> RecursiveCharacterTextSplitter:
    """Create a text splitter with configurable chunking strategy.

    Args:
        chunk_size: Maximum characters per chunk (default: 1000).
        chunk_overlap: Overlap between chunks to preserve context (default: 200).
        **kwargs: Additional arguments for RecursiveCharacterTextSplitter.

    Returns:
        A configured text splitter.
    """
    separators = kwargs.pop("separators", ["\n\n", "\n", "。", ".", " ", ""])

    return RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=separators,
        **kwargs
    )


def chunk_documents(
    docs: list[dict[str, Any]],
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
) -> list[Document]:
    """Chunk a list of documents with metadata.

    Args:
        docs: List of dicts with 'content' and optional 'metadata' keys.
        chunk_size: Maximum characters per chunk.
        chunk_overlap: Overlap between chunks.

    Returns:
        List of LangChain Document objects with chunked content.
    """
    splitter = create_text_splitter(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
    chunks = []

    for doc in docs:
        content = doc.get("content", "")
        metadata = doc.get("metadata", {})

        if not content.strip():
            continue

        split_docs = splitter.create_documents(
            texts=[content],
            metadatas=[metadata]
        )
        chunks.extend(split_docs)

    return chunks
