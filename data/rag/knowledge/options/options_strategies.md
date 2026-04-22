# 期权策略完全指南

## 基础策略

### 1. Long Call（买入看涨期权）

**方向**：看涨

**最大收益**：理论无限（股价可以无限上涨）

**最大亏损**：权利金

**盈亏平衡点**：行权价 + 权利金

**适用场景**：

- 强烈看涨但不想承担买入股票的全部成本
- 预期股价大幅上涨
- 杠杆做多

**风险**：

- 时间衰减（Theta 为负）
- IV 下降导致期权贬值

### 2. Long Put（买入看跌期权）

**方向**：看跌

**最大收益**：行权价 - 权利金（股价跌至 0）

**最大亏损**：权利金

**盈亏平衡点**：行权价 - 权利金

**适用场景**：

- 预期股价下跌
- 对冲持股风险（Protective Put）
- 杠杆做空

### 3. Sell Put（卖出看跌期权）

见《Sell Put 策略完全指南》（单独文档）。

### 4. Sell Call（卖出看涨期权）

**方向**：看空或看震荡

**最大收益**：权利金

**最大亏损**：理论无限（股价可以无限上涨）

**盈亏平衡点**：行权价 + 权利金

**适用场景**：

- **Covered Call**（备兑看涨）：持有股票时卖出 Call，增强收益
- 预期股价不会超过行权价

**风险**：

- 股价大涨时，踏空收益（Covered Call）
- 裸卖 Call 风险极高（不建议）

## 价差策略（Spreads）

### 5. Bull Put Spread（看涨看跌价差）

**构成**：

- Sell Put（较高行权价）
- Buy Put（较低行权价）

**方向**：温和看涨或震荡

**最大收益**：净权利金（Sell Put 收入 - Buy Put 成本）

**最大亏损**：(行权价差 - 净权利金) × 100

**优势**：

- 相比裸 Sell Put，风险有限
- 降低保证金要求

**劣势**：

- 最大收益被限制

**例子**：

- 当前价：$250
- Sell Put $240（收 $4）
- Buy Put $230（付 $1）
- 净收入：$3
- 最大收益：$300
- 最大亏损：($10 - $3) × 100 = $700

### 6. Bear Call Spread（看跌看涨价差）

**构成**：

- Sell Call（较低行权价）
- Buy Call（较高行权价）

**方向**：温和看跌或震荡

**最大收益**：净权利金

**最大亏损**：(行权价差 - 净权利金) × 100

### 7. Iron Condor（铁秃鹰）

**构成**：

- Sell OTM Put
- Buy 更 OTM 的 Put
- Sell OTM Call
- Buy 更 OTM 的 Call

**方向**：看震荡（预期股价在一定区间内）

**最大收益**：净权利金

**最大亏损**：(价差 - 净权利金) × 100

**适用场景**：

- 低波动环境
- 股价预期横盘
- IV Rank 高时卖出（赚 IV 回归）

**例子**：

- 当前价：$250
- Sell Put $230 + Buy Put $220（收 $2）
- Sell Call $270 + Buy Call $280（收 $2）
- 净收入：$4
- 最大收益：$400
- 盈利区间：$226-274

### 8. Butterfly Spread（蝶式价差）

**构成**：

- Buy 1 低行权价 Call
- Sell 2 中间行权价 Call
- Buy 1 高行权价 Call

**方向**：预期股价到期时精确在中间行权价

**最大收益**：(中间行权价 - 低行权价 - 净成本) × 100

**特点**：

- 成本低
- 盈利区间窄
- 类似「赌」股价到期在某个点

## 对冲策略

### 9. Protective Put（保护性看跌）

**构成**：

- 持有股票
- Buy Put（通常 OTM）

**目的**：对冲持股下跌风险

**成本**：Put 权利金

**适用场景**：

- 长期持股但担心短期波动（如财报前）
- 牛市但买「保险」

**例子**：

- 持有 TSLA 100 股，成本 $250
- 买入 $240 Put（权利金 $3）
- 无论 TSLA 跌多少，最大亏损锁定在 $13/股

### 10. Collar（领口策略）

**构成**：

- 持有股票
- Buy Put（保护）
- Sell Call（降低成本）

**目的**：零成本或低成本对冲

**特点**：

- 锁定收益区间
- 放弃上涨收益换取下跌保护

**例子**：

- 持有 TSLA $250
- Buy Put $240（付 $3）
- Sell Call $260（收 $3）
- 成本：$0
- 收益区间：$240-260

## 高级策略

### 11. Calendar Spread（日历价差）

**构成**：

- Sell 近月期权
- Buy 远月期权（相同行权价）

**目的**：

- 近月 Theta 衰减快，赚时间价值差
- 远月保护长期风险

**适用场景**：

- 预期短期横盘，长期不确定
- IV 偏低时建仓

### 12. Diagonal Spread（对角价差）

**构成**：

- Sell 近月 OTM 期权
- Buy 远月更 OTM 期权（行权价不同）

**方向**：温和看涨或看跌

**特点**：

- 比 Calendar Spread 更有方向性
- Theta 收益 + 方向收益

### 13. Ratio Spread（比例价差）

**构成**：

- Buy 1 期权
- Sell 2+ 更 OTM 的期权

**例子（Ratio Call Spread）**：

- Buy 1 Call $250
- Sell 2 Call $260

**风险**：

- 如果股价大涨超过 Sell Call 行权价，亏损增加（类似裸卖）

### 14. Straddle / Strangle（跨式组合）

**Straddle**：

- Buy Call + Buy Put（相同行权价，通常 ATM）

**Strangle**：

- Buy OTM Call + Buy OTM Put

**方向**：预期大幅波动（不确定方向）

**适用场景**：

- 财报前（预期大涨或大跌）
- 重大新闻前

**风险**：

- 如果波动小于预期 + IV Crush → 双重亏损

## 策略选择决策树

### 看涨

- **强烈看涨 + 愿意承担高风险**：Long Call
- **温和看涨 + 控制风险**：Bull Put Spread
- **持股 + 增强收益**：Covered Call

### 看跌

- **强烈看跌**：Long Put
- **温和看跌**：Bear Call Spread

### 看震荡

- **高 IV 环境**：Iron Condor / Sell Put + Sell Call
- **低 IV 环境**：Butterfly Spread

### 不确定方向但预期大波动

- **买入波动率**：Straddle / Strangle

### 对冲

- **持股 + 财报保护**：Protective Put
- **持股 + 零成本保护**：Collar

## 常见组合策略

### Wheel 策略（轮动策略）

**流程**：

1. Sell Put（收权利金）
2. 被行权 → 持有股票
3. Sell Covered Call（继续收权利金）
4. Call 被行权 → 卖出股票
5. 回到步骤 1

**特点**：

- 持续收取权利金
- 适合长期看好的标的
- 需要资金充足

### Poor Man's Covered Call

**构成**：

- Buy 长期深度 ITM Call（替代持股）
- Sell 短期 OTM Call

**优势**：

- 比 Covered Call 成本低
- 杠杆效应更强

**风险**：

- Long Call 仍有时间衰减

## 希腊字母与策略选择

| 策略 | Delta | Theta | Vega | Gamma |
|------|-------|-------|------|-------|
| Long Call | + | - | + | + |
| Long Put | - | - | + | + |
| Sell Put | + | + | - | - |
| Sell Call | - | + | - | - |
| Bull Put Spread | + | + | - | - |
| Iron Condor | ~0 | + | - | - |
| Calendar Spread | ~0 | + | + | ~ |

**选择原则**：

- 想赚 **Theta**（时间价值）→ Sell 策略
- 想赚 **方向**（Delta）→ Buy 或 Spread
- 想赚 **波动率**（Vega）→ Buy Straddle / Calendar Spread
- 避免 **Gamma 风险** → 远离 ATM，选深度 OTM

## 参考资源

- TastyTrade 策略指南
- CBOE 期权学院
- OptionAlpha 策略库
- The Options Playbook（Brian Overby）
