"""Agent factory and profile extraction logic.

Builds a hierarchical LangGraph agent with a Router that dispatches
to domain-specific sub-agents (Options / Crypto / General), each
with its own focused tool set and system prompt.
"""

from __future__ import annotations

import copy
import json
import logging
import os
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any, Literal

import aiosqlite
from langchain.agents import create_agent
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, SystemMessage, ToolMessage
from langchain_core.outputs import ChatResult
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.graph import END, START, MessagesState, StateGraph
from pydantic import BaseModel

from backend.agent.memory import (
    create_store,
    get_profile_from_store,
    profile_as_text,
    update_profile_in_store,
)
from backend.agent.mcp_tools import get_mcp_tools_by_prefix
from backend.agent.tools import CRYPTO_TOOLS, OPTIONS_TOOLS

logger = logging.getLogger(__name__)

DB_DIR = Path(__file__).resolve().parent.parent.parent / "data"


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


class _ContentNormalizingLLM(BaseChatModel):
    """Wrapper that normalizes list-type message content to strings
    before forwarding to the real LLM. Some providers (OpenRouter /
    OpenInference) reject list content in ToolMessages with a 422."""

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

    def bind_tools(self, tools: Any, **kwargs: Any) -> "_ContentNormalizingLLM":
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


def _create_llm():
    """Instantiate the LLM based on LLM_PROVIDER, LLM_MODEL, and LLM_BASE_URL env vars."""
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
        kwargs: dict = {"model": model}
        if base_url and "googleapis" in base_url:
            kwargs["base_url"] = base_url
        return ChatGoogleGenerativeAI(**kwargs)
    elif provider == "openai":
        from langchain_openai import ChatOpenAI
        kwargs = {"model": model}
        if base_url:
            kwargs["base_url"] = base_url
        return ChatOpenAI(**kwargs)
    elif provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        kwargs = {"model": model}
        if base_url:
            kwargs["base_url"] = base_url
        return ChatAnthropic(**kwargs)
    else:
        raise ValueError(
            f"Unsupported LLM_PROVIDER: '{provider}'. "
            f"Supported: google, openai, anthropic"
        )

_BASE_PROMPT = """你是 ThetaLab —— 一个专业的 AI 投研助手。

## 输出规范
- 先给结论，再给关键数字，再讲风险点
- 用户信息不足时，主动追问缺失参数
- 金额使用美元标注，百分比保留1-2位小数
- 不夸大收益，不保证回报，始终包含风险提示

## 用户交易风格档案
{user_profile}

## 重要指令
- 根据用户的历史偏好给出个性化建议
- 在对话中留意用户的交易风格变化
- 需要实时数据时必须调用工具，不要编造数据
"""

ROUTER_PROMPT = """你是一个意图分类器。根据用户的最新消息，判断用户的意图属于以下哪个类别：

- "options"：美股期权相关（TSLA、TSLL、期权链、Sell Put、Sell Call、Greeks、IV、波动率、财报、期权策略分析、股票价格查询）
- "crypto"：加密货币相关（BTC、ETH、SOL、OKX、币安、行情、K线、双币投资、DCD、余额、账户、交易、申购、赎回）
- "general"：通用对话（打招呼、闲聊、一般性问题、不属于以上两类的内容）

请以 JSON 格式返回分类结果。"""

OPTIONS_PROMPT = _BASE_PROMPT + """
## 核心能力（美股期权）
你专注于 Sell Put 和 Sell Call 策略，帮助交易者通过 Theta 时间衰减稳健收取权利金。

1. 查询任意美股标的的实时价格和期权链数据
2. 运行 Sell Put / Sell Call 分析（安全垫、ROIC、Greeks、年化收益率）
3. 波动率分析（IV Rank、IV Percentile、HV、IV-HV Spread）
4. 财报日期与 IV Crush 风险评估
5. 通用期权策略分析（long/short call/put）
"""

CRYPTO_ROUTER_PROMPT = """你是一个加密货币意图分类器。根据用户的最新消息，判断用户的意图属于以下哪个类别：

- "market"：行情查询（价格、K线、盘口深度、资金费率、持仓量、交易对信息等）
- "account"：账户相关（余额、持仓、资产、账单、手续费、转账、提现额度等）
- "dcd"：双币投资 / 双币赢相关（DCD、申购、赎回、双币产品查询、Dual Investment）

请以 JSON 格式返回分类结果。"""

MARKET_PROMPT = _BASE_PROMPT + """
## 核心能力（加密货币行情）
你是加密货币行情分析专家，可以查询 OKX 平台的实时市场数据。

1. 实时价格查询（ticker）
2. K线 / 蜡烛图数据（candles）
3. 盘口深度（orderbook）
4. 资金费率（funding rate）
5. 持仓量（open interest）
6. 交易对信息（instruments）
7. 指数价格与标记价格

## 查询规范
- 加密货币交易对格式示例：BTC-USDT, ETH-USDT, SOL-USDT
- 使用 market_ 开头的工具（如 market_get_ticker）
"""

ACCOUNT_PROMPT = _BASE_PROMPT + """
## 核心能力（OKX 账户管理）
你是 OKX 账户管理专家，可以查询和管理用户的 OKX 账户。

1. 账户余额查询（交易账户、资金账户）
2. 持仓查询与历史持仓
3. 账单明细与历史账单
4. 手续费率查询
5. 最大可用余额 / 最大可交易数量
6. 资金划转

## 操作规范
- 涉及资金变动的操作（转账等）直接调用对应工具即可
- 系统会在执行前自动暂停并弹出确认对话框，由用户在界面上确认
- 你不需要在对话中额外请求确认，直接执行用户的指令

## OKX 账户查询规范
- 用户问"总资产"或"余额"时，需同时查 account_get_balance（交易账户）和 account_get_asset_balance（资金账户）
- 查到各币种余额后，用 market_get_ticker 获取各币种对 USDT 的实时价格，换算并汇总为 USDT 总估值
- 展示格式：先列各币种持仓及 USDT 估值，最后给出总资产（USDT）
- USDT 本身不需要换算，1 USDT = 1 USDT
"""

DCD_PROMPT = _BASE_PROMPT + """
## 核心能力（双币投资 / 双币赢）
你是 OKX 双币赢（DCD / Dual Investment）专家，帮助用户查询和操作双币投资产品。

1. 双币投资产品查询（OKX / Binance 的 Buy Low / Sell High 结构化产品）
2. 双币赢（DCD）的申购与赎回操作
3. 订单状态查询

## 交易操作规范
- 当用户要求申购、赎回等涉及资金变动的操作时，直接调用对应工具即可
- 系统会在执行前自动暂停并弹出确认对话框，由用户在界面上确认
- 你不需要在对话中额外请求确认，直接执行用户的指令
- **金额取整（极其重要）**：申购双币赢（DCD）时，投入金额必须是步长（stepSize / stepSz）的整数倍。若已知步长，向下取整（例如步长 0.0001 时，0.0004833 应取整为 0.0004）。若不确定步长，默认向下取整到小数点后 4 位
"""

GENERAL_PROMPT = _BASE_PROMPT + """
你可以帮助用户回答关于投资和交易的一般性问题。
如果用户需要具体的美股期权分析，请引导他们描述标的、策略等具体需求。
如果用户需要加密货币操作，请引导他们描述币种、操作类型等。
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


_SAFE_PREFIXES = ("market_", "skills_", "system_", "trade_get_", "get_", "analyze_")
_SAFE_INFIXES = ("_get_", "_analysis")


def _is_safe_tool(name: str) -> bool:
    """Return True for read-only / query tools that don't need confirmation."""
    if any(name.startswith(p) for p in _SAFE_PREFIXES):
        return True
    return any(p in name for p in _SAFE_INFIXES)


class RouteDecision(BaseModel):
    destination: Literal["options", "crypto", "general"]


class CryptoRouteDecision(BaseModel):
    destination: Literal["market", "account", "dcd"]


class AgentState(MessagesState):
    route: str


class CryptoState(MessagesState):
    crypto_route: str


def _get_route(state: AgentState) -> str:
    return state.get("route", "general")


def _get_crypto_route(state: CryptoState) -> str:
    return state.get("crypto_route", "market")


class ThetaLabAgent:
    """Manages the agent lifecycle, memory, and profile extraction."""

    def __init__(self, db_dir: Path | None = None) -> None:
        db_dir = db_dir or DB_DIR
        db_dir.mkdir(parents=True, exist_ok=True)

        self._store = create_store(db_dir / "store.db")

        self._checkpoint_path = str(db_dir / "checkpoints.db")
        self._checkpointer: AsyncSqliteSaver | None = None

        raw_llm = _create_llm()
        self._model = _ContentNormalizingLLM(delegate=raw_llm)

    async def _get_checkpointer(self) -> AsyncSqliteSaver:
        if self._checkpointer is None:
            conn = await aiosqlite.connect(self._checkpoint_path)
            self._checkpointer = AsyncSqliteSaver(conn)
            await self._checkpointer.setup()
        return self._checkpointer

    @property
    def store(self):
        return self._store

    def _make_router_node(self):
        """Return a callable that classifies user intent via structured LLM output."""
        router_llm = self._model.delegate

        async def _route(state: AgentState):
            structured = router_llm.with_structured_output(RouteDecision)
            result = await structured.ainvoke(
                [SystemMessage(content=ROUTER_PROMPT)] + state["messages"]
            )
            logger.info("Router decision: %s", result.destination)
            return {"route": result.destination}

        return _route

    def _make_crypto_router_node(self):
        """Return a callable that classifies crypto intent via structured output."""
        router_llm = self._model.delegate

        async def _route(state: CryptoState):
            structured = router_llm.with_structured_output(CryptoRouteDecision)
            result = await structured.ainvoke(
                [SystemMessage(content=CRYPTO_ROUTER_PROMPT)] + state["messages"]
            )
            logger.info("Crypto router decision: %s", result.destination)
            return {"crypto_route": result.destination}

        return _route

    def _build_crypto_graph(self, profile_text: str):
        """Build the Level-2 crypto subgraph with Market/Account/DCD sub-agents."""
        market_tools = get_mcp_tools_by_prefix("market_", "system_", "trade_")
        account_tools = get_mcp_tools_by_prefix("account_")
        dcd_tools = CRYPTO_TOOLS + get_mcp_tools_by_prefix("dcd_")

        market_agent = create_agent(
            model=self._model,
            system_prompt=MARKET_PROMPT.format(user_profile=profile_text),
            tools=market_tools or None,
            name="market",
        )

        account_agent = create_agent(
            model=self._model,
            system_prompt=ACCOUNT_PROMPT.format(user_profile=profile_text),
            tools=account_tools or None,
            interrupt_before=["tools"] if account_tools else None,
            name="account",
        )

        dcd_agent = create_agent(
            model=self._model,
            system_prompt=DCD_PROMPT.format(user_profile=profile_text),
            tools=dcd_tools or None,
            interrupt_before=["tools"] if dcd_tools else None,
            name="dcd",
        )

        builder = StateGraph(CryptoState)
        builder.add_node("crypto_router", self._make_crypto_router_node())
        builder.add_node("market", market_agent)
        builder.add_node("account", account_agent)
        builder.add_node("dcd", dcd_agent)

        builder.add_edge(START, "crypto_router")
        builder.add_conditional_edges("crypto_router", _get_crypto_route)
        builder.add_edge("market", END)
        builder.add_edge("account", END)
        builder.add_edge("dcd", END)

        return builder.compile()

    async def _build_agent(self, user_id: str = "default"):
        profile_text = profile_as_text(self._store, user_id)
        checkpointer = await self._get_checkpointer()

        options_agent = create_agent(
            model=self._model,
            system_prompt=OPTIONS_PROMPT.format(user_profile=profile_text),
            tools=OPTIONS_TOOLS,
            name="options",
        )

        crypto_graph = self._build_crypto_graph(profile_text)

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
        builder.add_conditional_edges("router", _get_route)
        builder.add_edge("options", END)
        builder.add_edge("crypto", END)
        builder.add_edge("general", END)

        return builder.compile(checkpointer=checkpointer, store=self._store)

    async def ainvoke(
        self, message: str, thread_id: str = "default", user_id: str = "default"
    ) -> str:
        agent = await self._build_agent(user_id)
        config = {"configurable": {"thread_id": thread_id}}
        result = await agent.ainvoke(
            {"messages": [{"role": "user", "content": message}]},
            config=config,
        )
        response_text = _extract_text(result["messages"][-1].content)
        self._try_extract_profile(message, response_text, user_id)
        return response_text

    @staticmethod
    def _unpack_stream_chunk(raw):
        """Extract (msg, metadata) from a stream chunk, handling subgraphs wrapping."""
        if isinstance(raw, tuple) and len(raw) == 2 and isinstance(raw[0], tuple):
            return raw[1]
        return raw

    @staticmethod
    def _extract_subgraph_tool_calls(state) -> tuple[list[dict], Any]:
        """Recursively find pending tool calls in (nested) subgraph tasks.

        Returns (tool_calls, sub_config) where sub_config is the deepest
        subgraph's checkpoint config — needed for aupdate_state on cancel.
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
                result = ThetaLabAgent._extract_subgraph_tool_calls(sub)
                if result[0]:
                    return result
        return [], None

    async def astream(
        self, message: str, thread_id: str = "default", user_id: str = "default"
    ):
        """Yield streamed chunks; auto-resumes safe tools, interrupts for sensitive ones.

        Yields dicts: {"type": "token", "content": "..."} or
                      {"type": "confirm", "tool_calls": [...]}
        """
        agent = await self._build_agent(user_id)
        config = {"configurable": {"thread_id": thread_id}}
        input_data: Any = {"messages": [{"role": "user", "content": message}]}

        full_text = ""
        while True:
            async for raw in agent.astream(
                input_data, config=config, stream_mode="messages", subgraphs=True,
            ):
                msg, metadata = self._unpack_stream_chunk(raw)
                if msg.content and metadata.get("langgraph_node") == "model":
                    text = _extract_text(msg.content)
                    if text:
                        full_text += text
                        yield {"type": "token", "content": text}

            state = await agent.aget_state(config, subgraphs=True)
            if not state.next:
                break

            tool_calls, _ = self._extract_subgraph_tool_calls(state)
            if not tool_calls:
                break

            if all(_is_safe_tool(tc["name"]) for tc in tool_calls):
                input_data = None
                continue

            yield {
                "type": "confirm",
                "tool_calls": [
                    {"name": tc["name"], "args": tc["args"]} for tc in tool_calls
                ],
            }
            return

        self._try_extract_profile(message, full_text, user_id)

    async def astream_resume(
        self, thread_id: str, user_id: str = "default", approved: bool = True
    ):
        """Resume after an interrupt. If not approved, cancel the pending tool calls."""
        agent = await self._build_agent(user_id)
        config = {"configurable": {"thread_id": thread_id}}

        if not approved:
            state = await agent.aget_state(config, subgraphs=True)
            tool_calls, sub_config = self._extract_subgraph_tool_calls(state)

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

        input_data: Any = None
        full_text = ""
        while True:
            async for raw in agent.astream(
                input_data, config=config, stream_mode="messages", subgraphs=True,
            ):
                msg, metadata = self._unpack_stream_chunk(raw)
                if msg.content and metadata.get("langgraph_node") == "model":
                    text = _extract_text(msg.content)
                    if text:
                        full_text += text
                        yield {"type": "token", "content": text}

            state = await agent.aget_state(config, subgraphs=True)
            if not state.next:
                break

            tool_calls, _ = self._extract_subgraph_tool_calls(state)
            if not tool_calls:
                break

            if all(_is_safe_tool(tc["name"]) for tc in tool_calls):
                input_data = None
                continue

            yield {
                "type": "confirm",
                "tool_calls": [
                    {"name": tc["name"], "args": tc["args"]} for tc in tool_calls
                ],
            }
            return

    def get_profile(self, user_id: str = "default") -> dict[str, Any]:
        return get_profile_from_store(self._store, user_id)

    async def get_history(self, thread_id: str = "default") -> list[dict[str, str]]:
        """Retrieve conversation history for a thread."""
        config = {"configurable": {"thread_id": thread_id}}
        try:
            checkpointer = await self._get_checkpointer()
            state = await checkpointer.aget(config)
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
            result = self._model.invoke(prompt)  # sync OK: LLM supports both
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
        pass
