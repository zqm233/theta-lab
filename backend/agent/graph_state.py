"""Graph state schemas and routing models for the LangGraph agent hierarchy.

Level-1 (top): Router → Options / Crypto / General
Level-2 (crypto sub): CryptoRouter → Market / Account / DCD
"""

from __future__ import annotations

from typing import Literal

from langgraph.graph import MessagesState
from pydantic import BaseModel


# ── Routing decisions (structured LLM output) ────────────────────

class RouteDecision(BaseModel):
    destination: Literal["options", "crypto", "general"]


class CryptoRouteDecision(BaseModel):
    destination: Literal["market", "account", "dcd"]


# ── Graph state types ────────────────────────────────────────────

class AgentState(MessagesState):
    route: str


class CryptoState(MessagesState):
    crypto_route: str


# ── Conditional-edge selectors ───────────────────────────────────

def get_route(state: AgentState) -> str:
    return state.get("route", "general")


def get_crypto_route(state: CryptoState) -> str:
    return state.get("crypto_route", "market")
