#!/usr/bin/env python3
"""Build RAG knowledge index from documents in data/rag/knowledge/.

This script reads all documents from the knowledge directories, chunks them,
embeds them, and loads them into the configured vector store.

Usage:
    python scripts/build_rag_index.py

Environment variables:
    RAG_EMBEDDING_PROVIDER: google (default) | openai
    RAG_VECTOR_DB: chroma (default) | pgvector
    GOOGLE_API_KEY or OPENAI_API_KEY: Required for embeddings
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.rag.ingest import ingest_knowledge_directory

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)

logger = logging.getLogger(__name__)


def main():
    """Main entry point for building the RAG index."""
    data_dir = Path(__file__).parent.parent / "data" / "rag" / "knowledge"

    if not data_dir.exists():
        logger.error("Knowledge directory does not exist: %s", data_dir)
        logger.info("Creating directory structure...")
        data_dir.mkdir(parents=True, exist_ok=True)
        (data_dir / "options").mkdir(exist_ok=True)
        (data_dir / "crypto").mkdir(exist_ok=True)
        (data_dir / "general").mkdir(exist_ok=True)
        logger.info("Created directories. Please add documents and run again.")
        return

    options_dir = data_dir / "options"
    if options_dir.exists() and any(options_dir.rglob("*.md")):
        logger.info("=" * 60)
        logger.info("Indexing options knowledge...")
        logger.info("=" * 60)
        try:
            ingest_knowledge_directory(options_dir, domain="options")
        except Exception as e:
            logger.error("Failed to index options knowledge: %s", e)
    else:
        logger.info("No documents found in %s, skipping", options_dir)

    crypto_dir = data_dir / "crypto"
    if crypto_dir.exists() and any(crypto_dir.rglob("*.md")):
        logger.info("=" * 60)
        logger.info("Indexing crypto knowledge...")
        logger.info("=" * 60)
        try:
            ingest_knowledge_directory(crypto_dir, domain="crypto")
        except Exception as e:
            logger.error("Failed to index crypto knowledge: %s", e)
    else:
        logger.info("No documents found in %s, skipping", crypto_dir)

    general_dir = data_dir / "general"
    if general_dir.exists() and any(general_dir.rglob("*.md")):
        logger.info("=" * 60)
        logger.info("Indexing general knowledge...")
        logger.info("=" * 60)
        try:
            ingest_knowledge_directory(general_dir, domain="general")
        except Exception as e:
            logger.error("Failed to index general knowledge: %s", e)
    else:
        logger.info("No documents found in %s, skipping", general_dir)

    logger.info("=" * 60)
    logger.info("RAG index build complete!")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
