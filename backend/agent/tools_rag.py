"""RAG retrieval tools for agents.

Provides @tool decorated functions that agents can call to search
the knowledge base for relevant information.

Three-level fallback strategy:
1. Vector search (Chroma + embeddings)
2. Keyword matching (local file search)
3. Static fallback message
"""

from __future__ import annotations

import logging

from langchain.tools import tool

from backend.rag import get_retriever
from backend.rag.fallback import keyword_match_search, get_static_fallback_message

logger = logging.getLogger(__name__)


@tool
def search_options_knowledge(query: str) -> str:
    """Search the options trading knowledge base for educational content and strategies.

    Use this when you need to reference options trading concepts, strategies,
    risk management, Greeks, volatility analysis, or other options-related knowledge.

    Args:
        query: The question or topic to search for (e.g., "what is IV Crush?",
               "how to manage Sell Put risk", "delta hedging strategies").

    Returns:
        Retrieved knowledge passages relevant to the query.
    """
    # Level 1: Try vector search
    try:
        retriever = get_retriever(
            k=4,
            filter={"domain": "options"}
        )
        docs = retriever.invoke(query)

        if docs:
            context_parts = []
            for i, doc in enumerate(docs, 1):
                source = doc.metadata.get("source", "unknown")
                context_parts.append(f"[Source {i}: {source}]\n{doc.page_content}")

            context = "\n\n---\n\n".join(context_parts)
            return f"Retrieved options knowledge:\n\n{context}"
    except Exception as e:
        logger.warning("Vector search failed for options: %s", e)

    # Level 2: Try keyword matching
    try:
        result = keyword_match_search(query, domain="options")
        if result:
            return result
    except Exception as e:
        logger.warning("Keyword search failed for options: %s", e)

    # Level 3: Static fallback
    return get_static_fallback_message("options")


@tool
def search_crypto_knowledge(query: str) -> str:
    """Search the cryptocurrency knowledge base for educational content and strategies.

    Use this when you need to reference crypto trading concepts, DeFi, blockchain,
    risk management, or other crypto-related knowledge.

    Args:
        query: The question or topic to search for (e.g., "what is impermanent loss?",
               "how DCD works", "crypto risk management").

    Returns:
        Retrieved knowledge passages relevant to the query.
    """
    # Level 1: Try vector search
    try:
        retriever = get_retriever(
            k=4,
            filter={"domain": "crypto"}
        )
        docs = retriever.invoke(query)

        if docs:
            context_parts = []
            for i, doc in enumerate(docs, 1):
                source = doc.metadata.get("source", "unknown")
                context_parts.append(f"[Source {i}: {source}]\n{doc.page_content}")

            context = "\n\n---\n\n".join(context_parts)
            return f"Retrieved crypto knowledge:\n\n{context}"
    except Exception as e:
        logger.warning("Vector search failed for crypto: %s", e)

    # Level 2: Try keyword matching
    try:
        result = keyword_match_search(query, domain="crypto")
        if result:
            return result
    except Exception as e:
        logger.warning("Keyword search failed for crypto: %s", e)

    # Level 3: Static fallback
    return get_static_fallback_message("crypto")


@tool
def search_general_knowledge(query: str) -> str:
    """Search the general investment knowledge base.

    Use this for general investment concepts, risk management, portfolio theory,
    or other non-domain-specific financial knowledge.

    Args:
        query: The question or topic to search for.

    Returns:
        Retrieved knowledge passages relevant to the query.
    """
    # Level 1: Try vector search
    try:
        retriever = get_retriever(
            k=4,
            filter={"domain": "general"}
        )
        docs = retriever.invoke(query)

        if docs:
            context_parts = []
            for i, doc in enumerate(docs, 1):
                source = doc.metadata.get("source", "unknown")
                context_parts.append(f"[Source {i}: {source}]\n{doc.page_content}")

            context = "\n\n---\n\n".join(context_parts)
            return f"Retrieved general knowledge:\n\n{context}"
    except Exception as e:
        logger.warning("Vector search failed for general: %s", e)

    # Level 2: Try keyword matching
    try:
        result = keyword_match_search(query, domain="general")
        if result:
            return result
    except Exception as e:
        logger.warning("Keyword search failed for general: %s", e)

    # Level 3: Static fallback
    return get_static_fallback_message("general")


RAG_TOOLS = [
    search_options_knowledge,
    search_crypto_knowledge,
    search_general_knowledge,
]
