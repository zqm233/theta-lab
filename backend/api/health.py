"""Health monitoring endpoints for RAG system.

Provides API endpoints to check RAG system health and degradation status.
"""

from fastapi import APIRouter

from backend.rag.monitoring import get_health_status

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/rag")
async def get_rag_health():
    """Get RAG system health status.
    
    Returns health metrics including:
    - Success/failure rates
    - Degradation status
    - Recent failure reasons
    """
    return get_health_status()
