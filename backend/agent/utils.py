"""Shared utilities for the agent package."""

from __future__ import annotations

from typing import Any

# ── Content extraction ───────────────────────────────────────────

def extract_text(content: Any) -> str:
    """Normalize LLM content that may be str or list-of-parts to a plain string."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            part.get("text", "") if isinstance(part, dict) else str(part)
            for part in content
        )
    return str(content) if content else ""


# ── Tool safety classification ───────────────────────────────────

SAFE_PREFIXES = (
    "market_", "skills_", "system_", "trade_get_", "get_", "analyze_",
    "Get", "Calculate", "Solve", "Run",
)
SAFE_INFIXES = ("_get_", "_analysis")


def is_safe_tool(name: str) -> bool:
    """Return True for read-only / query tools that don't need user confirmation."""
    if any(name.startswith(p) for p in SAFE_PREFIXES):
        return True
    return any(p in name for p in SAFE_INFIXES)
