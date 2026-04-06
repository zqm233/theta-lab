"""MCP tool loader — OKX (stdio) + remote MCP servers (HTTP).

Uses langchain-mcp-adapters to convert MCP server tools into
LangChain BaseTool instances that work directly with our LangGraph agent.

Supported servers:
  - OKX Trade MCP (local stdio, access controlled by OKX_MCP_ACCESS)
  - CoinMarketCap MCP (remote streamable_http, key via CMC_MCP_API_KEY)
  - FlashAlpha MCP (remote streamable_http, per-tool apiKey injection)
"""

from __future__ import annotations

import logging
import os
import shutil
from datetime import datetime, timezone
from typing import Any

from langchain_core.tools import BaseTool

logger = logging.getLogger(__name__)

DEFAULT_ACCESS = "readonly"
DEFAULT_MODULES = "market,account,earn.dcd"

_mcp_tools: list[BaseTool] = []
_fa_tools: list[BaseTool] = []
_initialized = False

CMC_MCP_URL = "https://mcp.coinmarketcap.com/mcp"
FA_MCP_URL = "https://lab.flashalpha.com/mcp"
FA_DAILY_LIMIT = 5


def _utc_date_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def get_fa_remaining() -> int:
    """Return remaining FlashAlpha API calls for today (UTC)."""
    return max(0, FA_DAILY_LIMIT - get_fa_used())


def get_fa_used() -> int:
    """Return FlashAlpha API calls used today (UTC)."""
    from backend.db import get_conn

    conn = get_conn()
    row = conn.execute(
        "SELECT used FROM fa_usage WHERE date = ?", (_utc_date_key(),)
    ).fetchone()
    return row["used"] if row else 0


def _increment_fa_usage() -> None:
    from backend.db import get_conn

    conn = get_conn()
    conn.execute(
        "INSERT INTO fa_usage (date, used) VALUES (?, 1) "
        "ON CONFLICT(date) DO UPDATE SET used = used + 1",
        (_utc_date_key(),),
    )
    conn.commit()


def _build_okx_connection() -> dict | None:
    """Build OKX stdio connection config, or None if binary not found."""
    mcp_bin = shutil.which("okx-trade-mcp")
    if not mcp_bin:
        logger.warning("okx-trade-mcp not found in PATH — OKX MCP tools disabled")
        return None

    access = os.environ.get("OKX_MCP_ACCESS", DEFAULT_ACCESS).strip().lower()
    modules = os.environ.get("OKX_MCP_MODULES", DEFAULT_MODULES).strip()
    args = ["--modules", modules, "--live"]
    if access != "full":
        args.append("--read-only")

    api_key = os.environ.get("OKX_API_KEY", "")
    api_secret = os.environ.get("OKX_API_SECRET", "")
    passphrase = os.environ.get("OKX_PASSPHRASE", "")

    connection: dict = {"command": mcp_bin, "args": args, "transport": "stdio"}
    if api_key and api_secret and passphrase:
        connection["env"] = {
            "OKX_API_KEY": api_key,
            "OKX_SECRET_KEY": api_secret,
            "OKX_PASSPHRASE": passphrase,
        }
    else:
        logger.warning("OKX API credentials not fully set — account/trade tools will not work")

    return connection


def _build_cmc_connection() -> dict | None:
    """Build CoinMarketCap remote MCP connection, or None if key not set."""
    api_key = os.environ.get("CMC_MCP_API_KEY", "").strip()
    if not api_key:
        logger.info("CMC_MCP_API_KEY not set — CoinMarketCap MCP disabled")
        return None

    return {
        "url": CMC_MCP_URL,
        "transport": "streamable_http",
        "headers": {"X-CMC-MCP-API-KEY": api_key},
    }


def _build_fa_connection() -> dict | None:
    """Build FlashAlpha remote MCP connection, or None if key not set.

    FlashAlpha uses per-tool apiKey params (not HTTP headers), so the
    connection itself needs no auth — apiKey is injected by _patch_fa_tool.
    """
    api_key = os.environ.get("FA_API_KEY", "").strip()
    if not api_key:
        logger.info("FA_API_KEY not set — FlashAlpha MCP disabled")
        return None

    return {
        "url": FA_MCP_URL,
        "transport": "streamable_http",
    }


def _patch_fa_tool(tool: BaseTool, api_key: str) -> None:
    """Inject apiKey into every FA tool call, hide it from the LLM schema,
    and track daily usage."""
    original = tool.coroutine
    if original is None:
        return

    async def _wrapper(*args: Any, _orig: Any = original, _key: str = api_key, **kwargs: Any) -> Any:
        _increment_fa_usage()
        kwargs["apiKey"] = _key
        return await _orig(*args, **kwargs)

    tool.coroutine = _wrapper

    schema_cls = tool.args_schema
    if not schema_cls or not hasattr(schema_cls, "model_fields"):
        return
    if "apiKey" not in schema_cls.model_fields:
        return

    from pydantic import Field, create_model

    field_defs: dict[str, Any] = {}
    for name, fi in schema_cls.model_fields.items():
        if name == "apiKey":
            continue
        default = ... if fi.is_required() else fi.default
        field_defs[name] = (
            fi.annotation,
            Field(default=default, description=fi.description or ""),
        )
    tool.args_schema = create_model(schema_cls.__name__, **field_defs)


def _flatten_content(content: Any) -> str:
    """Convert list-of-blocks content to a plain string.

    MCP tools return content as ``[{"type": "text", "text": "..."}]``.
    Some LLM providers (OpenRouter / OpenInference) reject list-type content
    in ToolMessages with a 422.  Flattening to a string avoids this.
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and block.get("type") == "text":
                parts.append(block.get("text", ""))
            else:
                parts.append(str(block))
        return "\n".join(parts)
    return str(content) if content else ""


def _patch_tool_content(tool: BaseTool) -> None:
    """Wrap the tool's coroutine so it always returns string content."""
    original = tool.coroutine
    if original is None:
        return

    async def _wrapper(*args: Any, _orig: Any = original, **kwargs: Any) -> Any:
        result = await _orig(*args, **kwargs)
        if isinstance(result, tuple):
            content, artifact = result
            return _flatten_content(content), artifact
        return _flatten_content(result)

    tool.coroutine = _wrapper
    tool.response_format = "content_and_artifact"


async def _load_server_tools(name: str, connection: dict) -> list[BaseTool]:
    """Load tools from a single MCP server, returning [] on failure."""
    from langchain_mcp_adapters.client import MultiServerMCPClient

    try:
        client = MultiServerMCPClient({name: connection})
        tools = await client.get_tools()
        for tool in tools:
            tool.handle_tool_error = True
            _patch_tool_content(tool)
        logger.info("Loaded %d %s tools: %s", len(tools), name, [t.name for t in tools])
        return list(tools)
    except Exception:
        logger.exception("Failed to load %s MCP tools", name)
        return []


async def init_mcp_tools() -> list[BaseTool]:
    """Discover and cache all MCP tools. Safe to call multiple times.

    Each MCP server is loaded independently so that one failure
    does not prevent the others from initializing.
    """
    global _mcp_tools, _fa_tools, _initialized
    if _initialized:
        return _mcp_tools

    # ── OKX (stdio) ──
    okx_conn = _build_okx_connection()
    if okx_conn:
        _mcp_tools.extend(await _load_server_tools("okx", okx_conn))

    # ── CoinMarketCap (remote HTTP) ──
    cmc_conn = _build_cmc_connection()
    if cmc_conn:
        _mcp_tools.extend(await _load_server_tools("cmc", cmc_conn))

    if not _mcp_tools:
        logger.warning("No OKX/CMC MCP tools loaded")

    # ── FlashAlpha (remote HTTP, per-tool apiKey injection) ──
    fa_conn = _build_fa_connection()
    if fa_conn:
        fa_raw = await _load_server_tools("flashalpha", fa_conn)
        if fa_raw:
            api_key = os.environ.get("FA_API_KEY", "").strip()
            for tool in fa_raw:
                _patch_fa_tool(tool, api_key)
            _fa_tools = fa_raw
            _mcp_tools.extend(_fa_tools)

    _initialized = True
    return _mcp_tools


async def reinit_mcp_tools() -> list[BaseTool]:
    """Force re-initialization of MCP tools (e.g. after config change)."""
    global _mcp_tools, _fa_tools, _initialized
    _mcp_tools = []
    _fa_tools = []
    _initialized = False
    return await init_mcp_tools()


def get_mcp_tools() -> list[BaseTool]:
    """Return cached MCP tools (empty list if not yet initialized)."""
    return list(_mcp_tools)


def get_mcp_tools_by_prefix(*prefixes: str) -> list[BaseTool]:
    """Return cached MCP tools whose names start with any of the given prefixes."""
    return [t for t in _mcp_tools if any(t.name.startswith(p) for p in prefixes)]


def get_cmc_tools() -> list[BaseTool]:
    """Return cached CoinMarketCap MCP tools (names typically start with cmc_ prefixes)."""
    okx_prefixes = ("market_", "account_", "dcd_", "system_", "trade_", "skills_")
    fa_names = {t.name for t in _fa_tools}
    return [
        t for t in _mcp_tools
        if not any(t.name.startswith(p) for p in okx_prefixes) and t.name not in fa_names
    ]


def get_fa_tools() -> list[BaseTool]:
    """Return cached FlashAlpha MCP tools."""
    return list(_fa_tools)
