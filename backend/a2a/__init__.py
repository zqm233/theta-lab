"""A2A protocol integration for ThetaLab.

Exposes ``create_a2a_app()`` which builds a FastAPI sub-application
implementing the Agent-to-Agent protocol.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import FastAPI

from a2a.server.apps.jsonrpc.fastapi_app import A2AFastAPIApplication
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.tasks import InMemoryTaskStore

from backend.a2a.agent_card import build_agent_card
from backend.a2a.executor import ThetaLabA2AExecutor

if TYPE_CHECKING:
    from backend.agent.agent import ThetaLabAgent


def create_a2a_app(agent: ThetaLabAgent) -> FastAPI:
    """Build a FastAPI sub-app serving the A2A JSON-RPC endpoint.

    The returned app provides:
      - ``GET  /.well-known/agent-card.json``  (AgentCard discovery)
      - ``POST /``                             (JSON-RPC tasks/send, tasks/sendSubscribe, ...)
    """
    agent_card = build_agent_card()
    executor = ThetaLabA2AExecutor(agent)

    handler = DefaultRequestHandler(
        agent_executor=executor,
        task_store=InMemoryTaskStore(),
    )

    a2a_app = A2AFastAPIApplication(
        agent_card=agent_card,
        http_handler=handler,
    )

    return a2a_app.build()
