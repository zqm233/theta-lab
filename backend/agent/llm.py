"""LLM instantiation and content-normalization wrapper.

Provides ``create_llm()`` which reads ``LLM_PROVIDER`` / ``LLM_MODEL`` /
``LLM_BASE_URL`` from the environment and returns a LangChain chat model
wrapped in ``ContentNormalizingLLM`` to handle providers that reject
list-type message content.
"""

from __future__ import annotations

import copy
import os
from collections.abc import AsyncIterator
from typing import Any

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import BaseMessage
from langchain_core.outputs import ChatResult
from langchain_core.runnables import RunnableConfig


def _normalize_content(content: Any) -> str | Any:
    """Flatten list-of-blocks content to a plain string."""
    if isinstance(content, str) or content is None:
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and block.get("type") == "text":
                parts.append(block.get("text", ""))
            else:
                parts.append(str(block))
        return "\n".join(parts)
    return content


class ContentNormalizingLLM(BaseChatModel):
    """Wrapper that normalizes list-type message content to strings
    before forwarding to the real LLM.

    Some providers (OpenRouter / OpenInference) reject list content
    in ToolMessages with a 422.
    """

    delegate: BaseChatModel

    @property
    def _llm_type(self) -> str:
        return getattr(self.delegate, "_llm_type", "content_normalizing")

    def _generate(self, messages: list[BaseMessage], **kwargs: Any) -> ChatResult:
        raise NotImplementedError("Use ainvoke / astream")

    async def ainvoke(
        self,
        input: Any,
        config: RunnableConfig | None = None,
        **kwargs: Any,
    ) -> BaseMessage:
        if isinstance(input, list):
            input = self._fix(input)
        return await self.delegate.ainvoke(input, config=config, **kwargs)

    async def astream(
        self,
        input: Any,
        config: RunnableConfig | None = None,
        **kwargs: Any,
    ) -> AsyncIterator:
        if isinstance(input, list):
            input = self._fix(input)
        async for chunk in self.delegate.astream(input, config=config, **kwargs):
            yield chunk

    def bind_tools(self, tools: Any, **kwargs: Any) -> "ContentNormalizingLLM":
        bound = self.delegate.bind_tools(tools, **kwargs)
        wrapper = copy.copy(self)
        wrapper.delegate = bound
        return wrapper

    @staticmethod
    def _fix(messages: list[BaseMessage]) -> list[BaseMessage]:
        fixed = []
        for msg in messages:
            if isinstance(msg.content, list):
                msg = msg.model_copy(update={"content": _normalize_content(msg.content)})
            fixed.append(msg)
        return fixed


def create_llm() -> ContentNormalizingLLM:
    """Instantiate the LLM based on environment variables.

    Reads ``LLM_PROVIDER``, ``LLM_MODEL``, and ``LLM_BASE_URL``.
    Returns a ``ContentNormalizingLLM``-wrapped model.
    """
    provider = os.getenv("LLM_PROVIDER", "").lower()
    model = os.getenv("LLM_MODEL", "").strip()
    base_url = os.getenv("LLM_BASE_URL", "").strip() or None

    if not provider or not model:
        raise ValueError(
            "LLM not configured. Set LLM_PROVIDER and LLM_MODEL "
            "in Settings or environment variables."
        )

    if provider == "google":
        from langchain_google_genai import ChatGoogleGenerativeAI
        kwargs: dict = {
            "model": model,
            "max_retries": 2,  # Limit retries to prevent infinite loops
            "timeout": 60.0,   # 60 second timeout
        }
        if base_url and "googleapis" in base_url:
            kwargs["base_url"] = base_url
        raw = ChatGoogleGenerativeAI(**kwargs)
    elif provider == "openai":
        from langchain_openai import ChatOpenAI
        kwargs = {
            "model": model,
            "max_retries": 2,
            "timeout": 60.0,
            "max_tokens": 2048,  # Reserve tokens for response
        }
        if base_url:
            kwargs["base_url"] = base_url
        raw = ChatOpenAI(**kwargs)
    elif provider == "openrouter":
        from langchain_openai import ChatOpenAI
        api_key = os.getenv("OPENROUTER_API_KEY", "")
        if not api_key:
            raise ValueError("OPENROUTER_API_KEY is not set.")
        kwargs = {
            "model": model,
            "api_key": api_key,
            "base_url": base_url or "https://openrouter.ai/api/v1",
            "max_retries": 2,
            "timeout": 60.0,
        }
        raw = ChatOpenAI(**kwargs)
    elif provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        kwargs = {
            "model": model,
            "max_retries": 2,
            "timeout": 60.0,
        }
        if base_url:
            kwargs["base_url"] = base_url
        raw = ChatAnthropic(**kwargs)
    elif provider == "zhipuai":
        from langchain_zhipuai import ChatZhipuAI
        kwargs = {
            "model": model,
            "timeout": 60,  # ZhipuAI uses integer timeout
        }
        raw = ChatZhipuAI(**kwargs)
    else:
        raise ValueError(
            f"Unsupported LLM_PROVIDER: '{provider}'. "
            f"Supported: google, openai, openrouter, anthropic, zhipuai"
        )

    return ContentNormalizingLLM(delegate=raw)
