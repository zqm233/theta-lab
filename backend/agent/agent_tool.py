"""Agent-as-Tool pattern — wrap a LangGraph agent as a LangChain tool.

Usage:
    market_agent = create_agent(model=llm, tools=market_tools, ...)
    tool = agent_as_tool(
        market_agent,
        name="analyze_market",
        description="Analyze crypto market sentiment and technicals.",
    )

    # Now `tool` is a regular LangChain BaseTool that can be given
    # to any other agent, just like @tool-decorated functions.
    dcd_agent = create_agent(model=llm, tools=[..., tool], ...)
"""

from __future__ import annotations

from typing import Any

from langchain_core.messages import HumanMessage
from langchain_core.tools import BaseTool
from pydantic import Field

from backend.agent.utils import extract_text


class AgentTool(BaseTool):
    """A LangChain tool that delegates to a compiled LangGraph agent.

    The wrapped agent runs to completion and the final AI message
    content is returned as the tool result.
    """

    name: str
    description: str
    agent: Any = Field(exclude=True)

    async def _arun(self, query: str) -> str:
        result = await self.agent.ainvoke(
            {"messages": [HumanMessage(content=query)]}
        )
        return extract_text(result["messages"][-1].content)

    def _run(self, query: str) -> str:
        raise NotImplementedError("Use async — await tool.ainvoke(...)")


def agent_as_tool(agent: Any, *, name: str, description: str) -> AgentTool:
    """Wrap a compiled LangGraph agent as a LangChain tool.

    Args:
        agent: A compiled LangGraph graph (the return value of
               ``create_agent(...)`` or ``builder.compile()``).
        name: Tool name visible to the calling agent.
        description: Tool description — tells the calling agent
                     when and how to use this tool.

    Returns:
        An ``AgentTool`` instance that behaves like any other
        LangChain ``BaseTool``.
    """
    return AgentTool(agent=agent, name=name, description=description)
