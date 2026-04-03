"""OKX MCP tool loader.

Uses langchain-mcp-adapters to convert OKX MCP server tools into
LangChain BaseTool instances that work directly with our LangGraph agent.

Market data tools (ticker, orderbook, candles, funding rate, etc.) are
loaded by default and require no API key.
"""

from __future__ import annotations

import logging
import shutil
from typing import Any

from langchain_core.tools import BaseTool

logger = logging.getLogger(__name__)

_mcp_tools: list[BaseTool] = []
_initialized = False


async def init_mcp_tools() -> list[BaseTool]:
    """Discover and cache OKX MCP tools. Safe to call multiple times."""
    global _mcp_tools, _initialized
    if _initialized:
        return _mcp_tools

    mcp_bin = shutil.which("okx-trade-mcp")
    if not mcp_bin:
        logger.warning("okx-trade-mcp not found in PATH — OKX MCP tools disabled")
        _initialized = True
        return _mcp_tools

    try:
        from langchain_mcp_adapters.client import MultiServerMCPClient

        client = MultiServerMCPClient(
            {
                "okx": {
                    "command": mcp_bin,
                    "args": ["--modules", "market"],
                    "transport": "stdio",
                },
            }
        )
        tools = await client.get_tools()
        _mcp_tools = list(tools)
        logger.info(
            "Loaded %d OKX MCP tools: %s",
            len(_mcp_tools),
            [t.name for t in _mcp_tools],
        )
    except Exception:
        logger.exception("Failed to load OKX MCP tools")

    _initialized = True
    return _mcp_tools


def get_mcp_tools() -> list[BaseTool]:
    """Return cached MCP tools (empty list if not yet initialized)."""
    return list(_mcp_tools)
