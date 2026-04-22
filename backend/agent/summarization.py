"""Message history summarization for context window management.

Provides ``summarize_if_needed()`` which checks message count and
creates a summary of old messages when the conversation exceeds
a configurable threshold, keeping only recent messages in full.
"""

from __future__ import annotations

import logging
from typing import Any

from langchain_core.messages import BaseMessage, SystemMessage

from backend.agent.llm import ContentNormalizingLLM
from backend.agent.utils import extract_text

logger = logging.getLogger(__name__)


def format_messages_for_summary(messages: list[BaseMessage]) -> str:
    """Format a list of messages into a text block for summarization."""
    lines = []
    for msg in messages:
        role = "用户" if msg.type == "human" else "助手"
        content = extract_text(msg.content)
        if content:
            lines.append(f"{role}: {content}")
    return "\n".join(lines)


async def summarize_if_needed(
    model: ContentNormalizingLLM,
    messages: list[BaseMessage],
    max_recent: int = 6,
    trigger_threshold: int = 12,
) -> list[BaseMessage]:
    """Summarize old messages if conversation exceeds threshold.

    Strategy:
    - Keep the most recent ``max_recent`` messages in full
    - If total valid messages (human + ai) exceed ``trigger_threshold``,
      summarize older messages into a single SystemMessage
    - Always preserve existing SystemMessages at the start

    Args:
        model: LLM for generating the summary
        messages: Full message history from state
        max_recent: Number of recent messages to keep in full (default: 6)
        trigger_threshold: Minimum message count to trigger summarization (default: 12)

    Returns:
        Processed message list: [SystemMessages] + [Summary] + [Recent messages]
        or original messages if below threshold
    """
    valid_messages = [m for m in messages if m.type in ("human", "ai")]

    if len(valid_messages) <= trigger_threshold:
        return messages

    old_messages = valid_messages[:-max_recent]
    recent_messages = valid_messages[-max_recent:]

    logger.info(
        "Summarizing %d old messages, keeping %d recent",
        len(old_messages),
        len(recent_messages),
    )

    conversation_text = format_messages_for_summary(old_messages)

    from backend.agent.prompts import SUMMARIZATION_PROMPT

    prompt = SUMMARIZATION_PROMPT.format(conversation=conversation_text)
    result = await model.ainvoke(prompt)
    summary_text = extract_text(result.content).strip()

    logger.debug("Generated summary: %s", summary_text)

    system_messages = [m for m in messages if m.type == "system"]

    return [
        *system_messages,
        SystemMessage(content=f"[之前对话摘要] {summary_text}"),
        *recent_messages,
    ]
