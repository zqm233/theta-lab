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
            
            # Log full error details for debugging
            error_details = {
                "type": type(exc).__name__,
                "message": str(exc),
            }
            if hasattr(exc, "response"):
                try:
                    error_details["response_body"] = exc.response.json()
                except:
                    pass
            logger.error(f"Full error details: {error_details}")
            
            # Extract more user-friendly error message
            error_msg = str(exc)
            if "503" in error_msg or "Service Unavailable" in error_msg:
                error_msg = "LLM service is currently overloaded. Please try again in a few moments."
            elif "timeout" in error_msg.lower():
                error_msg = "Request timed out. Please try again."
            elif "API key" in error_msg or "authentication" in error_msg.lower():
                error_msg = "Invalid API key. Please check your LLM configuration in Settings."
            elif "rate limit" in error_msg.lower():
                error_msg = "Rate limit exceeded. Please wait a moment before trying again."
            elif "Failed to call a function" in error_msg:
                error_msg = "Model failed to generate valid tool calls. This may be a model limitation. Try a simpler query or check Settings."
            
            yield {
                "event": "error",
                "data": json.dumps({"error": error_msg}),
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
            
            # Extract more user-friendly error message
            error_msg = str(exc)
            if "503" in error_msg or "Service Unavailable" in error_msg:
                error_msg = "LLM service is currently overloaded. Please try again in a few moments."
            elif "timeout" in error_msg.lower():
                error_msg = "Request timed out. Please try again."
            elif "API key" in error_msg or "authentication" in error_msg.lower():
                error_msg = "Invalid API key. Please check your LLM configuration in Settings."
            elif "rate limit" in error_msg.lower():
                error_msg = "Rate limit exceeded. Please wait a moment before trying again."
            
            yield {
                "event": "error",
                "data": json.dumps({"error": error_msg}),
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
