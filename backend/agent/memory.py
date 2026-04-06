"""Long-term memory — user trading preference profiles.

Operates on LangGraph's abstract ``BaseStore`` so it works with any
backend (SQLite, PostgreSQL, etc.).  Profile data is stored as
namespaced key-value pairs: ``("profiles", user_id) → "trading_profile"``.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from langchain_core.language_models.chat_models import BaseChatModel
from langgraph.store.base import BaseStore

from backend.agent.prompts import EXTRACTION_PROMPT
from backend.agent.utils import extract_text

logger = logging.getLogger(__name__)

DEFAULT_PROFILE: dict[str, Any] = {
    "preferred_strategies": [],
    "risk_tolerance": "unknown",
    "preferred_tickers": [],
    "typical_dte_range": None,
    "delta_preference": None,
    "position_sizing": None,
    "notes": [],
}

PROFILE_NAMESPACE = ("profiles",)
PROFILE_KEY = "trading_profile"


def get_profile_from_store(store: BaseStore, user_id: str = "default") -> dict[str, Any]:
    ns = (*PROFILE_NAMESPACE, user_id)
    item = store.get(ns, PROFILE_KEY)
    if item is None:
        return {**DEFAULT_PROFILE}
    return item.value


def update_profile_in_store(
    store: BaseStore, updates: dict[str, Any], user_id: str = "default"
) -> dict[str, Any]:
    current = get_profile_from_store(store, user_id)
    for key, value in updates.items():
        if key not in current:
            continue
        if isinstance(current[key], list) and isinstance(value, list):
            current[key] = list(dict.fromkeys(current[key] + value))
        elif value is not None:
            current[key] = value

    ns = (*PROFILE_NAMESPACE, user_id)
    store.put(ns, PROFILE_KEY, current)
    return current


def profile_as_text(store: BaseStore, user_id: str = "default") -> str:
    p = get_profile_from_store(store, user_id)
    lines = []
    if p.get("preferred_strategies"):
        lines.append(f"- 偏好策略: {', '.join(p['preferred_strategies'])}")
    if p.get("risk_tolerance") and p["risk_tolerance"] != "unknown":
        lines.append(f"- 风险偏好: {p['risk_tolerance']}")
    if p.get("preferred_tickers"):
        lines.append(f"- 常关注标的: {', '.join(p['preferred_tickers'])}")
    if p.get("typical_dte_range"):
        lines.append(f"- 偏好到期天数: {p['typical_dte_range']}")
    if p.get("delta_preference"):
        lines.append(f"- Delta 偏好: {p['delta_preference']}")
    if p.get("position_sizing"):
        lines.append(f"- 仓位规模: {p['position_sizing']}")
    if p.get("notes"):
        for note in p["notes"][-5:]:
            lines.append(f"- 备注: {note}")
    if not lines:
        return "暂无历史偏好数据，请在对话中了解用户的交易风格。"
    return "\n".join(lines)


async def get_history(
    checkpointer: Any,
    thread_id: str = "default",
) -> list[dict[str, str]]:
    """Retrieve conversation history for a thread from the checkpointer."""
    config = {"configurable": {"thread_id": thread_id}}
    try:
        state = await checkpointer.aget(config)
        if not state or "channel_values" not in state:
            return []
        messages = state["channel_values"].get("messages", [])
        history = []
        for msg in messages:
            role = getattr(msg, "type", "unknown")
            content = extract_text(getattr(msg, "content", ""))
            if role in ("human", "ai") and content:
                history.append({
                    "role": "user" if role == "human" else "assistant",
                    "content": content,
                })
        return history
    except Exception:
        return []


def try_extract_profile(
    model: BaseChatModel,
    store: BaseStore,
    user_msg: str,
    assistant_msg: str,
    user_id: str = "default",
) -> None:
    """Best-effort extraction of trading preferences from a conversation turn."""
    try:
        conversation = f"User: {user_msg}\nAssistant: {assistant_msg}"
        prompt = EXTRACTION_PROMPT.format(conversation=conversation)
        result = model.invoke(prompt)
        text = extract_text(result.content).strip()

        if text.startswith("```"):
            text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

        updates = json.loads(text)
        if updates and isinstance(updates, dict):
            update_profile_in_store(store, updates, user_id)
            logger.info("Profile updated for user %s: %s", user_id, updates)
    except (json.JSONDecodeError, Exception) as exc:
        logger.debug("Profile extraction skipped: %s", exc)
