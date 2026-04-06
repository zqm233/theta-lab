"""Chat & profile endpoints — Agent SSE streaming, HITL confirmation, history."""

from __future__ import annotations

import json
import logging
import uuid
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from backend.api.schemas import ChatRequest, ConfirmRequest

logger = logging.getLogger(__name__)

router = APIRouter()


async def _get_agent():
    from backend.app import get_agent
    try:
        return await get_agent()
    except ValueError as e:
        raise HTTPException(
            503,
            "LLM not configured. Please go to Settings to configure your LLM provider, model, and API key.",
        ) from e


@router.post("/chat")
async def chat(request: ChatRequest):
    """SSE streaming chat with the ThetaLab agent."""
    agent = await _get_agent()
    thread_id = request.thread_id or str(uuid.uuid4())

    async def event_stream() -> AsyncGenerator[dict, None]:
        yield {"event": "thread_id", "data": json.dumps({"thread_id": thread_id})}
        try:
            async for item in agent.astream(
                request.message,
                thread_id=thread_id,
                user_id=request.user_id,
            ):
                event_type = item["type"]
                if event_type == "token":
                    yield {"event": "token", "data": json.dumps({"content": item["content"]})}
                elif event_type == "tool_start":
                    yield {"event": "tool_start", "data": json.dumps({"name": item["name"]})}
                elif event_type == "tool_end":
                    yield {"event": "tool_end", "data": json.dumps({"name": item["name"]})}
                elif event_type == "confirm":
                    yield {
                        "event": "confirm",
                        "data": json.dumps({
                            "thread_id": thread_id,
                            "tool_calls": item["tool_calls"],
                        }),
                    }
            yield {"event": "done", "data": json.dumps({"status": "ok"})}
        except Exception as exc:
            logger.exception("Chat stream error")
            yield {
                "event": "error",
                "data": json.dumps({"error": str(exc)}),
            }

    return EventSourceResponse(event_stream())


@router.post("/chat/confirm")
async def chat_confirm(request: ConfirmRequest):
    """Resume agent execution after human-in-the-loop confirmation."""
    agent = await _get_agent()

    async def event_stream() -> AsyncGenerator[dict, None]:
        try:
            async for item in agent.astream_resume(
                thread_id=request.thread_id,
                user_id=request.user_id,
                approved=request.approved,
            ):
                event_type = item["type"]
                if event_type == "token":
                    yield {"event": "token", "data": json.dumps({"content": item["content"]})}
                elif event_type == "tool_start":
                    yield {"event": "tool_start", "data": json.dumps({"name": item["name"]})}
                elif event_type == "tool_end":
                    yield {"event": "tool_end", "data": json.dumps({"name": item["name"]})}
                elif event_type == "confirm":
                    yield {
                        "event": "confirm",
                        "data": json.dumps({
                            "thread_id": request.thread_id,
                            "tool_calls": item["tool_calls"],
                        }),
                    }
            yield {"event": "done", "data": json.dumps({"status": "ok"})}
        except Exception as exc:
            logger.exception("Chat confirm stream error")
            yield {
                "event": "error",
                "data": json.dumps({"error": str(exc)}),
            }

    return EventSourceResponse(event_stream())


@router.get("/chat/history/{thread_id}")
async def get_chat_history(thread_id: str):
    agent = await _get_agent()
    history = await agent.get_history(thread_id)
    return {"thread_id": thread_id, "messages": history}


@router.get("/profile")
async def get_profile(user_id: str = "default"):
    agent = await _get_agent()
    profile = agent.get_profile(user_id)
    return {"user_id": user_id, "profile": profile}


@router.post("/profile/reset")
async def reset_profile(user_id: str = "default"):
    agent = await _get_agent()
    from backend.agent.memory import DEFAULT_PROFILE, PROFILE_KEY, PROFILE_NAMESPACE
    ns = (*PROFILE_NAMESPACE, user_id)
    agent.store.put(ns, PROFILE_KEY, {**DEFAULT_PROFILE})
    return {"user_id": user_id, "profile": DEFAULT_PROFILE}
