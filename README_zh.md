# ThetaLab

> **Theta (θ) 时间衰减就是你的优势。** 收取权利金，管理风险，周而复始。

[![English](https://img.shields.io/badge/Docs-English-blue)](./README.md)

## ThetaLab 是什么？

ThetaLab 是一个专为**期权卖方**打造的 AI 助手，专注于 **Sell Put** 和 **Sell Call** 策略 — 通过 Theta (θ) 时间衰减收取权利金，做一个稳健的"收租型"期权玩家。

### 支持的市场

- **美股** — 支持任意美股标的的完整期权链（Sell Put / Sell Call）
- **加密货币** — 币安 & OKX 双币投资（一种类似 Sell Put / Sell Call 的结构化产品）。原生加密货币期权后续计划支持。

ThetaLab 不是大而全的交易平台，而是围绕期权卖方的工作流设计：筛选高权利金行权价、评估安全垫和 ROIC、监控 IV Rank、追踪财报风险、管理空头期权持仓。

内置 AI Agent（LangGraph + LangChain，支持任意大模型）是你的投研搭档 — 用自然语言让它分析标的、对比到期日、审视持仓风险。

## 核心功能

- **期权链查看器** — 实时看跌/看涨期权，含 Greeks、IV、买卖价差
- **Sell Put / Sell Call 分析** — 安全垫、ROIC、年化收益率、风险信号一目了然
- **波动率引擎** — IV Rank、IV 百分位、历史波动率、IV-HV 价差
- **财报风险检测** — 自动识别财报日期，IV Crush 预警
- **持仓与交易管理** — 空头期权持仓跟踪、盈亏计算、交易历史
- **加密货币双币投资** — 币安 & OKX 结构化产品（类似 Sell Put / Sell Call）
- **AI 聊天助手** — 对话式 Agent，支持工具调用、流式响应和记忆
- **中英双语界面** — 中文 / 英文

## 系统架构

```
用户 ──► React 前端 ──► FastAPI 后端 ──► LangGraph Agent
                            │                    │
                            │               工具调用
                            │                    │
                            ▼                    ▼
                        REST API         行情数据 (yfinance)
                        SSE 流式          波动率分析
                        SQLite 数据库     策略分析
                                         风险评估
```

## 技术栈

| 组件 | 技术 |
|------|------|
| 后端 | Python, FastAPI, Uvicorn |
| 前端 | React 19, Vite, TypeScript |
| AI Agent | LangChain + LangGraph |
| 行情数据 | yfinance + Yahoo Finance API |
| 量化计算 | NumPy, SciPy (BSM 模型, Greeks, HV) |
| 数据库 | SQLite |
| 流式传输 | SSE (Server-Sent Events) |
| 交易所数据 | 币安 API, OKX API / MCP |

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
│   │   ├── agent.py           # LangGraph Agent
│   │   ├── memory.py          # 长期记忆存储
│   │   ├── tools.py           # LangChain @tool 定义
│   │   └── mcp_tools.py       # MCP 工具集成
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

本项目仅用于演示和学习目的。
