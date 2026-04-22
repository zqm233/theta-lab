"""Document ingestion for RAG knowledge base.

Provides utilities to read documents from disk, chunk them, embed,
and load into the configured vector store.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from backend.rag import get_embeddings, get_vectorstore
from backend.rag.chunking import chunk_documents

logger = logging.getLogger(__name__)


def ingest_knowledge_directory(
    knowledge_dir: Path | str,
    collection_name: str = "thetalab_knowledge",
    domain: str | None = None,
    file_pattern: str = "*.md",
    **kwargs: Any
) -> None:
    """Ingest all documents from a directory into the vector store.

    Args:
        knowledge_dir: Path to directory containing knowledge documents.
        collection_name: Name of the collection/table in vector store.
        domain: Optional domain tag for metadata filtering (e.g., "options", "crypto").
        file_pattern: Glob pattern for matching files (default: "*.md").
        **kwargs: Additional arguments (chunk_size, chunk_overlap, etc.).
    """
    knowledge_dir = Path(knowledge_dir)
    if not knowledge_dir.exists():
        logger.warning("Knowledge directory does not exist: %s", knowledge_dir)
        return

    docs = []
    for file_path in knowledge_dir.rglob(file_pattern):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()

            metadata = {
                "source": str(file_path.relative_to(knowledge_dir.parent)),
                "filename": file_path.name,
            }
            if domain:
                metadata["domain"] = domain

            docs.append({"content": content, "metadata": metadata})
            logger.debug("Loaded document: %s", file_path.name)
        except Exception as e:
            logger.error("Failed to load %s: %s", file_path, e)

    if not docs:
        logger.warning("No documents found in %s with pattern %s", knowledge_dir, file_pattern)
        return

    logger.info("Loaded %d documents from %s", len(docs), knowledge_dir)

    chunk_size = kwargs.pop("chunk_size", 1000)
    chunk_overlap = kwargs.pop("chunk_overlap", 200)
    chunks = chunk_documents(docs, chunk_size=chunk_size, chunk_overlap=chunk_overlap)

    logger.info("Created %d chunks from %d documents", len(chunks), len(docs))

    embeddings = get_embeddings()
    vectorstore = get_vectorstore(embeddings, collection_name=collection_name)

    vectorstore.add_documents(chunks)

    logger.info(
        "Ingested %d chunks into vector store (collection: %s, domain: %s)",
        len(chunks),
        collection_name,
        domain or "all"
    )
