"""Shared SQLite connection for application-level tables (trades, etc.).

Separate from the LangGraph checkpointer DB to avoid coupling.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

DB_DIR = Path(__file__).resolve().parent.parent / "data"

_conn: sqlite3.Connection | None = None


def get_conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        DB_DIR.mkdir(parents=True, exist_ok=True)
        _conn = sqlite3.connect(str(DB_DIR / "trades.db"), check_same_thread=False)
        _conn.row_factory = sqlite3.Row
    return _conn


def init_db() -> None:
    conn = get_conn()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS trades (
            id          TEXT PRIMARY KEY,
            ticker      TEXT NOT NULL,
            type        TEXT NOT NULL,
            side        TEXT NOT NULL,
            strike      REAL NOT NULL,
            qty         INTEGER NOT NULL,
            entry_price REAL NOT NULL,
            exit_price  REAL NOT NULL,
            expiration  TEXT NOT NULL,
            opened_at   TEXT NOT NULL,
            closed_at   TEXT NOT NULL,
            pnl         REAL NOT NULL,
            exit_type   TEXT NOT NULL DEFAULT 'manual',
            notes       TEXT NOT NULL DEFAULT ''
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS accounts (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            platform    TEXT NOT NULL,
            broker      TEXT NOT NULL DEFAULT '',
            currency    TEXT NOT NULL DEFAULT 'USD',
            notes       TEXT NOT NULL DEFAULT '',
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS holdings (
            id            TEXT PRIMARY KEY,
            account_id    TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            asset_type    TEXT NOT NULL,
            ticker        TEXT NOT NULL,
            side          TEXT NOT NULL DEFAULT 'long',
            qty           REAL NOT NULL,
            avg_cost      REAL NOT NULL DEFAULT 0,
            current_price REAL,
            notes         TEXT NOT NULL DEFAULT '',
            created_at    TEXT NOT NULL,
            updated_at    TEXT NOT NULL,
            option_type   TEXT,
            strike        REAL,
            expiration    TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS portfolio_snapshots (
            date          TEXT NOT NULL,
            account_id    TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            currency      TEXT NOT NULL,
            total_cost    REAL NOT NULL DEFAULT 0,
            market_value  REAL NOT NULL DEFAULT 0,
            PRIMARY KEY (date, account_id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS fa_usage (
            date TEXT PRIMARY KEY,
            used INTEGER NOT NULL DEFAULT 0
        )
    """)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.commit()


def close_db() -> None:
    global _conn
    if _conn is not None:
        _conn.close()
        _conn = None
