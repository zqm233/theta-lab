# 波动率分析完全指南

## 隐含波动率（IV）基础

### 什么是 IV？

隐含波动率（Implied Volatility）是市场对未来股价波动程度的**预期**，通过期权价格反推计算得出。

- **不是**历史波动率（已经发生的）
- **是**市场参与者对未来的共识预期
- IV 越高 → 期权越贵（权利金越高）

### IV 的意义

对 Sell Put 策略：

- **高 IV = 好事**：收取更高权利金
- **IV 下降 = 好事**：期权价值缩水，提前平仓获利
- **IV 上升 = 坏事**：期权价值上涨，浮亏增加

## IV Rank（IV 百分位排名）

### 定义

IV Rank 表示当前 IV 在过去 52 周中的相对位置。

```
IV Rank = (当前 IV - 52周最低 IV) / (52周最高 IV - 52周最低 IV) × 100%
```

### 解读

- **IV Rank > 70%**：当前波动率处于历史高位（恐慌或重大事件前）
- **IV Rank 50-70%**：波动率偏高
- **IV Rank 30-50%**：波动率正常
- **IV Rank < 30%**：波动率偏低

### Sell Put 策略应用

- **最佳时机**：IV Rank > 50%（收取高权利金）
- **可操作**：IV Rank 30-50%
- **避免**：IV Rank < 30%（权利金太薄）

## IV Percentile（IV 百分位）

### 定义

IV Percentile 表示过去 52 周中，有多少天的 IV 低于当前水平。

```
IV Percentile = 过去 52 周中 IV 低于当前值的天数 / 252 × 100%
```

### 与 IV Rank 的区别

- **IV Rank**：考虑最高和最低的**区间**
- **IV Percentile**：考虑**所有交易日的分布**

如果某只股票有几天极端高 IV（如财报），IV Rank 会被拉高，但 IV Percentile 更能反映「常态分布」。

### 使用建议

**同时参考两者**：

- IV Rank 高 + IV Percentile 高：确实是高波动环境，可以卖
- IV Rank 高 但 IV Percentile 低：可能只是因为历史有极端值，当前未必真高
- IV Rank 低 + IV Percentile 低：真正的低波动，不适合卖

## 历史波动率（HV）

### 定义

Historical Volatility 是股价**实际波动**的统计值（标准差年化）。

```
HV = 过去 N 天日收益率的标准差 × √252
```

### HV vs IV

| 指标 | 性质 | 用途 |
|------|------|------|
| **HV** | 历史实际波动 | 参考「股票本身」波动性 |
| **IV** | 市场预期波动 | 反映「期权定价」和情绪 |

### IV-HV Spread（关键信号）

```
Spread = IV - HV
```

**解读**：

- **IV > HV**：市场预期波动 > 实际波动 → **期权相对贵** → 适合卖出
- **IV ≈ HV**：定价合理
- **IV < HV**：期权相对便宜 → 不适合卖出

**实战**：

- Spread > 10 个百分点：强烈信号，卖出期权
- Spread 5-10 个百分点：适合卖出
- Spread < 5 个百分点：观望

## IV Crush（财报后 IV 崩塌）

见《IV Crush 完全指南》（单独文档）。

## 波动率微笑（Volatility Smile / Skew）

### 定义

不同行权价的期权，IV 不同，画出来像一条曲线。

**典型形态**：

1. **Smile（微笑）**：价外的 Call 和 Put 的 IV 都高于平值期权
2. **Skew（偏斜）**：价外 Put 的 IV 明显高于价外 Call（市场对下跌的担忧 > 上涨）

### 对 Sell Put 的影响

- **Put Skew 高**：价外 Put 的权利金更肥（好事）
- **但同时意味着**：市场对下跌风险定价更高（坏事）

**策略**：

- 在 Skew 极端高时（恐慌），卖出深度价外 Put（赚恐慌溢价）
- 但要评估基本面是否真有系统性风险

## 实战应用流程

### Step 1：评估波动率环境

1. 查询当前 IV、IV Rank、IV Percentile
2. 计算 IV-HV Spread
3. 判断：高波动 or 低波动？

### Step 2：选择策略

| 波动率环境 | 策略 |
|-----------|------|
| IV Rank > 50% 且 IV > HV | **激进卖出**：选略价外的 Put，收取高权利金 |
| IV Rank 30-50% | **平衡卖出**：选深度价外 Put，求稳 |
| IV Rank < 30% | **观望**：等 IV 上升再卖 |

### Step 3：监控 IV 变化

- IV 持续下降：提前平仓锁定 Vega 收益
- IV 突然飙升：如果仍持仓，考虑是否有突发利空
- 接近财报：准备利用 IV Crush 平仓

## 高级技巧

### 1. Vega 套利

在 IV Rank 高时卖出，IV 回归均值时平仓，赚取 IV 下降的收益（Vega 为负）。

### 2. 日历价差（Calendar Spread）

卖出近月 Put，买入远月相同行权价 Put：

- 近月 Theta 衰减快
- 远月保护长期下跌风险
- 适合预期短期横盘、长期不确定

### 3. 波动率 Mean Reversion

IV 有均值回归特性：

- 极高 IV → 倾向回落
- 极低 IV → 倾向反弹

**策略**：在 IV 极端高时卖出，统计上有优势。

## 工具使用

### ThetaLab 波动率工具

1. **get_volatility_summary**：
   - 返回 IV、IV Rank、IV Percentile、HV、Spread
   - 给出「是否适合卖出」的信号

2. **sell_put_analysis**：
   - 包含完整的波动率分析
   - 结合 Greeks 和风险评估

3. **get_earnings_dates**：
   - 查财报日期
   - 评估 IV Crush 风险

## 参考资源

- TastyTrade IV Rank/Percentile 研究
- CBOE VIX 白皮书
- OptionAlpha 波动率课程
