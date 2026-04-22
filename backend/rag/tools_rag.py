"""RAG retrieval tools for agents with graceful degradation.

Provides @tool decorated functions that agents can call to search
the knowledge base. Implements three-level fallback strategy:
1. RAG (vector search)
2. Keyword matching (Markdown files)
3. Static knowledge (embedded in prompt)
"""

from __future__ import annotations

import logging

from langchain.tools import tool

from backend.rag import get_retriever
from backend.rag.fallback import keyword_match_search, get_static_fallback_message
from backend.rag.monitoring import record_rag_success, record_fallback_success, record_failure

logger = logging.getLogger(__name__)


def search_with_fallback(query: str, domain: str, k: int = 4) -> str:
    """Search knowledge base with three-level fallback strategy.
    
    Level 1: RAG (vector search) - most accurate, requires embeddings
    Level 2: Keyword matching - fast, works offline
    Level 3: Static message - always works, minimal info
    
    Args:
        query: User query string.
        domain: Knowledge domain ("options", "crypto", "general").
        k: Number of documents to retrieve (for RAG level).
        
    Returns:
        Retrieved knowledge content.
    """
    # Level 1: Try RAG (vector search)
    try:
        retriever = get_retriever(k=k, filter={"domain": domain})
        docs = retriever.invoke(query)
        
        if docs:
            logger.info("[RAG] Successfully retrieved %d documents for query: %s", len(docs), query[:50])
            record_rag_success()
            
            context_parts = []
            for i, doc in enumerate(docs, 1):
                source = doc.metadata.get("source", "unknown")
                context_parts.append(f"[Source {i}: {source}]\n{doc.page_content}")
            
            context = "\n\n---\n\n".join(context_parts)
            return f"📚 Retrieved {domain} knowledge (RAG):\n\n{context}"
    
    except Exception as e:
        logger.warning("[RAG] Vector search failed for query '%s': %s. Trying fallback...", query[:50], e)
    
    # Level 2: Try keyword matching
    try:
        fallback_result = keyword_match_search(query, domain)
        if fallback_result:
            logger.info("[Fallback] Keyword match successful for query: %s", query[:50])
            record_fallback_success()
            return f"📄 Retrieved {domain} knowledge (Keyword Match):\n\n{fallback_result}"
    
    except Exception as e:
        logger.warning("[Fallback] Keyword search failed: %s", e)
    
    # Level 3: Return static fallback message
    logger.error("[Fallback] All search methods failed. Returning static guidance.")
    record_failure(f"domain={domain}, query={query[:30]}")
    
    static_msg = get_static_fallback_message(domain)
    return f"⚠️ Knowledge base temporarily unavailable. Using embedded guidance:\n\n{static_msg}"


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
    return search_with_fallback(query, domain="options", k=4)


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
    return search_with_fallback(query, domain="crypto", k=4)


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
    return search_with_fallback(query, domain="general", k=4)


RAG_TOOLS = [
    search_options_knowledge,
    search_crypto_knowledge,
    search_general_knowledge,
]
