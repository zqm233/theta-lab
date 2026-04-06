"""AgentCard definition for ThetaLab's A2A endpoint."""

from __future__ import annotations

from a2a.types import AgentCapabilities, AgentCard, AgentSkill


def build_agent_card(base_url: str = "http://localhost:8000") -> AgentCard:
    """Build the A2A AgentCard describing ThetaLab's capabilities."""
    return AgentCard(
        name="ThetaLab",
        description=(
            "AI-powered options & crypto trading assistant. "
            "Specialises in Sell Put/Call theta strategies, "
            "volatility analysis, and crypto Dual Investment (DCD) products."
        ),
        url=f"{base_url}/a2a",
        version="0.2.0",
        defaultInputModes=["text"],
        defaultOutputModes=["text"],
        capabilities=AgentCapabilities(streaming=True),
        skills=[
            AgentSkill(
                id="options-analysis",
                name="Options Analysis",
                description=(
                    "Sell Put / Sell Call analysis with Greeks, IV, "
                    "cushion, ROIC, annualised return, and earnings risk."
                ),
                tags=["options", "greeks", "volatility", "sell-put"],
            ),
            AgentSkill(
                id="crypto-market",
                name="Crypto Market Analysis",
                description=(
                    "Cryptocurrency market sentiment, technicals, "
                    "on-chain data, and news via CoinMarketCap."
                ),
                tags=["crypto", "market", "sentiment"],
            ),
            AgentSkill(
                id="crypto-dcd",
                name="Dual Investment Analysis",
                description=(
                    "Analyse and trade OKX Dual Investment (DCD) "
                    "products — Buy Low / Sell High strategies."
                ),
                tags=["crypto", "dcd", "dual-investment"],
            ),
        ],
    )
