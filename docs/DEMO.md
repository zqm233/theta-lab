# ThetaLab — demo script (interview / walkthrough)

Use this as a **talk track** for portfolio reviews and live demos. Keep the narrative **research-first** unless you explicitly extended broker execution yourself.

## 30-second pitch

ThetaLab is an **options-seller research assistant** for US equities (Sell Put / Sell Call workflows) with a **LangGraph hierarchical agent** (router → domain subgraphs), **streaming chat**, **short- and long-term memory**, optional **RAG**, and **read-only** market data. **US options positions and trade history are manual paper tracking** — the app does not place broker orders. Optional crypto flows may use **human-in-the-loop** when MCP and credentials are configured.

## 2-minute flow (recommended order)

1. **Options chain** — Show delayed quotes, Greeks, IV, Sell Put panel (cushion, ROIC, risk). Say: *analysis only, no order routing for US options.*
2. **Portfolio** — Add a position from the chain (right-click). Emphasize: **local paper journal**, P&L is for learning/tracking, not a live feed from a broker.
3. **Chat** — Ask a concrete question (e.g. *Compare TSLA vs TSLL sell put at X strike for next monthly*). Highlight **tool use**, **memory**, and **no automatic execution**.
4. **Settings (optional)** — LLM provider, **product scope** banner: reinforces *research vs execution* and crypto HITL only when enabled.

## If asked about OpenClaw-style execution stacks

- **They** often focus on **pluggable automation and orchestration** across channels or brokers.
- **ThetaLab** focuses on **domain-specific quant + LangGraph patterns + explainable output**. Execution for US options is **out of scope by default**; integration with an external executor is a deliberate **thin boundary**, not the centerpiece of the demo.

## Disclaimer line (say aloud once)

*Not financial advice. US options data is delayed; nothing here places orders for listed options.*
