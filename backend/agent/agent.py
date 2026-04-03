"""Agent factory and profile extraction logic.

Builds a LangChain agent with market data tools, SQLite-backed
conversation history, and LangGraph Store for long-term memory.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from pathlib import Path
from typing import Any

from langchain.agents import create_agent
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.checkpoint.sqlite import SqliteSaver

from backend.agent.memory import (
    create_store,
    get_profile_from_store,
    profile_as_text,
    update_profile_in_store,
)
from backend.agent.mcp_tools import get_mcp_tools
from backend.agent.tools import ALL_TOOLS

logger = logging.getLogger(__name__)

DB_DIR = Path(__file__).resolve().parent.parent.parent / "data"

SYSTEM_PROMPT_TEMPLATE = """你是 ThetaLab —— 一个专为期权卖方打造的 AI 投研助手。
你专注于 Sell Put 和 Sell Call 策略，帮助交易者通过 Theta 时间衰减稳健收取权利金。

## 核心能力
1. 查询任意美股标的的实时价格和期权链数据
2. 运行 Sell Put / Sell Call 分析（安全垫、ROIC、Greeks、年化收益率）
3. 波动率分析（IV Rank、IV Percentile、HV、IV-HV Spread）
4. 财报日期与 IV Crush 风险评估
5. 通用期权策略分析（long/short call/put）
6. 加密货币行情查询（通过 OKX MCP：实时价格、盘口深度、K线、资金费率、持仓量等）
7. 双币投资产品查询（Binance / OKX 的 Buy Low / Sell High 结构化产品）

## 输出规范
- 先给结论，再给关键数字，再讲风险点
- 用户信息不足时，主动追问缺失参数
- 金额使用美元标注，百分比保留1-2位小数
- 不夸大收益，不保证回报，始终包含风险提示

## 用户交易风格档案
{user_profile}

## 重要指令
- 根据用户的历史偏好给出个性化建议
- 在对话中留意用户的交易风格变化（策略偏好、风险承受度、常用标的、DTE偏好等）
- 需要实时数据时必须调用工具，不要编造价格或IV数据
- 查询加密货币行情时，使用 market_ 开头的工具（如 market_get_ticker）
- 加密货币交易对格式示例：BTC-USDT, ETH-USDT, SOL-USDT
"""

EXTRACTION_PROMPT = """分析以下对话，提取用户的交易偏好信息。只返回 JSON，不要其他文字。
如果没有发现任何偏好信息，返回空 JSON {{}}.

可提取的字段：
- preferred_strategies: list[str] - 偏好策略，如 ["sell_put", "covered_call"]
- risk_tolerance: str - 风险偏好: "conservative" / "moderate" / "aggressive"
- preferred_tickers: list[str] - 常关注的标的
- typical_dte_range: str - 偏好的到期天数范围，如 "14-45 days"
- delta_preference: str - Delta 偏好范围，如 "0.15-0.25"
- position_sizing: str - 仓位规模描述
- notes: list[str] - 其他值得记住的交易习惯（每条不超过20字）

对话内容：
{conversation}

JSON:"""


def _extract_text(content: Any) -> str:
    """Normalize LLM content that may be str or list of parts."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            part.get("text", "") if isinstance(part, dict) else str(part)
            for part in content
        )
    return str(content) if content else ""


class ThetaLabAgent:
    """Manages the agent lifecycle, memory, and profile extraction."""

    def __init__(self, db_dir: Path | None = None) -> None:
        db_dir = db_dir or DB_DIR
        db_dir.mkdir(parents=True, exist_ok=True)

        self._store = create_store(db_dir / "store.db")

        checkpoint_path = str(db_dir / "checkpoints.db")
        self._checkpoint_conn = sqlite3.connect(checkpoint_path, check_same_thread=False)
        self._checkpointer = SqliteSaver(self._checkpoint_conn)
        self._checkpointer.setup()

        self._model = ChatGoogleGenerativeAI(model="gemini-2.5-flash")

    @property
    def store(self):
        return self._store

    def _build_agent(self, user_id: str = "default"):
        profile_text = profile_as_text(self._store, user_id)
        system_prompt = SYSTEM_PROMPT_TEMPLATE.format(user_profile=profile_text)

        tools = ALL_TOOLS + get_mcp_tools()

        return create_agent(
            model=self._model,
            system_prompt=system_prompt,
            tools=tools,
            checkpointer=self._checkpointer,
            store=self._store,
        )

    def invoke(
        self, message: str, thread_id: str = "default", user_id: str = "default"
    ) -> str:
        agent = self._build_agent(user_id)
        config = {"configurable": {"thread_id": thread_id}}
        result = agent.invoke(
            {"messages": [{"role": "user", "content": message}]},
            config=config,
        )
        response_text = _extract_text(result["messages"][-1].content)
        self._try_extract_profile(message, response_text, user_id)
        return response_text

    def stream(
        self, message: str, thread_id: str = "default", user_id: str = "default"
    ):
        """Yield streamed chunks from the agent."""
        agent = self._build_agent(user_id)
        config = {"configurable": {"thread_id": thread_id}}

        full_text = ""
        for chunk in agent.stream(
            {"messages": [{"role": "user", "content": message}]},
            config=config,
            stream_mode="messages",
        ):
            msg, metadata = chunk
            if msg.content and metadata.get("langgraph_node") == "model":
                text = _extract_text(msg.content)
                if text:
                    full_text += text
                    yield text

        self._try_extract_profile(message, full_text, user_id)

    def get_profile(self, user_id: str = "default") -> dict[str, Any]:
        return get_profile_from_store(self._store, user_id)

    def get_history(self, thread_id: str = "default") -> list[dict[str, str]]:
        """Retrieve conversation history for a thread."""
        config = {"configurable": {"thread_id": thread_id}}
        try:
            state = self._checkpointer.get(config)
            if not state or "channel_values" not in state:
                return []
            messages = state["channel_values"].get("messages", [])
            history = []
            for msg in messages:
                role = getattr(msg, "type", "unknown")
                content = _extract_text(getattr(msg, "content", ""))
                if role in ("human", "ai") and content:
                    history.append({
                        "role": "user" if role == "human" else "assistant",
                        "content": content,
                    })
            return history
        except Exception:
            return []

    def _try_extract_profile(
        self, user_msg: str, assistant_msg: str, user_id: str
    ) -> None:
        """Best-effort extraction of trading preferences from conversation."""
        try:
            conversation = f"User: {user_msg}\nAssistant: {assistant_msg}"
            prompt = EXTRACTION_PROMPT.format(conversation=conversation)
            result = self._model.invoke(prompt)
            text = _extract_text(result.content).strip()

            if text.startswith("```"):
                text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

            updates = json.loads(text)
            if updates and isinstance(updates, dict):
                update_profile_in_store(self._store, updates, user_id)
                logger.info("Profile updated for user %s: %s", user_id, updates)
        except (json.JSONDecodeError, Exception) as exc:
            logger.debug("Profile extraction skipped: %s", exc)

    def close(self) -> None:
        self._checkpoint_conn.close()
