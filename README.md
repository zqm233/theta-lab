# ThetaLab

> **Theta (θ) decay is your edge.** Collect premium, manage risk, repeat.

[![中文文档](https://img.shields.io/badge/文档-中文版-blue)](./README_zh.md)

## What is ThetaLab?

ThetaLab is an AI-powered assistant built specifically for **options sellers**. It focuses on **Sell Put** and **Sell Call** strategies — the "theta harvesting" approach where you collect premium from time decay and manage risk systematically.

### Supported Markets

- **US Equities** — Full options chain support (Sell Put / Sell Call) for any US-listed ticker
- **Crypto** — Dual Investment products on Binance & OKX (a structured product similar to Sell Put / Sell Call). Native crypto options support is planned for the future.

Unlike general-purpose trading platforms, ThetaLab is designed around the options seller's workflow: finding high-premium strikes, evaluating cushion and ROIC, monitoring IV rank, tracking earnings risk, and managing a portfolio of short options positions.

The built-in AI agent (LangGraph + LangChain, any LLM provider) acts as your research copilot — ask it to analyze a ticker, compare expirations, or review your portfolio risk, all through natural conversation.

## Key Features

- **Options Chain Viewer** — Real-time puts/calls with Greeks, IV, bid/ask spreads
- **Sell Put / Sell Call Analyzer** — Cushion, ROIC, annualized return, risk signals at a glance
- **Volatility Engine** — IV Rank, IV Percentile, Historical Volatility, IV-HV Spread
- **Earnings Risk Detection** — Auto-detect earnings dates with IV Crush warnings
- **Portfolio & Trade Tracking** — Short options positions, P&L, trade history lifecycle
- **Crypto Dual Investment** — Binance & OKX structured products (similar to covered Sell Put / Sell Call)
- **AI Chat Assistant** — Conversational agent with tool use, streaming responses, and memory
- **Bilingual UI** — Chinese / English

## Architecture

```
User ──► React Frontend ──► FastAPI Backend ──► LangGraph Agent
                                │                    │
                                │               Tool Calls
                                │                    │
                                ▼                    ▼
                            REST API         Market Data (yfinance)
                            SSE Stream       Volatility Analysis
                            SQLite DB        Strategy Analysis
                                             Risk Assessment
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | Python, FastAPI, Uvicorn |
| Frontend | React 19, Vite, TypeScript |
| AI Agent | LangChain + LangGraph |
| Market Data | yfinance + Yahoo Finance API |
| Quantitative | NumPy, SciPy (BSM model, Greeks, HV) |
| Database | SQLite |
| Streaming | SSE (Server-Sent Events) |
| Exchange Data | Binance API, OKX API / MCP |

## Project Structure

```
thetalab/
├── main.py                    # CLI entry point
├── pyproject.toml             # Python project config
├── backend/
│   ├── app.py                 # FastAPI application
│   ├── db.py                  # SQLite database setup
│   ├── api/
│   │   └── routes.py          # REST & SSE endpoints
│   ├── agent/
│   │   ├── agent.py           # LangGraph agent
│   │   ├── memory.py          # Long-term memory store
│   │   ├── tools.py           # LangChain @tool definitions
│   │   └── mcp_tools.py       # MCP tool integration
│   ├── analysis/
│   │   ├── greeks.py          # Black-Scholes & Greeks
│   │   ├── strategy.py        # Sell Put metrics (cushion, ROIC)
│   │   ├── volatility.py      # HV, IV Rank, IV Percentile
│   │   └── risk.py            # Earnings & risk assessment
│   └── data/
│       ├── market.py          # Yahoo Finance data fetching
│       ├── securities.py      # Security search
│       ├── binance.py         # Binance dual investment
│       └── okx.py             # OKX dual investment
├── frontend/
│   └── src/
│       ├── App.tsx            # Main app shell
│       ├── components/        # UI components
│       ├── hooks/             # Custom React hooks
│       ├── i18n.tsx           # Internationalization (zh/en)
│       └── ...
└── data/                      # Runtime SQLite databases (gitignored)
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

3. **Install backend dependencies**

```bash
uv sync
# or: pip install -e .
```

4. **Install frontend dependencies**

```bash
cd frontend
bun install
cd ..
```

5. **Start the backend**

```bash
uv run python -m backend.app
# API available at http://localhost:8000
```

6. **Start the frontend** (in a separate terminal)

```bash
cd frontend
bun run dev
# UI available at http://localhost:5173
```

### CLI Mode

You can also interact with the agent directly from the terminal:

```bash
uv run python main.py
```

## License

This project is for demonstration and educational purposes.
