"""Top-level graph builder for the ThetaLab agent hierarchy.

Assembles the Level-1 router graph and plugs in domain subgraphs
from ``backend.agent.graphs.*``.  Each domain is a separate module
that exposes ``build_graph(model, profile_text) -> CompiledGraph``.

Architecture::

    Level-1:  Router → Options / Crypto / General
                              │
                              └── graphs/crypto.py (Level-2 subgraph)
"""

from __future__ import annotations

import logging

from langchain.agents import create_agent
from langchain_core.messages import SystemMessage
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, START, StateGraph
from langgraph.store.base import BaseStore

from backend.agent.graph_state import AgentState, RouteDecision, get_route
from backend.agent.graphs.crypto import build_graph as build_crypto_graph
from backend.agent.llm import ContentNormalizingLLM
from backend.agent.mcp_tools import get_fa_tools
from backend.agent.prompts import GENERAL_PROMPT, OPTIONS_PROMPT, ROUTER_PROMPT
from backend.agent.tools import OPTIONS_TOOLS

logger = logging.getLogger(__name__)


class GraphBuilder:
    """Constructs the multi-level LangGraph agent hierarchy.

    Stateless except for the LLM reference — call ``build()`` each time
    a fresh graph is needed (e.g. after profile changes).
    """

    def __init__(self, model: ContentNormalizingLLM) -> None:
        self._model = model

    def _make_router_node(self):
        router_llm = self._model.delegate

        async def _route(state: AgentState):
            structured = router_llm.with_structured_output(RouteDecision)
            result = await structured.ainvoke(
                [SystemMessage(content=ROUTER_PROMPT)] + state["messages"]
            )
            logger.info("Router decision: %s", result.destination)
            return {"route": result.destination}

        return _route

    def build(
        self,
        profile_text: str,
        checkpointer: BaseCheckpointSaver,
        store: BaseStore,
    ):
        """Build and compile the full agent graph.

        Returns a compiled LangGraph runnable ready for
        ``ainvoke`` / ``astream``.
        """
        options_tools = list(OPTIONS_TOOLS) + get_fa_tools()
        options_agent = create_agent(
            model=self._model,
            system_prompt=OPTIONS_PROMPT.format(user_profile=profile_text),
            tools=options_tools or None,
            name="options",
        )

        crypto_graph = build_crypto_graph(self._model, profile_text)

        general_agent = create_agent(
            model=self._model,
            system_prompt=GENERAL_PROMPT.format(user_profile=profile_text),
            name="general",
        )

        builder = StateGraph(AgentState)
        builder.add_node("router", self._make_router_node())
        builder.add_node("options", options_agent)
        builder.add_node("crypto", crypto_graph)
        builder.add_node("general", general_agent)

        builder.add_edge(START, "router")
        builder.add_conditional_edges("router", get_route)
        builder.add_edge("options", END)
        builder.add_edge("crypto", END)
        builder.add_edge("general", END)

        return builder.compile(checkpointer=checkpointer, store=store)
