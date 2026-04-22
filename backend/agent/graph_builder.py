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
from typing import Literal

from langchain.agents import create_agent

logger = logging.getLogger(__name__)
from langchain_core.messages import SystemMessage
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, START, StateGraph
from langgraph.store.base import BaseStore

from backend.agent.graph_state import AgentState, RouteDecision, get_route
from backend.agent.graphs.crypto import build_graph as build_crypto_graph
from backend.agent.llm import ContentNormalizingLLM
from backend.agent.mcp_tools import get_fa_tools
from backend.agent.prompts import GENERAL_PROMPT, OPTIONS_PROMPT, ROUTER_PROMPT
from backend.agent.summarization import summarize_if_needed
from backend.agent.tools import OPTIONS_TOOLS

try:
    from backend.agent.tools_rag import search_options_knowledge, search_general_knowledge
    _RAG_AVAILABLE = True
except ImportError:
    _RAG_AVAILABLE = False

logger = logging.getLogger(__name__)


class GraphBuilder:
    """Constructs the multi-level LangGraph agent hierarchy.

    Stateless except for the LLM reference — call ``build()`` each time
    a fresh graph is needed (e.g. after profile changes).
    """

    def __init__(self, model: ContentNormalizingLLM) -> None:
        self._model = model

    def _make_router_node(self):
        """Create router node that works with models that don't support json_schema."""
        from langchain_core.tools import tool
        
        @tool
        def route_to_domain(destination: Literal["options", "crypto", "general"]) -> str:
            """Route the user query to the appropriate domain expert.
            
            Args:
                destination: The domain to route to - "options" for stock options trading,
                           "crypto" for cryptocurrency and dual investment,
                           "general" for other investment questions.
            """
            return destination
        
        router_llm = self._model.delegate.bind_tools([route_to_domain])

        async def _route(state: AgentState):
            messages = await summarize_if_needed(
                self._model, state["messages"], max_recent=6, trigger_threshold=12
            )
            result = await router_llm.ainvoke(
                [SystemMessage(content=ROUTER_PROMPT)] + messages
            )
            
            # Extract destination from tool calls
            destination = "general"  # default
            if hasattr(result, "tool_calls") and result.tool_calls:
                tc = result.tool_calls[0]
                destination = tc.get("args", {}).get("destination", "general")
            
            logger.info("Router decision: %s", destination)
            return {"route": destination}

        return _route

    def _make_wrapped_agent_node(self, agent, name: str):
        """Wrap an agent node to apply message summarization before execution."""

        async def _wrapped(state: AgentState):
            messages = await summarize_if_needed(
                self._model, state["messages"], max_recent=4, trigger_threshold=6
            )
            result = await agent.ainvoke({"messages": messages})
            return result

        return _wrapped

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
        import os
        from datetime import datetime
        from zoneinfo import ZoneInfo
        
        # Get current date in US Eastern Time
        et_tz = ZoneInfo("America/New_York")
        current_date = datetime.now(et_tz).strftime("%Y-%m-%d (%A)")
        
        use_simple_agent = os.getenv("USE_SIMPLE_AGENT", "false").lower() == "true"
        
        if use_simple_agent:
            # Simple mode: single agent with all tools (saves requests)
            logger.info("Building SIMPLE agent (no router)")
            all_tools = list(OPTIONS_TOOLS) + get_fa_tools()
            if _RAG_AVAILABLE:
                all_tools.append(search_options_knowledge)
                all_tools.append(search_general_knowledge)
            
            simple_agent = create_agent(
                model=self._model,
                system_prompt=OPTIONS_PROMPT.format(
                    current_date=current_date,
                    user_profile=profile_text
                ),
                tools=all_tools or None,
                name="unified",
            )
            
            builder = StateGraph(AgentState)
            builder.add_node("agent", self._make_wrapped_agent_node(simple_agent, "unified"))
            builder.add_edge(START, "agent")
            builder.add_edge("agent", END)
            return builder.compile(checkpointer=checkpointer, store=store)
        
        # Original hierarchical mode
        options_tools = list(OPTIONS_TOOLS) + get_fa_tools()
        if _RAG_AVAILABLE:
            options_tools.append(search_options_knowledge)
        options_agent = create_agent(
            model=self._model,
            system_prompt=OPTIONS_PROMPT.format(
                current_date=current_date,
                user_profile=profile_text
            ),
            tools=options_tools or None,
            name="options",
        )

        crypto_graph = build_crypto_graph(self._model, profile_text, current_date)

        general_tools = []
        if _RAG_AVAILABLE:
            general_tools.append(search_general_knowledge)
        general_agent = create_agent(
            model=self._model,
            system_prompt=GENERAL_PROMPT.format(
                current_date=current_date,
                user_profile=profile_text
            ),
            tools=general_tools or None,
            name="general",
        )

        builder = StateGraph(AgentState)
        builder.add_node("router", self._make_router_node())
        builder.add_node("options", self._make_wrapped_agent_node(options_agent, "options"))
        builder.add_node("crypto", crypto_graph)
        builder.add_node("general", self._make_wrapped_agent_node(general_agent, "general"))

        builder.add_edge(START, "router")
        builder.add_conditional_edges("router", get_route)
        builder.add_edge("options", END)
        builder.add_edge("crypto", END)
        builder.add_edge("general", END)

        return builder.compile(checkpointer=checkpointer, store=store)
