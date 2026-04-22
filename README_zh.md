# ThetaLab

> **Theta (θ) 时间衰减就是你的优势。** 收取权利金，管理风险，周而复始。

[![English](https://img.shields.io/badge/Docs-English-blue)](./README.md)

## ThetaLab 是什么？

ThetaLab 是一个专为**期权卖方**打造的 AI 助手，专注于 **Sell Put** 和 **Sell Call** 策略 — 通过 Theta (θ) 时间衰减收取权利金，做一个稳健的"收租型"期权玩家。

### 支持的市场

- **美股** — 支持任意美股标的的完整期权链（Sell Put / Sell Call）
- **加密货币** — OKX 账户管理、双币赢（DCD）交易、行情数据（通过 MCP）；币安双币投资产品查看

ThetaLab 不是大而全的交易平台，而是围绕期权卖方的工作流设计：筛选高权利金行权价、评估安全垫和 ROIC、监控 IV Rank、追踪财报风险、管理空头期权持仓。

## 产品定位（投研优先）

- **决策支持与投研** — 核心价值在于**期权分析、波动率语境与可解释的建议**（LangGraph Agent、工具、记忆、RAG）。本仓库**不包含**面向美股上市期权的「自动对接券商下单」执行层。
- **美股与期权** — 行情与期权链来自公开/延迟数据源，以**只读**分析为主。**持仓与交易历史为本地 SQLite 中的手动「纸面/模拟」记录**，由用户自行维护；**Agent 与后端 API 不会代下美股期权单**。
- **加密货币（OKX / 双币赢）** — 可选的 MCP 集成仅在你在界面中**显式人机确认**后，才可能执行敏感操作。
- **与通用 Agent 框架的关系** — 强调多通道编排或外挂执行的框架可作为补充；ThetaLab 侧重**领域深度与可展示的 LangGraph 工程范式**，而非默认复制一整条实盘执行链。

内置**层级式多 Agent 系统**（LangGraph + LangChain，支持任意大模型）是你的投研与交易搭档。Router Agent 识别用户意图，分发到专业子 Agent — 期权、加密货币（下分 Market/Account/DCD 子路由）、通用 — 各自拥有独立的工具集和提示词。涉及资金变动的操作（账户转账、DCD 申购）会触发人机确认流程。

## 核心功能

- **期权链查看器** — 实时看跌/看涨期权，含 Greeks、IV、买卖价差
- **Sell Put / Sell Call 分析** — 安全垫、ROIC、年化收益率、风险信号一目了然
- **波动率引擎** — IV Rank、IV 百分位、历史波动率、IV-HV 价差
- **财报风险检测** — 自动识别财报日期，IV Crush 预警
- **持仓与交易管理** — 空头期权持仓跟踪、盈亏计算、交易历史
- **加密货币双币赢** — OKX DCD 申购/赎回，人机确认后执行；币安产品查看
- **OKX 深度集成** — 账户管理、行情数据、交易操作，通过 OKX MCP（可配置只读/完整权限）
- **AI 聊天助手** — 层级式多 Agent，意图路由分发，流式响应 + 长期记忆
- **人机协作** — 敏感操作（转账、申购）自动暂停，等待用户确认后执行
- **中英双语界面** — 中文 / 英文

## 系统架构

```
用户 ──► React 前端 ──► FastAPI 后端 ──► LangGraph Agent（层级式）
             │                                    │
             │                           ┌────────┼────────┐
             │                           ▼        ▼        ▼
             │                        期权     加密货币    通用
             │                                   │
             │                          ┌────────┼────────┐
             │                          ▼        ▼        ▼
             │                        行情     账户      DCD
             │                          │        │        │
             ▼                          ▼        ▼        ▼
       SSE 流式传输 ◄──────────── OKX MCP 工具 (stdio)
      (token + 确认)                    │
                                        ▼
                                   人机确认流程
                                 (暂停 → 确认 → 继续)
```

## 技术栈

| 组件 | 技术 |
|------|------|
| 后端 | Python, FastAPI, Uvicorn |
| 前端 | Next.js 16, React 19, TypeScript, TanStack Query |
| AI Agent | LangChain + LangGraph（层级式多 Agent） |
| 大模型 | 任意供应商 — Gemini、OpenAI、Anthropic 或 OpenRouter 兼容 |
| 行情数据 | yfinance + Yahoo Finance API |
| 量化计算 | NumPy, SciPy (BSM 模型, Greeks, HV) |
| 数据库 | SQLite（AsyncSqliteSaver 异步检查点） |
| 流式传输 | SSE (Server-Sent Events) |
| 交易所数据 | OKX MCP（行情/账户/DCD）, 币安 API |

## 项目结构

```
thetalab/
├── main.py                    # CLI 入口
├── pyproject.toml             # Python 项目配置
├── backend/
│   ├── app.py                 # FastAPI 应用
│   ├── db.py                  # SQLite 数据库初始化
│   ├── api/
│   │   └── routes.py          # REST & SSE 端点
│   ├── agent/
│   │   ├── agent.py           # 层级式多 Agent（Router → 子 Agent）
│   │   ├── memory.py          # 长期记忆存储
│   │   ├── tools.py           # LangChain @tool 定义
│   │   └── mcp_tools.py       # OKX MCP 工具加载（按前缀过滤）
│   ├── analysis/
│   │   ├── greeks.py          # Black-Scholes 与 Greeks
│   │   ├── strategy.py        # Sell Put 指标 (安全垫, ROIC)
│   │   ├── volatility.py      # HV, IV Rank, IV 百分位
│   │   └── risk.py            # 财报与风险评估
│   └── data/
│       ├── market.py          # Yahoo Finance 数据获取
│       ├── securities.py      # 证券搜索
│       ├── binance.py         # 币安双币投资
│       └── okx.py             # OKX 双币投资
├── frontend/
│   └── src/
│       ├── App.tsx            # 应用主框架
│       ├── components/        # UI 组件
│       ├── hooks/             # 自定义 React Hooks
│       ├── i18n.tsx           # 国际化 (zh/en)
│       └── ...
└── data/                      # 运行时 SQLite 数据库（已 gitignore）
```

## 快速开始

### 前置要求

- Python 3.10+
- Node.js 18+
- [uv](https://docs.astral.sh/uv/)（推荐）或 pip
- 大模型 API Key（如 Google Gemini、OpenAI 等）

### 安装步骤

1. **克隆仓库**

```bash
git clone https://github.com/zqm233/theta-lab.git
cd theta-lab
```

2. **配置环境变量**

```bash
cp .env.example .env
# 编辑 .env，添加你的 API Key
```

3. **安装后端依赖**

```bash
uv sync
# 或者：pip install -e .
```

4. **安装前端依赖**

```bash
cd frontend
bun install
cd ..
```

5. **启动后端**

面试或演示时的讲解顺序与边界说明见 [docs/DEMO.md](docs/DEMO.md)。

```bash
uv run python -m backend.app
# API 地址：http://localhost:8000
```

6. **启动前端**（在另一个终端）

```bash
cd frontend
bun run dev
# UI 地址：http://localhost:5173
```

### 命令行模式

你也可以直接在终端与 Agent 对话：

```bash
uv run python main.py
```

## 许可

本项目仅用于演示和学习目的。不构成投资建议，亦不通过本仓库代下美股期权单；外部集成与交易决策由使用者自行负责。
