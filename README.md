# ThetaLab

> **Theta (θ) decay is your edge.** Collect premium, manage risk, repeat.

[![中文文档](https://img.shields.io/badge/文档-中文版-blue)](./README_zh.md)

## What is ThetaLab?

ThetaLab is an AI-powered assistant built specifically for **options sellers**. It focuses on **Sell Put** and **Sell Call** strategies — the "theta harvesting" approach where you collect premium from time decay and manage risk systematically.

### Supported Markets

- **US Equities** — Full options chain support (Sell Put / Sell Call) for any US-listed ticker
- **Crypto** — OKX account management, Dual Investment (DCD) trading, and market data via MCP. Binance Dual Investment product viewing.

Unlike general-purpose trading platforms, ThetaLab is designed around the options seller's workflow: finding high-premium strikes, evaluating cushion and ROIC, monitoring IV rank, tracking earnings risk, and managing a portfolio of short options positions.

## Product scope (research-first)

- **Decision support & research** — ThetaLab’s core value is **options analysis, volatility context, and explainable recommendations** (LangGraph agent, tools, memory, RAG). It is **not** an automated broker router for US listed options.
- **US equities & options** — Market data and chain analytics are **read-only** from public/delayed feeds. **Portfolio and trade history are manual “paper” tracking** in local SQLite: you record positions yourself; **no agent or API in this repo places orders** with a US broker.
- **Crypto (OKX / DCD)** — Optional MCP integration may execute **only after explicit human-in-the-loop confirmation** in the UI when you enable tools and approve each sensitive action.
- **Comparison to generic agent frameworks** — Frameworks that emphasize multi-channel automation or pluggable execution are complementary. ThetaLab focuses on **domain depth and interview-grade LangGraph patterns**, not duplicating a full execution stack unless you explicitly extend it.

The built-in **hierarchical multi-agent system** (LangGraph + LangChain, any LLM provider) acts as your research and trading copilot. A Router agent classifies user intent and dispatches to specialized sub-agents — Options, Crypto (with Market/Account/DCD sub-routing), or General — each with its own tools and prompt. Sensitive operations (account transfers, DCD purchases) trigger a human-in-the-loop confirmation flow.

ThetaLab also implements the **[A2A (Agent-to-Agent) protocol](https://github.com/google/A2A)**, exposing itself as an interoperable agent that other AI agents can discover and collaborate with over HTTP.

## Key Features

- **Options Chain Viewer** — Real-time puts/calls with Greeks, IV, bid/ask spreads
- **Sell Put / Sell Call Analyzer** — Cushion, ROIC, annualized return, risk signals at a glance
- **Volatility Engine** — IV Rank, IV Percentile, Historical Volatility, IV-HV Spread
- **Earnings Risk Detection** — Auto-detect earnings dates with IV Crush warnings
- **Portfolio & Trade Tracking** — Short options positions, P&L, trade history lifecycle
- **Crypto Dual Investment** — OKX DCD purchase/redeem with human-in-the-loop confirmation; Binance product viewing
- **OKX Integration** — Full account management, market data, and trading via OKX MCP (configurable readonly/full access)
- **AI Chat Assistant** — Hierarchical multi-agent with intent routing, streaming responses, and memory
- **Human-in-the-Loop** — Sensitive operations (transfers, purchases) pause for user confirmation before execution
- **A2A Protocol** — Agent Card discovery, JSON-RPC messaging, and streaming — any A2A-compatible agent can call ThetaLab
- **Bilingual UI** — Chinese / English

## Architecture

```
                              ┌───── A2A Protocol ─────┐
                              │  /.well-known/agent.json │
External Agents ──JSON-RPC──► │  /a2a (message/send)    │
                              └────────────┬────────────┘
                                           │
User ──► React Frontend ──► FastAPI Backend ──► LangGraph Agent (Hierarchical)
                │                                       │
                │                              ┌────────┼────────┐
                │                              ▼        ▼        ▼
                │                           Options  Crypto   General
                │                                      │
                │                             ┌────────┼────────┐
                │                             ▼        ▼        ▼
                │                          Market  Account    DCD
                │                             │                │
                ▼                             ▼                ▼
          SSE Stream ◄──────────────── MCP Tools (OKX/CMC/FA)
          (tokens + confirm)                  │
                                              ▼
                                      Human-in-the-Loop
                                    (pause → confirm → resume)
```

### Agent Communication Patterns

ThetaLab uses three levels of agent communication:

| Level | Pattern | Example | Boundary |
|-------|---------|---------|----------|
| **L1** | StateGraph routing | Router → Options / Crypto / General | In-process, shared state |
| **L2** | Agent-as-Tool | DCD Agent → Market Agent (`analyze_market`) | In-process, tool call |
| **L3** | A2A protocol | External Agent → ThetaLab (`/a2a`) | Cross-process, HTTP |

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | Python, FastAPI, Uvicorn |
| Frontend | Next.js 16, React 19, TypeScript, TanStack Query |
| AI Agent | LangChain + LangGraph (hierarchical multi-agent) |
| LLM | Any provider — Gemini, OpenAI, Anthropic, or OpenRouter-compatible |
| Agent Interop | A2A protocol (a2a-sdk) |
| Observability | LangSmith (tracing, evaluation) |
| Market Data | yfinance + Yahoo Finance API |
| Quantitative | NumPy, SciPy (BSM model, Greeks, HV) |
| Database | SQLite (pluggable — PostgreSQL-ready via persistence abstraction) |
| Streaming | SSE (Server-Sent Events) |
| Exchange Data | OKX MCP (market/account/DCD), Binance API |

## Project Structure

```
thetalab/
├── main.py                        # CLI entry point
├── pyproject.toml                 # Python project config
├── Makefile                       # Dev shortcuts (make dev / backend / frontend)
├── backend/
│   ├── app.py                     # FastAPI application (lifespan, DI)
│   ├── db.py                      # SQLite database setup
│   ├── a2a/                       # A2A protocol integration
│   │   ├── __init__.py            # create_a2a_app() — FastAPI sub-app factory
│   │   ├── agent_card.py          # AgentCard definition (skills, capabilities)
│   │   └── executor.py            # A2A ↔ ThetaLabAgent bridge (stream translation)
│   ├── api/
│   │   ├── chat.py                # Chat & profile endpoints (SSE)
│   │   ├── options.py             # Options chain endpoints
│   │   ├── portfolio.py           # Portfolio & trade history
│   │   ├── crypto.py              # Crypto / DCD endpoints
│   │   ├── settings.py            # LLM, MCP, LangSmith config
│   │   └── schemas.py             # Pydantic request/response models
│   ├── agent/
│   │   ├── agent.py               # Public API facade (ThetaLabAgent)
│   │   ├── graph_builder.py       # Top-level graph orchestrator
│   │   ├── graphs/
│   │   │   └── crypto.py          # Crypto domain subgraph (Market/Account/DCD)
│   │   ├── graph_state.py         # State schemas & routing helpers
│   │   ├── prompts.py             # All system prompts
│   │   ├── llm.py                 # LLM factory & ContentNormalizingLLM
│   │   ├── agent_tool.py          # Agent-as-Tool wrapper
│   │   ├── streaming.py           # Stream loop & event unpacking
│   │   ├── memory.py              # Long-term profile store & extraction
│   │   ├── utils.py               # Shared utilities (extract_text, is_safe_tool)
│   │   ├── tools.py               # LangChain @tool definitions
│   │   ├── mcp_tools.py           # MCP tool loader (OKX, CMC, FlashAlpha)
│   │   └── persistence/
│   │       ├── __init__.py        # Backend dispatch (sqlite / postgres)
│   │       ├── sqlite.py          # SQLite checkpointer & store
│   │       └── postgres.py        # PostgreSQL checkpointer & store
│   ├── analysis/
│   │   ├── greeks.py              # Black-Scholes & Greeks
│   │   ├── strategy.py            # Sell Put metrics (cushion, ROIC)
│   │   ├── volatility.py         # HV, IV Rank, IV Percentile
│   │   └── risk.py                # Earnings & risk assessment
│   └── data/
│       ├── market.py              # Yahoo Finance data fetching
│       ├── securities.py          # Security search
│       ├── binance.py             # Binance dual investment
│       └── okx.py                 # OKX dual investment
├── frontend/                      # Next.js frontend (production)
│   └── app/
│       ├── page.tsx               # Main options workspace
│       ├── accounts/              # Portfolio overview
│       ├── dual-invest/           # Crypto dual investment
│       └── settings/              # System configuration
└── data/                          # Runtime SQLite databases (gitignored)
```

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+
- [uv](https://docs.astral.sh/uv/) (recommended) or pip
- An LLM API key (e.g. Google Gemini, OpenAI, etc.)

### Setup

1. **Clone the repository**

```bash
git clone https://github.com/zqm233/theta-lab.git
cd theta-lab
```

2. **Configure environment variables**

```bash
cp .env.example .env
# Edit .env and add your API keys
```

3. **Install dependencies**

```bash
uv sync                      # Backend (Python)
cd frontend && bun install   # Frontend (Next.js)
```

4. **Start both servers**

For a **demo talk track** (what to show and what *not* to promise), see [docs/DEMO.md](docs/DEMO.md).

```bash
make dev
# Backend → http://localhost:8000
# Frontend → http://localhost:5173
# A2A Agent Card → http://localhost:8000/a2a/.well-known/agent-card.json
```

Or start them individually:

```bash
make backend   # Backend only
make frontend  # Frontend only (in a separate terminal)
```

### CLI Mode

```bash
uv run python main.py
```

## A2A Integration

ThetaLab exposes an A2A-compatible endpoint at `/a2a`. Any A2A client can discover and interact with it:

```bash
# Discover capabilities
curl http://localhost:8000/a2a/.well-known/agent-card.json

# Send a message
curl -X POST http://localhost:8000/a2a \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "message/send",
    "params": {
      "message": {
        "messageId": "1",
        "role": "user",
        "parts": [{"text": "Analyze TSLA sell put at $200 strike"}]
      }
    },
    "id": "req-1"
  }'
```

The agent advertises three skills via its Agent Card: **Options Analysis**, **Crypto Market Analysis**, and **Dual Investment Analysis**.

## License

This project is for demonstration and educational purposes. It does not provide investment advice or broker execution for US options; all trading decisions and external integrations are your responsibility.
