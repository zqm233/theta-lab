"""Settings endpoints — LLM config, exchange credentials, MCP integrations."""

from __future__ import annotations

import logging
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException

from backend.api.schemas import (
    CmcMcpConfigRequest,
    FlashAlphaConfigRequest,
    LLMConfigRequest,
    LangSmithConfigRequest,
    OkxMcpConfigRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter()

_SUPPORTED_PROVIDERS = ["google", "openai", "anthropic"]
_PROVIDER_API_KEY_ENV = {
    "google": "GOOGLE_API_KEY",
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
}

_ENV_PATH = Path(__file__).resolve().parent.parent.parent / ".env"


def _persist_env(kv: dict[str, str]) -> None:
    """Upsert key=value pairs into the project .env file."""
    lines: list[str] = []
    if _ENV_PATH.exists():
        lines = _ENV_PATH.read_text().splitlines()

    updated_keys: set[str] = set()
    new_lines: list[str] = []
    for line in lines:
        key = line.split("=", 1)[0].strip() if "=" in line else ""
        if key in kv:
            new_lines.append(f'{key}="{kv[key]}"')
            updated_keys.add(key)
        else:
            new_lines.append(line)

    for k, v in kv.items():
        if k not in updated_keys:
            new_lines.append(f'{k}="{v}"')

    _ENV_PATH.write_text("\n".join(new_lines) + "\n")


# ── LLM Configuration ──────────────────────────────────────────────

@router.get("/llm/config")
def get_llm_config():
    """Return current LLM configuration (API key is masked)."""
    provider = os.getenv("LLM_PROVIDER", "").lower()
    model = os.getenv("LLM_MODEL", "")
    base_url = os.getenv("LLM_BASE_URL", "")
    api_key_env = _PROVIDER_API_KEY_ENV.get(provider, "")
    has_key = bool(os.getenv(api_key_env, ""))
    configured = bool(provider and model and has_key)
    return {
        "provider": provider,
        "model": model,
        "baseUrl": base_url,
        "configured": configured,
        "supportedProviders": _SUPPORTED_PROVIDERS,
    }


@router.post("/llm/config")
def set_llm_config(body: LLMConfigRequest):
    """Update LLM provider, model, API key, and optional base URL."""
    provider = body.provider.lower().strip()
    if provider not in _SUPPORTED_PROVIDERS:
        raise HTTPException(
            400,
            f"Unsupported provider: '{provider}'. Supported: {', '.join(_SUPPORTED_PROVIDERS)}",
        )

    env_updates: dict[str, str] = {
        "LLM_PROVIDER": provider,
    }

    if body.model.strip():
        env_updates["LLM_MODEL"] = body.model.strip()
        os.environ["LLM_MODEL"] = body.model.strip()

    if body.baseUrl.strip():
        env_updates["LLM_BASE_URL"] = body.baseUrl.strip()
        os.environ["LLM_BASE_URL"] = body.baseUrl.strip()
    else:
        os.environ.pop("LLM_BASE_URL", None)

    if body.apiKey.strip():
        key_env = _PROVIDER_API_KEY_ENV[provider]
        env_updates[key_env] = body.apiKey.strip()
        os.environ[key_env] = body.apiKey.strip()

    os.environ["LLM_PROVIDER"] = provider
    _persist_env(env_updates)

    from backend.app import reset_agent
    reset_agent()

    has_key = bool(os.getenv(_PROVIDER_API_KEY_ENV[provider], ""))
    return {
        "provider": provider,
        "model": body.model.strip(),
        "baseUrl": body.baseUrl.strip(),
        "configured": has_key,
    }


@router.post("/llm/test")
async def test_llm_connection():
    """Send a minimal prompt to verify LLM connectivity and return latency."""
    import time
    from backend.agent.llm import create_llm

    try:
        llm = create_llm()
    except ValueError as e:
        raise HTTPException(400, str(e))

    start = time.monotonic()
    try:
        resp = await llm.ainvoke("Say OK")
        latency_ms = int((time.monotonic() - start) * 1000)
        content = resp.content if hasattr(resp, "content") else str(resp)
        return {"ok": True, "latency_ms": latency_ms, "reply": content[:100]}
    except Exception as e:
        latency_ms = int((time.monotonic() - start) * 1000)
        msg = str(e)
        if len(msg) > 300:
            msg = msg[:300] + "..."
        return {"ok": False, "latency_ms": latency_ms, "error": msg}


# ── Exchange Credentials ─────────────────────────────────────────

@router.post("/dual-invest/configure")
def dual_invest_configure(body: dict):
    """Save exchange API credentials to .env and environment."""
    exchange = body.get("exchange", "binance")

    if exchange == "okx":
        api_key = body.get("apiKey", "").strip()
        api_secret = body.get("apiSecret", "").strip()
        passphrase = body.get("passphrase", "").strip()
        if not api_key or not api_secret or not passphrase:
            raise HTTPException(400, "apiKey, apiSecret, and passphrase are required for OKX")
        os.environ["OKX_API_KEY"] = api_key
        os.environ["OKX_API_SECRET"] = api_secret
        os.environ["OKX_PASSPHRASE"] = passphrase
        _persist_env({
            "OKX_API_KEY": api_key,
            "OKX_API_SECRET": api_secret,
            "OKX_PASSPHRASE": passphrase,
        })
        from backend.data.okx import check_okx_configured
        return {"exchange": "okx", "configured": check_okx_configured()}
    else:
        api_key = body.get("apiKey", "").strip()
        api_secret = body.get("apiSecret", "").strip()
        if not api_key or not api_secret:
            raise HTTPException(400, "apiKey and apiSecret are required")
        os.environ["BINANCE_API_KEY"] = api_key
        os.environ["BINANCE_API_SECRET"] = api_secret
        _persist_env({
            "BINANCE_API_KEY": api_key,
            "BINANCE_API_SECRET": api_secret,
        })
        from backend.data.binance import check_binance_configured
        return {"exchange": "binance", "configured": check_binance_configured()}


# ── OKX MCP Configuration ────────────────────────────────────────

@router.get("/okx-mcp/config")
def get_okx_mcp_config():
    """Return current OKX MCP access level."""
    from backend.agent.mcp_tools import DEFAULT_ACCESS
    access = os.environ.get("OKX_MCP_ACCESS", DEFAULT_ACCESS)
    return {"access": access}


@router.post("/okx-mcp/config")
async def set_okx_mcp_config(body: OkxMcpConfigRequest):
    """Update OKX MCP access level, then reload tools."""
    from backend.agent.mcp_tools import reinit_mcp_tools
    from backend.app import reset_agent

    if body.access not in ("readonly", "full"):
        raise HTTPException(400, "access must be 'readonly' or 'full'")

    os.environ["OKX_MCP_ACCESS"] = body.access
    _persist_env({"OKX_MCP_ACCESS": body.access})

    tools = await reinit_mcp_tools()
    reset_agent()

    return {
        "access": body.access,
        "toolCount": len(tools),
        "tools": [t.name for t in tools],
    }


# ── FlashAlpha MCP Configuration ─────────────────────────────────

@router.get("/flashalpha/config")
def get_flashalpha_config():
    """Return FlashAlpha MCP status."""
    from backend.agent.mcp_tools import FA_DAILY_LIMIT, get_fa_remaining, get_fa_tools, get_fa_used

    has_key = bool(os.environ.get("FA_API_KEY", "").strip())
    fa_tools = get_fa_tools()
    return {
        "configured": has_key,
        "toolCount": len(fa_tools),
        "tools": [t.name for t in fa_tools],
    }


@router.get("/flashalpha/quota")
def get_flashalpha_quota():
    """Return FlashAlpha daily usage quota."""
    from backend.agent.mcp_tools import FA_DAILY_LIMIT, get_fa_remaining, get_fa_used

    has_key = bool(os.environ.get("FA_API_KEY", "").strip())
    return {
        "configured": has_key,
        "limit": FA_DAILY_LIMIT,
        "used": get_fa_used(),
        "remaining": get_fa_remaining(),
    }


@router.post("/flashalpha/config")
async def set_flashalpha_config(body: FlashAlphaConfigRequest):
    """Save FlashAlpha API key, then reload tools."""
    from backend.agent.mcp_tools import FA_DAILY_LIMIT, get_fa_remaining, get_fa_tools, reinit_mcp_tools
    from backend.app import reset_agent

    api_key = body.apiKey.strip()
    if not api_key:
        raise HTTPException(400, "apiKey is required")

    os.environ["FA_API_KEY"] = api_key
    _persist_env({"FA_API_KEY": api_key})

    tools = await reinit_mcp_tools()
    reset_agent()

    fa_tools = get_fa_tools()
    return {
        "configured": True,
        "toolCount": len(fa_tools),
        "tools": [t.name for t in fa_tools],
        "totalToolCount": len(tools),
        "remaining": get_fa_remaining(),
        "limit": FA_DAILY_LIMIT,
    }


# ── CoinMarketCap MCP Configuration ─────────────────────────────

@router.get("/cmc-mcp/config")
def get_cmc_mcp_config():
    """Return CoinMarketCap MCP status including loaded tool count."""
    from backend.agent.mcp_tools import get_cmc_tools

    has_key = bool(os.environ.get("CMC_MCP_API_KEY", "").strip())
    cmc_tools = get_cmc_tools()
    return {
        "configured": has_key,
        "toolCount": len(cmc_tools),
        "tools": [t.name for t in cmc_tools],
    }


@router.post("/cmc-mcp/config")
async def set_cmc_mcp_config(body: CmcMcpConfigRequest):
    """Save CoinMarketCap MCP API key, then reload tools."""
    from backend.agent.mcp_tools import reinit_mcp_tools
    from backend.app import reset_agent

    api_key = body.apiKey.strip()
    if not api_key:
        raise HTTPException(400, "apiKey is required")

    os.environ["CMC_MCP_API_KEY"] = api_key
    _persist_env({"CMC_MCP_API_KEY": api_key})

    tools = await reinit_mcp_tools()
    reset_agent()

    from backend.agent.mcp_tools import get_cmc_tools
    cmc_tools = get_cmc_tools()

    return {
        "configured": True,
        "cmcToolCount": len(cmc_tools),
        "cmcTools": [t.name for t in cmc_tools],
        "totalToolCount": len(tools),
    }


# ── LangSmith Tracing Configuration ─────────────────────────────

@router.get("/langsmith/config")
def get_langsmith_config():
    """Return LangSmith tracing status."""
    has_key = bool(os.environ.get("LANGSMITH_API_KEY", "").strip())
    tracing = os.environ.get("LANGSMITH_TRACING", "").lower() == "true"
    project = os.environ.get("LANGSMITH_PROJECT", "ThetaLab")
    return {
        "configured": has_key and tracing,
        "project": project,
    }


@router.post("/langsmith/config")
def set_langsmith_config(body: LangSmithConfigRequest):
    """Save LangSmith API key and enable tracing."""
    api_key = body.apiKey.strip()
    if not api_key:
        raise HTTPException(400, "apiKey is required")

    os.environ["LANGSMITH_API_KEY"] = api_key
    os.environ["LANGSMITH_TRACING"] = "true"
    os.environ["LANGSMITH_PROJECT"] = "ThetaLab"

    _persist_env({
        "LANGSMITH_API_KEY": api_key,
        "LANGSMITH_TRACING": "true",
        "LANGSMITH_PROJECT": "ThetaLab",
    })

    return {"configured": True, "project": "ThetaLab"}
