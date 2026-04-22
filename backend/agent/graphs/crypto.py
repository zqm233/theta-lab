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
from typing import Literal

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
from backend.agent.summarization import summarize_if_needed
from backend.agent.tools import CRYPTO_TOOLS

try:
    from backend.agent.tools_rag import search_crypto_knowledge
    _RAG_AVAILABLE = True
except ImportError:
    _RAG_AVAILABLE = False

logger = logging.getLogger(__name__)


def _make_router_node(model):
    """Return a callable that classifies crypto intent via function calling."""
    from langchain_core.tools import tool
    from typing import Literal
    
    @tool
    def route_crypto_query(destination: Literal["market", "account", "dcd"]) -> str:
        """Route the crypto query to the appropriate specialist.
        
        Args:
            destination: The crypto domain to route to - "market" for market analysis,
                       "account" for account/balance queries, "dcd" for dual investment.
        """
        return destination
    
    router_llm = model.delegate.bind_tools([route_crypto_query])

    async def _route(state: CryptoState):
        messages = await summarize_if_needed(
            model, state["messages"], max_recent=4, trigger_threshold=6
        )
        result = await router_llm.ainvoke(
            [SystemMessage(content=CRYPTO_ROUTER_PROMPT)] + messages
        )
        
        # Extract destination from tool calls
        destination = "market"  # default
        if hasattr(result, "tool_calls") and result.tool_calls:
            tc = result.tool_calls[0]
            destination = tc.get("args", {}).get("destination", "market")
        
        logger.info("Crypto router decision: %s", destination)
        return {"crypto_route": destination}

    return _route


def _make_wrapped_agent_node(model, agent, name: str):
    """Wrap an agent node to apply message summarization before execution."""

    async def _wrapped(state: CryptoState):
        messages = await summarize_if_needed(
            model, state["messages"], max_recent=4, trigger_threshold=6
        )
        result = await agent.ainvoke({"messages": messages})
        return result

    return _wrapped


def build_graph(model, profile_text: str, current_date: str):
    """Build the crypto subgraph.

    Uses Agent-as-Tool: Market Agent is wrapped as ``analyze_market``
    so DCD Agent can request market analysis without duplicating tools.
    """
    market_tools = get_mcp_tools_by_prefix("market_", "system_", "trade_") + get_cmc_tools()
    if _RAG_AVAILABLE:
        market_tools.append(search_crypto_knowledge)
    account_tools = get_mcp_tools_by_prefix("account_")

    market_agent = create_agent(
        model=model,
        system_prompt=MARKET_PROMPT.format(
            current_date=current_date,
            user_profile=profile_text
        ),
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
        system_prompt=ACCOUNT_PROMPT.format(
            current_date=current_date,
            user_profile=profile_text
        ),
        tools=account_tools or None,
        interrupt_before=["tools"] if account_tools else None,
        name="account",
    )

    dcd_agent = create_agent(
        model=model,
        system_prompt=DCD_PROMPT.format(
            current_date=current_date,
            user_profile=profile_text
        ),
        tools=dcd_tools or None,
        interrupt_before=["tools"] if dcd_tools else None,
        name="dcd",
    )

    builder = StateGraph(CryptoState)
    builder.add_node("crypto_router", _make_router_node(model))
    builder.add_node("market", _make_wrapped_agent_node(model, market_agent, "market"))
    builder.add_node("account", _make_wrapped_agent_node(model, account_agent, "account"))
    builder.add_node("dcd", _make_wrapped_agent_node(model, dcd_agent, "dcd"))

    builder.add_edge(START, "crypto_router")
    builder.add_conditional_edges("crypto_router", get_crypto_route)
    builder.add_edge("market", END)
    builder.add_edge("account", END)
    builder.add_edge("dcd", END)

    return builder.compile()
