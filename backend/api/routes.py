"""API router hub — aggregates all domain-specific sub-routers.

Sub-modules:
  chat.py      — Agent SSE streaming, HITL confirmation, history, profile
  options.py   — Price, options chain, volatility, sell-put analysis, earnings
  portfolio.py — Accounts, holdings, trades, snapshots
  crypto.py    — Dual Investment products, OKX balance & DCD orders
  settings.py  — LLM config, exchange credentials, MCP integrations
  schemas.py   — Pydantic request/response models (shared across sub-modules)
"""

from fastapi import APIRouter

from backend.api.chat import router as chat_router
from backend.api.crypto import router as crypto_router
from backend.api.health import router as health_router
from backend.api.options import router as options_router
from backend.api.portfolio import router as portfolio_router
from backend.api.settings import router as settings_router

router = APIRouter(prefix="/api")

router.include_router(chat_router)
router.include_router(options_router)
router.include_router(portfolio_router)
router.include_router(crypto_router)
router.include_router(settings_router)
router.include_router(health_router)
