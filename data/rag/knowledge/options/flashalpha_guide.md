# FlashAlpha 高级期权分析工具指南

## 工具概览

FlashAlpha 提供专业的期权市场微观结构分析工具，帮助交易者识别关键价位、市场情绪和做市商行为。

### 核心功能

1. **GEX**（Gamma Exposure）— Gamma 暴露分析
2. **DEX**（Delta Exposure）— Delta 暴露分析
3. **VEX**（Vanna Exposure）— Vanna 暴露分析
4. **Key Levels** — Gamma Flip、Call/Put Wall 等关键价位
5. **高级波动率分析** — IV Rank/Percentile、期限结构、Skew
6. **完整期权链** — 所有行权价的 Greeks、OI、Volume
7. **BSM 计算器** — 希腊字母计算和 IV 反推

## 1. GEX（Gamma Exposure）分析

### 什么是 Gamma Exposure？

Gamma Exposure 衡量做市商因对冲期权持仓而需要买卖的股票数量。

**核心逻辑**：

- 零售投资者买入 Call/Put → 做市商卖出 → 做市商持有**负 Gamma**
- 做市商必须**Delta 对冲**：
  - 股价上涨 → 做市商需要卖出股票（压制涨幅）
  - 股价下跌 → 做市商需要买入股票（抑制跌幅）

### Gamma Flip 点

**定义**：净 Gamma 从正转负（或负转正）的价格

- **价格 > Gamma Flip**：净 Gamma 为正 → 做市商对冲行为**抑制波动**
- **价格 < Gamma Flip**：净 Gamma 为负 → 做市商对冲行为**放大波动**

**交易含义**：

- 在 Gamma Flip 上方：适合做双币赢（震荡）
- 在 Gamma Flip 下方：警惕加速下跌

### Call Wall / Put Wall

- **Call Wall**：某个行权价的 Call OI 极大，形成「阻力墙」
  - 做市商在此价位大量卖出对冲 → 价格难以突破

- **Put Wall**：某个行权价的 Put OI 极大，形成「支撑墙」
  - 做市商在此价位大量买入对冲 → 价格难以跌破

**Sell Put 应用**：

- 选择行权价在 Put Wall 下方：安全垫更大
- 避免在 Call Wall 附近卖 Put：如果突破 Call Wall，可能加速上涨（对 Sell Put 不利）

### 实战案例：TSLA GEX 分析

**假设数据**：

- 当前价格：$250
- Gamma Flip：$240
- Call Wall：$260（巨量 OI）
- Put Wall：$230（巨量 OI）

**分析**：

1. 价格在 Gamma Flip 上方 → 波动相对可控
2. Call Wall 在 $260 → 短期上涨阻力
3. Put Wall 在 $230 → 下方有支撑

**策略**：

- Sell Put $225（在 Put Wall 下方，安全垫大）
- 到期日选 30 天（时间足够观察 GEX 变化）
- 预期：价格在 $230-260 震荡，Put 到期作废

## 2. DEX（Delta Exposure）分析

### 什么是 Delta Exposure？

Delta Exposure 反映市场的**方向性押注**（多空倾向）。

- **正 DEX**：净多头倾向（Call 多于 Put）
- **负 DEX**：净空头倾向（Put 多于 Call）

### 交易应用

- **大量正 DEX + 价格上涨**：多头强势，趋势健康
- **大量正 DEX + 价格下跌**：警惕多头踩踏
- **大量负 DEX + 价格下跌**：空头强势，避免抄底
- **大量负 DEX + 价格上涨**：空头挤压（Short Squeeze）

## 3. VEX（Vanna Exposure）分析

### 什么是 Vanna？

Vanna 是 Delta 对 IV 的敏感度。

```
Vanna = ∂Delta / ∂IV
```

### Vanna Exposure 含义

- **正 Vanna 暴露**：IV 上升 → Delta 增加 → 做市商需买入对冲 → 价格上涨
- **负 Vanna 暴露**：IV 上升 → Delta 减少 → 做市商需卖出对冲 → 价格下跌

### 交易应用

**场景 1：正 Vanna + IV 上升（如财报前）**

- 做市商被迫买入对冲
- 价格倾向上涨
- Sell Put 风险较低

**场景 2：负 Vanna + IV 上升**

- 做市商被迫卖出对冲
- 价格倾向下跌
- Sell Put 风险较高

## 4. HVL（High Volatility Line）

### 定义

HVL 是预期波动率的上界，通常为 1 倍标准差（1σ）。

```
HVL = 当前价格 × (1 + 日波动率 × √DTE)
```

### 应用

- **Sell Put 行权价远低于 -1σ 线**：触及概率 < 16%
- **-1σ 到 -2σ 之间**：触及概率 2-16%（深度价外）
- **低于 -2σ**：触及概率 < 2%（极深价外）

## 5. Zero Gamma 点

### 定义

某个行权价附近的 Gamma 总和为零。

### 意义

- Zero Gamma 点是价格的「平衡点」
- 价格倾向在此附近波动
- 类似「磁铁效应」

## 综合应用：GetStockSummary

### 一站式分析

`GetStockSummary` 返回：

1. **关键价位**（Gamma Flip、Call Wall、Put Wall、HVL、Zero Gamma）
2. **GEX 图表**（净 Gamma 分布）
3. **DEX 分析**（多空倾向）
4. **VEX 分析**（Vanna 暴露）
5. **波动率分析**（IV Rank/Percentile、HV、期限结构）
6. **最近 earnings 日期**

### 输出示例解读

```json
{
  "key_levels": {
    "gamma_flip": 240.0,
    "call_wall": 260.0,
    "put_wall": 230.0,
    "hvl_1sd_up": 265.0,
    "hvl_1sd_down": 235.0,
    "zero_gamma": 250.0
  },
  "net_gex": "Positive above 240",
  "net_dex": "Neutral",
  "iv_rank": 68,
  "iv_percentile": 72
}
```

**分析**：

- 当前价 $250，在 Gamma Flip 上方且接近 Zero Gamma → **震荡市**
- IV Rank 68% → **高波动环境，适合卖 Put**
- Call Wall $260、Put Wall $230 → **预期区间 $230-260**

**策略**：

- Sell Put $220（在 Put Wall 下方，安全垫 12%）
- 到期 30 天
- 预期：赚取高权利金，到期作废

## 使用限制

### 免费版限制

- **每日 5 次 API 调用**
- 合理使用：
  1. 每天分析 1-2 个标的
  2. 优先用 `GetStockSummary`（一次获取全部数据）
  3. 不要频繁刷新

### 数据覆盖

- 仅支持美股
- 高流动性标的数据更准确（如 SPY、TSLA、AAPL）
- 小盘股数据可能不完整

## 学习资源

- FlashAlpha 官方文档
- SpotGamma（类似工具）
- SqueezeMetrics 研究报告
- Investopedia: Gamma、Vanna 解释
