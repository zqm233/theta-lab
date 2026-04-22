"""pgvector (PostgreSQL) vector store implementation.

Uses pgvector extension for production-grade vector storage with PostgreSQL.
Requires PostgreSQL with pgvector extension installed.
"""

from __future__ import annotations

import logging
import os
from typing import Any

from langchain_core.embeddings import Embeddings
from langchain_postgres import PGVector

logger = logging.getLogger(__name__)


def create_vectorstore(
    embeddings: Embeddings,
    collection_name: str = "thetalab_knowledge",
    **kwargs: Any
) -> PGVector:
    """Create a pgvector vector store backed by PostgreSQL.

    Args:
        embeddings: The embeddings instance.
        collection_name: Name of the collection/table (default: "thetalab_knowledge").
        **kwargs: Additional PGVector arguments.

    Returns:
        A PGVector vector store instance.
    """
    connection_string = kwargs.pop("connection", None) or os.getenv(
        "POSTGRES_URL",
        "postgresql://user:password@localhost:5432/thetalab"
    )

    logger.info(
        "Creating pgvector store: collection=%s, db=%s",
        collection_name,
        connection_string.split("@")[-1] if "@" in connection_string else connection_string
    )

    return PGVector(
        embeddings=embeddings,
        collection_name=collection_name,
        connection=connection_string,
        **kwargs
    )
