"""Crypto domain subgraph — Market / Account / DCD agents.

Architecture::

    CryptoRouter → Market  → END
                 → Account → END
                 → DCD     → END
                     │
                     └── analyze_market (Agent-as-Tool → Market Agent)
"""

from __future__ import annotations

import logging

from langchain.agents import create_agent
from langchain_core.messages import SystemMessage
from langgraph.graph import END, START, StateGraph

from backend.agent.agent_tool import agent_as_tool
from backend.agent.graph_state import CryptoRouteDecision, CryptoState, get_crypto_route
from backend.agent.mcp_tools import get_cmc_tools, get_mcp_tools_by_prefix
from backend.agent.prompts import (
    ACCOUNT_PROMPT,
    CRYPTO_ROUTER_PROMPT,
    DCD_PROMPT,
    MARKET_PROMPT,
)
from backend.agent.tools import CRYPTO_TOOLS

logger = logging.getLogger(__name__)


def _make_router_node(model):
    """Return a callable that classifies crypto intent via structured output."""
    router_llm = model.delegate

    async def _route(state: CryptoState):
        structured = router_llm.with_structured_output(CryptoRouteDecision)
        result = await structured.ainvoke(
            [SystemMessage(content=CRYPTO_ROUTER_PROMPT)] + state["messages"]
        )
        logger.info("Crypto router decision: %s", result.destination)
        return {"crypto_route": result.destination}

    return _route


def build_graph(model, profile_text: str):
    """Build the crypto subgraph.

    Uses Agent-as-Tool: Market Agent is wrapped as ``analyze_market``
    so DCD Agent can request market analysis without duplicating tools.
    """
    market_tools = get_mcp_tools_by_prefix("market_", "system_", "trade_") + get_cmc_tools()
    account_tools = get_mcp_tools_by_prefix("account_")

    market_agent = create_agent(
        model=model,
        system_prompt=MARKET_PROMPT.format(user_profile=profile_text),
        tools=market_tools or None,
        name="market",
    )

    analyze_market = agent_as_tool(
        market_agent,
        name="analyze_market",
        description=(
            "Analyze cryptocurrency market conditions including sentiment "
            "(Fear & Greed), technicals (MA, RSI, MACD), on-chain data, "
            "and latest news. Use this when you need market context to "
            "evaluate a DCD product's risk."
        ),
    )

    dcd_tools = CRYPTO_TOOLS + get_mcp_tools_by_prefix("dcd_") + [analyze_market]

    account_agent = create_agent(
        model=model,
        system_prompt=ACCOUNT_PROMPT.format(user_profile=profile_text),
        tools=account_tools or None,
        interrupt_before=["tools"] if account_tools else None,
        name="account",
    )

    dcd_agent = create_agent(
        model=model,
        system_prompt=DCD_PROMPT.format(user_profile=profile_text),
        tools=dcd_tools or None,
        interrupt_before=["tools"] if dcd_tools else None,
        name="dcd",
    )

    builder = StateGraph(CryptoState)
    builder.add_node("crypto_router", _make_router_node(model))
    builder.add_node("market", market_agent)
    builder.add_node("account", account_agent)
    builder.add_node("dcd", dcd_agent)

    builder.add_edge(START, "crypto_router")
    builder.add_conditional_edges("crypto_router", get_crypto_route)
    builder.add_edge("market", END)
    builder.add_edge("account", END)
    builder.add_edge("dcd", END)

    return builder.compile()
