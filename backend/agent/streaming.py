"""Streaming engine for the LangGraph agent.

Handles the core stream-parse-resume loop, including:
- Token / tool_start / tool_end event extraction
- Subgraph tool-call discovery (for HITL interrupts)
- Safe-tool auto-resume logic
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from typing import Any

from langchain_core.messages import ToolMessage

from backend.agent.utils import extract_text, is_safe_tool

logger = logging.getLogger(__name__)


def unpack_stream_chunk(raw: Any) -> tuple[Any, dict]:
    """Extract (msg, metadata) from a stream chunk, handling subgraph wrapping."""
    if isinstance(raw, tuple) and len(raw) == 2 and isinstance(raw[0], tuple):
        return raw[1]
    return raw


def extract_subgraph_tool_calls(state: Any) -> tuple[list[dict], Any]:
    """Recursively find pending tool calls in (nested) subgraph tasks.

    Returns (tool_calls, sub_config) where sub_config is the deepest
    subgraph's checkpoint config — needed for ``aupdate_state`` on cancel.
    """
    for task in state.tasks:
        sub = getattr(task, "state", None)
        if sub is None:
            continue
        sub_msgs = sub.values.get("messages", [])
        if sub_msgs:
            tcs = getattr(sub_msgs[-1], "tool_calls", [])
            if tcs:
                return tcs, sub.config
        if sub.tasks:
            result = extract_subgraph_tool_calls(sub)
            if result[0]:
                return result
    return [], None


async def stream_loop(
    agent: Any,
    config: dict[str, Any],
    input_data: Any,
) -> AsyncIterator[dict[str, Any]]:
    """Core streaming loop shared by astream / astream_resume.

    Auto-resumes safe (read-only) tools and yields an interrupt event
    for sensitive ones that require user confirmation.

    Yields event dicts::

        {"type": "token",      "content": "..."}
        {"type": "tool_start", "name": "..."}
        {"type": "tool_end",   "name": "..."}
        {"type": "confirm",    "tool_calls": [...]}
    """
    emitted_tool_starts: set[str] = set()

    while True:
        async for raw in agent.astream(
            input_data, config=config, stream_mode="messages", subgraphs=True,
        ):
            msg, metadata = unpack_stream_chunk(raw)
            node = metadata.get("langgraph_node", "")

            if node == "model":
                tcs = getattr(msg, "tool_calls", None) or getattr(msg, "tool_call_chunks", None)
                if tcs:
                    for tc in tcs:
                        name = tc.get("name") if isinstance(tc, dict) else getattr(tc, "name", None)
                        if name and name not in emitted_tool_starts:
                            emitted_tool_starts.add(name)
                            yield {"type": "tool_start", "name": name}

            # Extract content from any AIMessage (not just model node)
            if hasattr(msg, "content") and msg.content:
                text = extract_text(msg.content)
                if text:
                    logger.debug(f"[Stream] Yielding token: {text[:100]}...")
                    yield {"type": "token", "content": text}

            elif isinstance(msg, ToolMessage):
                tool_name = msg.name or ""
                if tool_name:
                    yield {"type": "tool_end", "name": tool_name}

        state = await agent.aget_state(config, subgraphs=True)
        if not state.next:
            break

        tool_calls, _ = extract_subgraph_tool_calls(state)
        if not tool_calls:
            break

        if all(is_safe_tool(tc["name"]) for tc in tool_calls):
            emitted_tool_starts.clear()
            input_data = None
            continue

        yield {
            "type": "confirm",
            "tool_calls": [
                {"name": tc["name"], "args": tc["args"]} for tc in tool_calls
            ],
        }
        return
