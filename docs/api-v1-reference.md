# API v1 快速参考

## 基础URL
```
http://localhost:8000/api/v1
```

## Chat & Agent

### 发送消息
```http
POST /threads/:thread_id/messages
Content-Type: application/json

{
  "message": "TSLA Sell Put分析",
  "user_id": "default"  // 可选
}
```

### HITL确认
```http
POST /threads/:thread_id/confirmations
Content-Type: application/json

{
  "approved": true,
  "user_id": "default"
}
```

### 消息历史
```http
GET /threads/:thread_id/messages
```

### 用户档案
```http
GET /users/:user_id/profile
DELETE /users/:user_id/profile  # 重置
```

## Portfolio & Trades

### 账户管理
```http
GET /accounts                    # 列出所有账户
GET /accounts?view=summary       # 汇总视图(含盈亏)
POST /accounts                   # 创建账户
PUT /accounts/:id                # 更新账户
DELETE /accounts/:id             # 删除账户
```

### 持仓管理
```http
GET /accounts/:account_id/holdings      # 账户持仓
POST /accounts/:account_id/holdings     # 创建持仓
GET /holdings/:id                       # 单个持仓
PUT /holdings/:id                       # 更新持仓
PUT /holdings/:id/close                 # 平仓(状态变更)
DELETE /holdings/:id                    # 删除持仓
```

### 交易历史
```http
GET /trades                      # 所有已平仓交易
DELETE /trades/:id               # 删除交易记录
```

### 期权报价
```http
POST /options/quotes
Content-Type: application/json

[
  {
    "id": "pos-1",
    "ticker": "TSLA",
    "type": "put",
    "strike": 300,
    "expiration": "2026-05-15"
  }
]
```

### 快照
```http
POST /portfolio/snapshots         # 记录今日快照
GET /portfolio/snapshots?days=90  # 历史快照
```

## Options & Market Data

### Ticker资源
```http
GET /tickers/:ticker/price                    # 当前价格
GET /tickers/:ticker/quote?market=us_stock    # 跨市场报价
GET /tickers/:ticker/expirations              # 期权到期日
GET /tickers/:ticker/options-chains           # 期权链
GET /tickers/:ticker/options-chains?expiration=2026-05-15
GET /tickers/:ticker/volatility               # 波动率分析
GET /tickers/:ticker/sell-put-analysis?strike=300&expiration=2026-05-15
GET /tickers/:ticker/theta-comparison?strike=300
GET /tickers/:ticker/earnings                 # 财报日期
```

### 批量/工具
```http
GET /tickers/prices?tickers=TSLA,TSLL         # 批量价格
GET /market/status                            # 市场状态
GET /securities?q=tesla&market=us_stock       # 证券搜索
GET /exchange-rates/usd-cny                   # 汇率
```

## 关键变化

| 场景 | Legacy | v1 RESTful |
|------|--------|------------|
| 平仓 | `POST /trades/close` | `PUT /holdings/:id/close` |
| 账户持仓 | `GET /holdings?account_id=X` | `GET /accounts/:id/holdings` |
| 重置档案 | `POST /profile/reset` | `DELETE /users/:id/profile` |
| 发送消息 | `POST /chat` | `POST /threads/:id/messages` |
| 单ticker报价 | `GET /quote?ticker=X` | `GET /tickers/:ticker/quote` |
| 账户汇总 | `GET /accounts/summary` | `GET /accounts?view=summary` |

## HTTP 方法语义

- **GET** - 获取资源(幂等)
- **POST** - 创建资源
- **PUT** - 更新资源/状态变更(幂等)
- **DELETE** - 删除资源(幂等)

## 响应格式

所有响应均为JSON格式:

```json
{
  "data": {...},
  "meta": {...}
}
```

错误响应:
```json
{
  "detail": "Error message"
}
```
