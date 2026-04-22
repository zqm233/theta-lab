"""API v1 router — RESTful-compliant routes.

This is the new v1 API that follows REST principles:
- Resource-based URLs (nouns, not verbs)
- Proper HTTP methods (GET, POST, PUT, DELETE)
- Hierarchical resource structure
- Query parameters for filtering/views

The legacy API (routes.py) will be deprecated after a 3-month transition period.
"""

from fastapi import APIRouter

from backend.api.chat_v1 import router as chat_router
from backend.api.crypto import router as crypto_router
from backend.api.health import router as health_router
from backend.api.options_v1 import router as options_router
from backend.api.portfolio_v1 import router as portfolio_router
from backend.api.settings import router as settings_router

router = APIRouter(prefix="/api/v1")

router.include_router(chat_router)
router.include_router(options_router)
router.include_router(portfolio_router)
router.include_router(crypto_router)
router.include_router(settings_router)
router.include_router(health_router)
