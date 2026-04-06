"""Persistence layer — backend-agnostic factories.

Reads ``PERSISTENCE_BACKEND`` from the environment (default: ``sqlite``)
and dispatches to the matching backend module.  Each backend module
(``sqlite.py``, ``postgres.py``) implements the same two functions::

    def   create_store(**kwargs)        -> BaseStore
    async def create_checkpointer(**kwargs) -> BaseCheckpointSaver

Adding a new backend = one new file + one registry entry below.
"""

from __future__ import annotations

import os
from typing import Any

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.store.base import BaseStore

from backend.agent.persistence import sqlite as _sqlite

_BACKENDS: dict[str, Any] = {
    "sqlite": _sqlite,
}

try:
    from backend.agent.persistence import postgres as _pg
    _BACKENDS["postgres"] = _pg
except ImportError:
    pass


def _get_backend_module() -> Any:
    name = os.getenv("PERSISTENCE_BACKEND", "sqlite").lower()
    module = _BACKENDS.get(name)
    if module is None:
        supported = ", ".join(sorted(_BACKENDS))
        raise ValueError(
            f"Unsupported PERSISTENCE_BACKEND: '{name}'. "
            f"Supported: {supported}"
        )
    return module


def create_store(**kwargs: Any) -> BaseStore:
    """Create a LangGraph Store using the configured backend."""
    return _get_backend_module().create_store(**kwargs)


async def create_checkpointer(**kwargs: Any) -> BaseCheckpointSaver:
    """Create a LangGraph Checkpointer using the configured backend."""
    return await _get_backend_module().create_checkpointer(**kwargs)
