"""OKX MCP tool loader.

Uses langchain-mcp-adapters to convert OKX MCP server tools into
LangChain BaseTool instances that work directly with our LangGraph agent.

Access level is controlled by environment variable:
  OKX_MCP_ACCESS  — "readonly" (default) or "full"

Readonly mode loads all modules with --read-only (query tools only).
Full mode loads all modules without --read-only (trading enabled).
Always uses --live (demo mode requires separate API keys).
"""

from __future__ import annotations

import logging
import os
import shutil

from typing import Any

from langchain_core.tools import BaseTool

logger = logging.getLogger(__name__)

DEFAULT_ACCESS = "readonly"
DEFAULT_MODULES = "market,account,earn.dcd"

_mcp_tools: list[BaseTool] = []
_initialized = False


def _build_mcp_args() -> tuple[list[str], dict[str, str] | None]:
    """Build CLI args and optional env dict from current environment."""
    access = os.environ.get("OKX_MCP_ACCESS", DEFAULT_ACCESS).strip().lower()

    modules = os.environ.get("OKX_MCP_MODULES", DEFAULT_MODULES).strip()
    args = ["--modules", modules, "--live"]
    if access != "full":
        args.append("--read-only")

    api_key = os.environ.get("OKX_API_KEY", "")
    api_secret = os.environ.get("OKX_API_SECRET", "")
    passphrase = os.environ.get("OKX_PASSPHRASE", "")

    env = None
    if api_key and api_secret and passphrase:
        env = {
            "OKX_API_KEY": api_key,
            "OKX_SECRET_KEY": api_secret,
            "OKX_PASSPHRASE": passphrase,
        }
    else:
        logger.warning(
            "OKX API credentials not fully set — "
            "account/trade tools will not work"
        )

    return args, env


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

        args, env = _build_mcp_args()

        connection: dict = {
            "command": mcp_bin,
            "args": args,
            "transport": "stdio",
        }
        if env is not None:
            connection["env"] = env

        client = MultiServerMCPClient({"okx": connection})
        tools = await client.get_tools()
        for tool in tools:
            tool.handle_tool_error = True
            _patch_tool_content(tool)
        _mcp_tools = list(tools)
        logger.info(
            "Loaded %d OKX MCP tools (args=%s): %s",
            len(_mcp_tools),
            args,
            [t.name for t in _mcp_tools],
        )
    except Exception:
        logger.exception("Failed to load OKX MCP tools")

    _initialized = True
    return _mcp_tools


async def reinit_mcp_tools() -> list[BaseTool]:
    """Force re-initialization of MCP tools (e.g. after config change)."""
    global _mcp_tools, _initialized
    _mcp_tools = []
    _initialized = False
    return await init_mcp_tools()


def get_mcp_tools() -> list[BaseTool]:
    """Return cached MCP tools (empty list if not yet initialized)."""
    return list(_mcp_tools)


def get_mcp_tools_by_prefix(*prefixes: str) -> list[BaseTool]:
    """Return cached MCP tools whose names start with any of the given prefixes."""
    return [t for t in _mcp_tools if any(t.name.startswith(p) for p in prefixes)]
