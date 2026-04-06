"""PostgreSQL persistence backend — production-grade.

Uses LangGraph's ``PostgresStore`` and ``AsyncPostgresSaver``.
Requires ``DATABASE_URL`` environment variable.

Install dependencies::

    pip install "langgraph-checkpoint-postgres" "langgraph-store-postgres"
"""

from __future__ import annotations

import os

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.store.base import BaseStore


def _get_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise ValueError(
            "DATABASE_URL is required when PERSISTENCE_BACKEND=postgres"
        )
    return url


def create_store(**_: object) -> BaseStore:
    """Create a Postgres-backed LangGraph Store."""
    from langgraph.store.postgres import PostgresStore

    store = PostgresStore.from_conn_string(_get_url())
    store.setup()
    return store


async def create_checkpointer(**_: object) -> BaseCheckpointSaver:
    """Create a Postgres-backed async LangGraph Checkpointer."""
    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

    saver = AsyncPostgresSaver.from_conn_string(_get_url())
    await saver.setup()
    return saver
