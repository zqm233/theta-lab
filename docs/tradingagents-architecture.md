# TradingAgents — Technical Architecture

> Source: [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents) (48.5k stars)
> Paper: [arXiv:2412.20138](https://arxiv.org/abs/2412.20138)

## LangGraph Execution Flow

```
START
  │
  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Phase 1: Analyst Team                        │
│                   (sequential, each with ReAct tool loop)       │
│                                                                 │
│  Market Analyst ◄──► tools_market     → Msg Clear Market        │
│       │                                      │                  │
│       ▼                                      ▼                  │
│  Social Analyst ◄──► tools_social     → Msg Clear Social        │
│       │                                      │                  │
│       ▼                                      ▼                  │
│  News Analyst   ◄──► tools_news       → Msg Clear News          │
│       │                                      │                  │
│       ▼                                      ▼                  │
│  Fundamentals   ◄──► tools_fundamentals → Msg Clear Fundamentals│
│                                                                 │
│  Output: market_report, sentiment_report,                       │
│          news_report, fundamentals_report                       │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                Phase 2: Investment Debate                       │
│                (alternating, N rounds)                          │
│                                                                 │
│              ┌──► Bull Researcher ───┐                          │
│              │    (看多论点)          │                          │
│              │                       ▼                          │
│              └─── Bear Researcher ◄──┘                          │
│                   (看空论点)                                     │
│                                                                 │
│  Routing: count < 2 * max_debate_rounds → continue              │
│           count >= threshold            → Research Manager       │
│                                                                 │
│                       ▼                                         │
│              Research Manager                                   │
│              (综合双方观点 → investment_plan)                     │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Phase 3: Trading Proposal                      │
│                                                                 │
│                     Trader                                      │
│            (生成交易提案: BUY/HOLD/SELL                          │
│             + 具体仓位和理由)                                    │
│                                                                 │
│  Output: trader_investment_plan                                 │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                Phase 4: Risk Committee                          │
│                (3-way rotation, M rounds)                       │
│                                                                 │
│          ┌──► Aggressive Analyst ──┐                             │
│          │    (激进风控: 强调机会)   │                             │
│          │                         ▼                             │
│          │    Conservative Analyst ──┐                           │
│          │    (保守风控: 强调风险)     │                           │
│          │                           ▼                           │
│          └─── Neutral Analyst ◄──────┘                          │
│               (中性风控: 平衡评估)                                │
│                                                                 │
│  Routing: count < 3 * max_risk_discuss_rounds → continue        │
│           count >= threshold                  → Portfolio Mgr   │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                Phase 5: Final Decision                          │
│                                                                 │
│                  Portfolio Manager                               │
│          (最终裁决: Buy/Overweight/Hold/                         │
│           Underweight/Sell + 完整理由)                            │
│                                                                 │
│  Output: final_trade_decision                                   │
│              │                                                  │
│              ▼                                                  │
│       Signal Processor                                          │
│    (LLM 提取单 token: BUY/SELL/HOLD)                            │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
                             END


Optional: reflect_and_remember(returns/losses)
         → BM25 Memory for future reference
```

## Agent Roles & LLM Assignment

```
┌─────────────────────────────────────────────────────────┐
│               quick_think_llm (fast, cheap)             │
│                                                         │
│  Market Analyst    ── tools: get_stock_data,            │
│                       get_indicators, get_insider_data  │
│  Social Analyst    ── tools: get_reddit_posts,          │
│                       get_global_news                   │
│  News Analyst      ── tools: get_global_news,           │
│                       get_finnhub_news                  │
│  Fundamentals      ── tools: get_financial_statements,  │
│                       get_company_overview              │
│                                                         │
│  Bull Researcher   ── no tools, reads 4 reports + BM25  │
│  Bear Researcher   ── no tools, reads 4 reports + BM25  │
│  Trader            ── no tools, reads investment_plan    │
│  Aggressive Risk   ── no tools, reads trader_plan       │
│  Conservative Risk ── no tools, reads trader_plan       │
│  Neutral Risk      ── no tools, reads trader_plan       │
├─────────────────────────────────────────────────────────┤
│               deep_think_llm (strong, expensive)        │
│                                                         │
│  Research Manager  ── no tools, synthesizes debate       │
│  Portfolio Manager ── no tools, final 5-tier decision    │
└─────────────────────────────────────────────────────────┘
```

## State Schema

```
AgentState (extends MessagesState)
├── company_of_interest: str        # Ticker (e.g. "TSLA")
├── trade_date: str                 # Analysis date
├── sender: str                     # Current speaker
│
├── market_report: str              # ← Market Analyst output
├── sentiment_report: str           # ← Social Analyst output
├── news_report: str                # ← News Analyst output
├── fundamentals_report: str        # ← Fundamentals Analyst output
│
├── investment_debate_state:        # Bull/Bear debate tracking
│   ├── history: str                #   Full debate transcript
│   ├── bull_history: str           #   Bull-only lines
│   ├── bear_history: str           #   Bear-only lines
│   ├── current_response: str       #   Last speaker's line (routing key)
│   ├── count: int                  #   Total turns so far
│   └── judge_decision: str         #   Research Manager's verdict
│
├── investment_plan: str            # ← Research Manager output
├── trader_investment_plan: str     # ← Trader output
│
├── risk_debate_state:              # Risk committee tracking
│   ├── history: str
│   ├── aggressive_history: str
│   ├── conservative_history: str
│   ├── neutral_history: str
│   ├── latest_speaker: str         #   Routing key
│   └── count: int
│
└── final_trade_decision: str       # ← Portfolio Manager output
```

## Key Design Patterns

### 1. Msg Clear (Context Window Management)
Between each analyst, a `Msg Clear` node removes all `messages` using
`RemoveMessage`. This prevents tool call transcripts from one analyst
leaking into the next analyst's context window.

### 2. Debate Routing (String Prefix)
Bull/Bear alternation is controlled by checking if `current_response`
starts with `"Bull"`. Simple but effective — no extra LLM call needed
to decide who speaks next.

### 3. LLM Tiering
`deep_think_llm` is reserved for the two "judge" roles (Research Manager,
Portfolio Manager) that synthesize complex multi-perspective inputs.
All other agents use `quick_think_llm` to reduce cost and latency.

### 4. BM25 Memory (Offline, No Embedding)
Past trading situations and outcomes are stored as text and retrieved
via BM25 lexical matching — no vector DB or embedding model required.
Roles that use memory: Bull, Bear, Trader, Research Manager, Portfolio Manager.

## vs ThetaLab Architecture

| Aspect | TradingAgents | ThetaLab |
|--------|--------------|----------|
| Graph type | Single linear pipeline | Hierarchical router + subgraphs |
| Agent count | 12 (fixed roles) | 6+ (extensible domains) |
| Communication | Shared state fields | StateGraph + Agent-as-Tool + A2A |
| Debate | Bull/Bear + Risk triangle | Not yet implemented |
| Tools | yfinance, Alpha Vantage | MCP (OKX, CMC, FlashAlpha), yfinance |
| Memory | BM25 (offline) | LangGraph Store (persistent profiles) |
| Output | CLI text (5-tier rating) | Full UI + SSE streaming |
| Trading | None (advisory only) | OKX DCD execution + HITL |
| Interop | None | A2A protocol |
| Persistence | None | SQLite / PostgreSQL (pluggable) |
