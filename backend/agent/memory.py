"""Long-term memory store for user trading preferences.

Uses LangGraph's native SqliteStore — the official persistent Store API —
so the agent's long-term memory is managed the same way LangGraph manages it
internally (namespaced key-value pairs with SQLite persistence).
"""

from __future__ import annotations

import json
import logging
import sqlite3
from pathlib import Path
from typing import Any

from langgraph.store.base import BaseStore
from langgraph.store.sqlite import SqliteStore

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


def create_store(db_path: str | Path) -> SqliteStore:
    """Create a LangGraph SqliteStore backed by the given file.

    Uses isolation_level=None (autocommit) as required by SqliteStore's
    internal transaction management.
    """
    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path), check_same_thread=False, isolation_level=None)
    store = SqliteStore(conn)
    store.setup()
    _migrate_legacy_profiles(store, db_path.parent)
    return store


def _migrate_legacy_profiles(store: SqliteStore, data_dir: Path) -> None:
    """One-time migration: import data from the old profiles.db if it exists."""
    legacy_db = data_dir / "profiles.db"
    if not legacy_db.exists():
        return
    try:
        legacy_conn = sqlite3.connect(str(legacy_db))
        rows = legacy_conn.execute(
            "SELECT user_id, profile FROM trading_profiles"
        ).fetchall()
        legacy_conn.close()

        for user_id, profile_json in rows:
            ns = (*PROFILE_NAMESPACE, user_id)
            existing = store.get(ns, PROFILE_KEY)
            if existing is not None:
                continue
            profile = json.loads(profile_json)
            store.put(ns, PROFILE_KEY, profile)
            logger.info("Migrated profile for user '%s' from legacy profiles.db", user_id)

        legacy_db.rename(legacy_db.with_suffix(".db.bak"))
        logger.info("Legacy profiles.db renamed to profiles.db.bak")
    except Exception as exc:
        logger.warning("Legacy migration skipped: %s", exc)


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
