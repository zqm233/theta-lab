"""SQLite persistence backend — zero-config, file-based.

Uses LangGraph's ``SqliteStore`` and ``AsyncSqliteSaver``.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from pathlib import Path

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.store.base import BaseStore

logger = logging.getLogger(__name__)

DB_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data"


def _migrate_legacy_profiles(store: BaseStore, data_dir: Path) -> None:
    """One-time migration: import data from the old profiles.db if it exists."""
    legacy_db = data_dir / "profiles.db"
    if not legacy_db.exists():
        return
    try:
        from backend.agent.memory import PROFILE_KEY, PROFILE_NAMESPACE

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


def create_store(db_dir: Path | None = None) -> BaseStore:
    """Create a SQLite-backed LangGraph Store."""
    from langgraph.store.sqlite import SqliteStore

    db_dir = db_dir or DB_DIR
    db_dir.mkdir(parents=True, exist_ok=True)
    db_path = db_dir / "store.db"

    conn = sqlite3.connect(
        str(db_path), check_same_thread=False, isolation_level=None,
    )
    store = SqliteStore(conn)
    store.setup()
    _migrate_legacy_profiles(store, db_dir)
    return store


async def create_checkpointer(db_dir: Path | None = None) -> BaseCheckpointSaver:
    """Create a SQLite-backed async LangGraph Checkpointer."""
    import aiosqlite
    from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

    db_dir = db_dir or DB_DIR
    db_dir.mkdir(parents=True, exist_ok=True)
    db_path = db_dir / "checkpoints.db"

    conn = await aiosqlite.connect(str(db_path))
    saver = AsyncSqliteSaver(conn)
    await saver.setup()
    return saver
