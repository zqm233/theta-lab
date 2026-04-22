# RESTful API 重构计划

## 当前问题总结

1. **动作性URL** - 使用了大量动作词(confirm, reset, close)而非资源名词
2. **HTTP方法误用** - 某些操作应该用DELETE而用了POST
3. **资源层级混乱** - ticker相关的端点应该统一在 `/tickers/{ticker}` 下
4. **查询参数滥用** - ticker应该在路径中而非查询参数

## 重构方案

### Chat & Agent (相对合理,轻微调整)

| 当前 | RESTful | 方法 | 说明 |
|------|---------|------|------|
| `POST /chat` | `POST /threads/:thread_id/messages` | POST | 发送消息 |
| `POST /chat/confirm` | `POST /threads/:thread_id/confirmations` | POST | HITL确认(业务逻辑特殊,保留) |
| `GET /chat/history/:thread_id` | `GET /threads/:thread_id/messages` | GET | 获取历史 |
| `GET /profile?user_id=x` | `GET /users/:user_id/profile` | GET | 获取用户档案 |
| `POST /profile/reset` | `DELETE /users/:user_id/profile` | DELETE | 重置档案 |

### Options & Market Data (需要大改)

| 当前 | RESTful | 方法 | 说明 |
|------|---------|------|------|
| `GET /price/:ticker` | `GET /tickers/:ticker/price` | GET | ✅ 已经合理 |
| `GET /prices?tickers=A,B` | `GET /tickers/prices?tickers=A,B` | GET | 批量查询 |
| `GET /market-status` | `GET /market/status` | GET | ✅ 已经合理 |
| `GET /options-chain/:ticker` | `GET /tickers/:ticker/options-chains` | GET | 期权链列表 |
| `GET /options-chain/:ticker?exp=X` | `GET /tickers/:ticker/options-chains/:expiration` | GET | 特定到期日 |
| `GET /expirations/:ticker` | `GET /tickers/:ticker/expirations` | GET | ✅ 已经合理 |
| `GET /volatility/:ticker` | `GET /tickers/:ticker/volatility` | GET | ✅ 路径合理 |
| `GET /sell-put-analysis/:ticker` | `GET /tickers/:ticker/sell-put-analysis` | GET | ✅ 路径合理 |
| `GET /theta-comparison/:ticker` | `GET /tickers/:ticker/theta-comparison` | GET | ✅ 路径合理 |
| `GET /earnings/:ticker` | `GET /tickers/:ticker/earnings` | GET | ✅ 路径合理 |
| `GET /quote?ticker=X` | `GET /tickers/:ticker/quote` | GET | ticker应在路径 |
| `GET /securities/search?q=X` | `GET /securities?q=X` | GET | ✅ 已经合理 |
| `GET /exchange-rate` | `GET /exchange-rates/usd-cny` | GET | 明确货币对 |

### Portfolio (需要大改)

| 当前 | RESTful | 方法 | 说明 |
|------|---------|------|------|
| `GET /accounts` | `GET /accounts` | GET | ✅ 已经合理 |
| `POST /accounts` | `POST /accounts` | POST | ✅ 已经合理 |
| `PUT /accounts/:id` | `PUT /accounts/:id` | PUT | ✅ 已经合理 |
| `DELETE /accounts/:id` | `DELETE /accounts/:id` | DELETE | ✅ 已经合理 |
| `GET /accounts/summary` | `GET /accounts?view=summary` | GET | 用查询参数表示视图 |
| `GET /holdings?account_id=X` | `GET /accounts/:account_id/holdings` | GET | 嵌套资源 |
| `POST /holdings` | `POST /accounts/:account_id/holdings` | POST | 创建时需要父资源 |
| `PUT /holdings/:id` | `PUT /holdings/:id` | PUT | ✅ 已经合理 |
| `DELETE /holdings/:id` | `DELETE /holdings/:id` | DELETE | ✅ 已经合理 |
| `POST /portfolio/quotes` | `POST /options/quotes` | POST | 批量查询可用POST |
| `POST /trades/close` | `PUT /holdings/:id/close` | PUT | 平仓是状态变更 |
| `GET /trades/history` | `GET /trades` | GET | 简化路径 |
| `DELETE /trades/:id` | `DELETE /trades/:id` | DELETE | ✅ 已经合理 |
| `POST /portfolio/snapshot` | `POST /portfolio/snapshots` | POST | 资源名复数 |
| `GET /portfolio/snapshots` | `GET /portfolio/snapshots` | GET | ✅ 已经合理 |

### Crypto (保持一致)

| 当前 | RESTful | 方法 |
|------|---------|------|
| `GET /crypto/...` | 按照上述模式重构 | - |

## 重构优先级

### P0 (破坏性大,影响前端)
- [ ] `POST /trades/close` → `PUT /holdings/:id/close`
- [ ] `GET /holdings?account_id=X` → `GET /accounts/:account_id/holdings`
- [ ] `POST /profile/reset` → `DELETE /users/:user_id/profile`

### P1 (路径调整,兼容性影响中等)
- [ ] `GET /quote?ticker=X` → `GET /tickers/:ticker/quote`
- [ ] `GET /accounts/summary` → `GET /accounts?view=summary`
- [ ] `POST /portfolio/snapshot` → `POST /portfolio/snapshots`

### P2 (优化,可逐步迁移)
- [ ] Chat 路由改为基于 threads 资源
- [ ] 统一 ticker 路由前缀

## 实施策略

### 1. 双版本兼容期
```python
router = APIRouter(prefix="/api/v1")  # 新版
router_legacy = APIRouter(prefix="/api")  # 旧版(deprecated)
```

### 2. 渐进式迁移
- 先实现 v1 版本
- 前端逐步切换到 v1
- 3个月后移除旧版本

### 3. 文档标记
在所有旧端点添加 deprecation warning:
```python
@router.post("/trades/close", deprecated=True)
async def close_trade_legacy(...):
    """⚠️ DEPRECATED: Use PUT /api/v1/holdings/:id/close instead"""
```

## 收益

✅ 符合REST原则,提升API可理解性
✅ 资源层级清晰,便于缓存和权限控制
✅ 前端开发者更容易理解和使用
✅ 利于未来扩展和版本管理
