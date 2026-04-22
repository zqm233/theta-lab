# RAG 系统架构与降级策略

## 概述

ThetaLab 的 RAG（Retrieval-Augmented Generation）系统实现了三层降级策略，确保即使在 Embedding 服务不可用时系统仍能提供知识检索功能。

## 三层降级架构

### Level 1: RAG 向量检索（最优）

**工作原理**：
1. 用户查询 → Embedding 模型 → 查询向量
2. 在向量数据库中搜索相似向量
3. 返回最相关的知识片段

**优势**：
- ✅ 语义理解最准确
- ✅ 可以匹配同义词和相关概念
- ✅ 检索结果最相关

**依赖**：
- Embedding 模型可用（Google `text-embedding-004` 或 OpenAI `text-embedding-3-small`）
- 向量数据库可用（Chroma）
- 知识库已入库

**示例**：
```
查询: "卖出看跌期权的风险是什么？"
匹配: "Sell Put 最大亏损..." (语义相似)
```

### Level 2: 关键词匹配（降级）

**工作原理**：
1. 从查询中提取关键词
2. 匹配预定义的关键词到文档映射
3. 直接读取对应 Markdown 文件

**优势**：
- ✅ 完全离线，无需外部服务
- ✅ 响应快速
- ✅ 零成本

**劣势**：
- ❌ 只能精确匹配关键词
- ❌ 无法理解同义词
- ❌ 返回整篇文档（可能冗长）

**关键词映射**（`backend/rag/fallback.py`）：

```python
# Options 域
{
    ("sell put", "卖出看跌", "short put"): "sell_put_strategy.md",
    ("iv", "implied volatility", "波动率"): "volatility_analysis.md",
    ("greeks", "delta", "theta"): "greeks_guide.md",
    # ...
}

# Crypto 域
{
    ("dcd", "双币", "dual investment"): "dcd_complete_guide.md",
    ("market", "分析", "技术面"): "market_analysis_framework.md",
}
```

**示例**：
```
查询: "双币赢高卖的风险"
关键词: "双币", "高卖"
匹配: dcd_complete_guide.md
```

### Level 3: 静态提示（兜底）

**工作原理**：
- 返回预定义的核心知识摘要
- 提示用户使用实时数据工具

**优势**：
- ✅ 100% 可用
- ✅ 不依赖任何外部服务

**劣势**：
- ❌ 信息量最少
- ❌ 不能满足详细查询

**示例静态消息**：
```
知识库暂时不可用。请参考以下核心要点：

**Sell Put 基础**：
- 收益：权利金（Premium）
- 风险：(行权价 - 权利金) × 100
- 关键指标：安全垫、ROIC、Delta

请使用实时数据工具进行具体分析。
```

## 降级流程图

```
用户查询
    ↓
[Level 1: RAG]
    ↓ 成功？
    ├─ Yes → 返回向量检索结果（最优）
    └─ No  → 记录失败，尝试 Level 2
          ↓
    [Level 2: 关键词匹配]
          ↓ 成功？
          ├─ Yes → 返回匹配文档（降级）
          └─ No  → 记录失败，尝试 Level 3
                ↓
          [Level 3: 静态提示]
                ↓
          返回静态知识（兜底）
```

## 健康监控

### 监控指标

系统自动跟踪以下指标：

- `rag_success_rate`：RAG 成功率
- `fallback_rate`：降级使用率
- `failure_rate`：完全失败率
- `consecutive_failures`：连续失败次数
- `is_degraded`：系统降级状态

### 告警阈值

当 `consecutive_failures >= 5` 时：
- 标记系统为 `degraded` 状态
- 记录告警日志
- （TODO）发送运维告警

### 查询健康状态

通过 API 查询：

```bash
GET /api/health/rag

# 响应示例
{
  "is_healthy": true,
  "total_attempts": 10,
  "rag_success_rate": 0.7,
  "fallback_rate": 0.3,
  "failure_rate": 0.0,
  "consecutive_failures": 0,
  "last_success_time": "2026-04-13T23:47:31",
  "recent_failures": []
}
```

## 工具使用

### 代码示例

```python
from backend.rag.tools_rag import search_options_knowledge

# Agent 调用（自动降级）
result = search_options_knowledge.invoke({
    "query": "什么是 IV Crush？"
})

# 结果格式：
# - 如果 RAG 成功：📚 Retrieved options knowledge (RAG): ...
# - 如果关键词匹配：📄 Retrieved options knowledge (Keyword Match): ...
# - 如果完全失败：⚠️ Knowledge base temporarily unavailable: ...
```

### Agent 集成

RAG 工具已集成到以下 Agent：

- **Options Agent**：`search_options_knowledge`
- **Crypto Market Agent**：`search_crypto_knowledge`
- **General Agent**：`search_general_knowledge`

## Prompt 知识嵌入

### 核心原则

Prompt 中嵌入的知识应遵循：

- **20% 核心知识**：必备概念、公式、关键指标
- **简洁**：每个概念 2-3 句话
- **可操作**：提供明确的决策指引

### 示例（当前 `prompts.py`）

```python
OPTIONS_PROMPT = _BASE_PROMPT + """
## 核心能力（美股期权）
你专注于 Sell Put 和 Sell Call 策略，帮助交易者通过 Theta 时间衰减稳健收取权利金。

### 基础分析工具
1. 查询任意美股标的的实时价格和期权链数据
2. 运行 Sell Put / Sell Call 分析（安全垫、ROIC、Greeks、年化收益率）
3. 波动率分析（IV Rank、IV Percentile、HV、IV-HV Spread）
4. 财报日期与 IV Crush 风险评估

（可选）需要详细知识时，调用 search_options_knowledge() 工具。
"""
```

## 最佳实践

### 1. 知识分层

| 层级 | 内容 | 存储位置 | 更新频率 |
|------|------|---------|---------|
| **必备知识** | 核心概念、公式 | Prompt | 很少 |
| **详细知识** | 策略指南、案例 | RAG 文档 | 经常 |
| **实时数据** | 价格、市场数据 | API 工具 | 实时 |

### 2. 降级策略选择

| 场景 | 推荐策略 |
|------|---------|
| 生产环境 | 三层降级（本方案） |
| 演示/POC | 只用 Prompt（零依赖） |
| 高可用要求 | RAG + 关键词匹配 |

### 3. 监控和维护

**日常检查**：
```bash
# 查看 RAG 健康状态
curl http://localhost:8000/api/health/rag

# 查看日志
tail -f logs/backend.log | grep -E "(RAG|Fallback)"
```

**告警响应**：
1. 检查 Embedding 服务状态（Google/OpenAI API）
2. 检查向量数据库（Chroma 文件完整性）
3. 验证网络连接
4. 查看近期失败原因：`recent_failures`

## 入库操作

### 初次入库

```bash
# 设置环境变量
export GOOGLE_API_KEY=xxx  # 或 OPENAI_API_KEY
export RAG_EMBEDDING_PROVIDER=google  # 或 openai
export RAG_VECTOR_DB=chroma

# 运行入库脚本
.venv/bin/python scripts/build_rag_index.py
```

### 增量更新

1. 在 `data/rag/knowledge/{domain}/` 添加新的 `.md` 文件
2. 重新运行入库脚本（会自动合并）
3. 更新 `backend/rag/fallback.py` 中的关键词映射

## 故障排查

### RAG 完全不可用

**症状**：所有查询都降级到 Level 2 或 Level 3

**原因**：
- Embedding API Key 无效或过期
- 向量数据库未初始化
- 网络问题

**解决**：
1. 验证 API Key：`echo $GOOGLE_API_KEY`
2. 检查向量数据库：`ls -la data/rag/chroma/`
3. 重新入库：`python scripts/build_rag_index.py`

### 关键词匹配失效

**症状**：降级到 Level 3 静态提示

**原因**：
- 关键词映射未覆盖查询
- Markdown 文件缺失

**解决**：
1. 检查文件：`ls data/rag/knowledge/{domain}/`
2. 更新关键词映射：编辑 `backend/rag/fallback.py`

### 健康状态异常

**症状**：`is_degraded: true`

**原因**：连续失败 ≥ 5 次

**解决**：
1. 查看 `recent_failures` 了解失败原因
2. 修复根本问题后，重启服务（自动重置计数器）

## 未来改进

### 短期

- [ ] 实现运维告警通知（邮件/Slack）
- [ ] 添加 Prometheus metrics 导出
- [ ] 优化关键词匹配算法（模糊匹配）

### 长期

- [ ] 支持多向量数据库（pgvector 生产环境）
- [ ] 实现 Embedding 缓存（减少 API 调用）
- [ ] 添加知识库版本管理
- [ ] A/B 测试不同 Embedding 模型
