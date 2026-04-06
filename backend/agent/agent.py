"""ThetaLabAgent — the core orchestrator.

Thin public API layer: receives user messages, delegates graph
construction to ``GraphBuilder``, streaming to ``stream_loop``,
and profile extraction to ``memory``.
"""

from __future__ import annotations

from typing import Any

from langchain_core.messages import AIMessage, ToolMessage
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.store.base import BaseStore

from backend.agent.graph_builder import GraphBuilder
from backend.agent.llm import ContentNormalizingLLM, create_llm
from backend.agent.memory import (
    get_history,
    get_profile_from_store,
    profile_as_text,
    try_extract_profile,
)
from backend.agent.streaming import extract_subgraph_tool_calls, stream_loop
from backend.agent.utils import extract_text


class ThetaLabAgent:
    """Public API for the ThetaLab AI agent.

    Depends only on LangGraph's abstract bases (``BaseCheckpointSaver``,
    ``BaseStore``) — concrete persistence is injected by the caller.
    """

    def __init__(
        self,
        store: BaseStore,
        checkpointer: BaseCheckpointSaver,
        model: ContentNormalizingLLM | None = None,
    ) -> None:
        self._store = store
        self._checkpointer = checkpointer
        self._model = model or create_llm()
        self._builder = GraphBuilder(self._model)

    @property
    def store(self) -> BaseStore:
        return self._store

    def _build_agent(self, user_id: str = "default"):
        profile_text = profile_as_text(self._store, user_id)
        return self._builder.build(profile_text, self._checkpointer, self._store)

    # ── Invoke / Stream ──────────────────────────────────────────

    async def ainvoke(
        self, message: str, thread_id: str = "default", user_id: str = "default"
    ) -> str:
        agent = self._build_agent(user_id)
        config = {"configurable": {"thread_id": thread_id}}
        result = await agent.ainvoke(
            {"messages": [{"role": "user", "content": message}]},
            config=config,
        )
        response_text = extract_text(result["messages"][-1].content)
        try_extract_profile(self._model, self._store, message, response_text, user_id)
        return response_text

    async def astream(
        self, message: str, thread_id: str = "default", user_id: str = "default"
    ):
        """Yield streamed chunks; auto-resumes safe tools, interrupts for sensitive ones."""
        agent = self._build_agent(user_id)
        config = {"configurable": {"thread_id": thread_id}}
        input_data: Any = {"messages": [{"role": "user", "content": message}]}

        full_text = ""
        async for chunk in stream_loop(agent, config, input_data):
            if chunk["type"] == "token":
                full_text += chunk["content"]
            yield chunk

        try_extract_profile(self._model, self._store, message, full_text, user_id)

    async def astream_resume(
        self, thread_id: str, user_id: str = "default", approved: bool = True
    ):
        """Resume after an interrupt. If not approved, cancel the pending tool calls."""
        agent = self._build_agent(user_id)
        config = {"configurable": {"thread_id": thread_id}}

        if not approved:
            state = await agent.aget_state(config, subgraphs=True)
            tool_calls, sub_config = extract_subgraph_tool_calls(state)

            if tool_calls and sub_config:
                cancel_msgs: list[Any] = [
                    ToolMessage(content="用户取消了此操作", tool_call_id=tc["id"])
                    for tc in tool_calls
                ]
                cancel_msgs.append(
                    AIMessage(
                        content="好的，已取消该操作。如果您需要其他帮助，请随时告诉我。"
                    )
                )
                await agent.aupdate_state(sub_config, {"messages": cancel_msgs})

            yield {
                "type": "token",
                "content": "好的，已取消该操作。如果您需要其他帮助，请随时告诉我。",
            }
            return

        async for chunk in stream_loop(agent, config, None):
            yield chunk

    # ── Query ────────────────────────────────────────────────────

    def get_profile(self, user_id: str = "default") -> dict[str, Any]:
        return get_profile_from_store(self._store, user_id)

    async def get_history(self, thread_id: str = "default") -> list[dict[str, str]]:
        return await get_history(self._checkpointer, thread_id)

    def close(self) -> None:
        pass
