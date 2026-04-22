# React Query 缓存策略

## Overview

本文档说明 ThetaLab 前端应用的数据缓存策略，旨在减少不必要的 API 请求，同时确保数据的时效性。

## 缓存策略原则

### 核心原则：区分 API 类型

1. **外部 API（需要长缓存）**
   - 后端需要调用第三方服务（Yahoo Finance、FlashAlpha、OKX/Binance）
   - 响应较慢（200ms - 2s）
   - 数据变化相对缓慢
   - **策略**: 60秒缓存，无自动刷新

2. **本地数据库 API（短缓存或无缓存）**
   - 直接从本地 SQLite 读取
   - 响应很快（< 50ms）
   - **策略**: 5秒缓存，快速过期

3. **实时计算 API（中等缓存）**
   - 虽然调用外部 API，但需要一定实时性（如持仓盈亏）
   - **策略**: 30秒缓存

### 移除所有 `refetchInterval`

- ❌ **不使用自动后台轮询**
- ✅ **依赖 `staleTime` 管理缓存过期**
- ✅ **用户通过刷新按钮手动更新**
- ✅ **页面切换时使用缓存数据（零加载）**

## API 分类与缓存配置

### 类别 1: 外部市场数据 API（60秒缓存）

这些 API 调用第三方服务，响应较慢，数据变化相对缓慢：

| API | 说明 | staleTime | 第三方服务 | 文件 |
|-----|------|-----------|-----------|------|
| `/prices?tickers=...` | 批量股票现货价格 | 60s | Yahoo Finance | `lib/price.tsx` |
| `/options-chain/:ticker` | 期权链数据 | 60s | Yahoo Finance | `lib/hooks/useOptionsChain.ts` |
| `/quote?ticker=...` | 单个股票报价 | 60s | Yahoo Finance | `app/dual-invest/page.tsx` |
| `/dual-invest/products` | 双币产品列表 | 60s | OKX/Binance | `app/dual-invest/page.tsx` |

**实现示例**:
```typescript
// frontend/lib/price.tsx
useQuery({
  queryKey: ["price", ticker],
  queryFn: async () => { /* ... */ },
  staleTime: 60000, // 60s - 外部API,响应慢
  retry: 1,
});
```

### 类别 2: 配置/状态 API（5分钟缓存）

不频繁变化的配置数据：

| API | 说明 | staleTime | 类型 | 文件 |
|-----|------|-----------|------|------|
| `/flashalpha/quota` | FlashAlpha API 配额 | 300s (5分钟) | 外部 API | `components/OptionsChain.tsx` |
| `/dual-invest/status` | 交易所配置状态 | 300s (5分钟) | 配置检查 | `app/dual-invest/page.tsx` |

**实现示例**:
```typescript
// frontend/components/OptionsChain.tsx
useApiQuery<FaQuota>(
  ["flashalpha-quota"],
  "/flashalpha/quota",
  {
    staleTime: 300000, // 5分钟 - 配额变化很慢
    retry: 0, // quota失败不重试
  }
);
```

### 类别 3: 实时计算 API（30秒缓存）

需要一定实时性的计算数据：

| API | 说明 | staleTime | 原因 | 文件 |
|-----|------|-----------|------|------|
| `/portfolio/quotes` | 持仓盈亏计算 | 30s | 需要较实时的期权价格 | `components/Portfolio.tsx` |

**实现示例**:
```typescript
// frontend/components/Portfolio.tsx
useQuery({
  queryKey: ["portfolio-quotes", positionIds],
  queryFn: async () => { /* POST request */ },
  staleTime: 30000, // 30s - P&L需要一定实时性
  retry: 1,
});
```

### 类别 4: 本地数据库 API（5秒缓存）

从本地 SQLite 快速读取：

| API | 说明 | staleTime | 数据源 | 文件 |
|-----|------|-----------|--------|------|
| `/trades/history` | 交易历史 | 5s | 本地数据库 | `components/TradeHistory.tsx` |
| `/accounts/summary` | 账户汇总 | 5s | 本地数据库 | `app/accounts/page.tsx` |
| `/dual-invest/orders` | 双币订单 | 60s | 可能是缓存的外部数据 | `app/dual-invest/page.tsx` |

**实现示例**:
```typescript
// frontend/app/accounts/page.tsx
useApiQuery<{ accounts: AccountSummary[] }>(
  ["accounts-summary"],
  "/accounts/summary",
  {
    staleTime: 5000, // 5s - 本地数据库响应快
  }
);
```

## 全局配置

```typescript
// lib/react-query.tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60000,            // 默认 60s 缓存
      gcTime: 600000,              // 10分钟垃圾回收
      refetchOnWindowFocus: false, // 不在窗口聚焦时刷新
      refetchOnMount: false,       // 不在组件挂载时刷新
      refetchOnReconnect: false,   // 不在重连时刷新
      networkMode: "offlineFirst", // 优先返回缓存
      retry: 1,
    },
  },
});
```

## 修改的文件

### 核心库

1. **`frontend/lib/price.tsx`**
   - 移除旧的 `PriceProvider` + `setInterval` 轮询
   - 添加纯 React Query 实现
   - 添加 `usePrices(tickers)` 支持批量获取
   - `staleTime: 60000` (60s)
   - ❌ 移除 `refetchInterval`

2. **`frontend/lib/hooks/useOptionsChain.ts`**
   - ❌ 移除 `refetchInterval: 60000`
   - ❌ 移除导致重复请求的 `useEffect`
   - `staleTime: 60000` (60s)

### 组件

3. **`frontend/components/Portfolio.tsx`**
   - ❌ 移除 `refetchInterval: 30000`
   - 调整 `staleTime: 30000` (30s，持仓需要一定实时性)
   - 保留手动刷新功能

4. **`frontend/components/OptionsChain.tsx`**
   - 将 `faQuota` 从 `useState` + `fetchApi` 迁移到 React Query
   - `staleTime: 300000` (5分钟)
   - 修复 `refreshFaQuota` 为使用 `queryClient.invalidateQueries`

5. **`frontend/components/layout/Watchlist.tsx`**
   - 使用 lazy initialization 从 localStorage 读取初始值
   - 避免先用默认值再更新导致的重复请求
   - 使用 `usePrices(tickers)` 批量获取

### 页面

6. **`frontend/app/dual-invest/page.tsx`**
   - ❌ 移除 3 个 `refetchInterval` (products, orders, spot)
   - 将 `status` 从 `fetch` + `useEffect` 迁移到 React Query
   - `status` staleTime: 300000 (5分钟)
   - 其他 staleTime: 60000 (60s)

7. **`frontend/app/accounts/page.tsx`**
   - ❌ 移除 `refetchInterval: 30000`
   - 调整 `staleTime: 5000` (5s，本地数据库)

8. **`frontend/app/layout.tsx`**
   - 移除 `PriceProvider` 导入和包裹层

9. **`frontend/components/TradeHistory.tsx`**
   - 迁移到 `useApiQuery`
   - `staleTime: 300000` (5分钟，历史数据变化慢)

## 预期效果

### 修改前

```
用户操作: 访问期权页面 → 切换走 → 切换回 (5秒后)
请求情况:
  t=0:   prices (首次)
  t=5:   [切换走]
  t=10:  prices (refetchInterval 触发) ← 后台仍在请求
  t=5:   [切换回]
  t=10:  prices (看到新请求) ← 问题!
```

### 修改后（< 60秒）

```
用户操作: 访问期权页面 → 切换走 → 切换回 (5秒后)
请求情况:
  t=0:   prices, quota, options-chain (首次)
  t=5:   [切换走]
  t=5:   [切换回]
         ✅ 无请求! (缓存未过期,直接返回)
         ✅ 页面瞬间显示
```

### 修改后（> 60秒）

```
用户操作: 访问期权页面 → 切换走 → 切换回 (70秒后)
请求情况:
  t=0:    prices (首次)
  t=10:   [切换走]
  t=80:   [切换回]
          ⚠️  缓存已过期 (staleTime=60s)
          ✅ 但仍先显示旧缓存
          ✅ 然后后台静默刷新
          ✅ 无 loading 状态
```

## 手动刷新

所有页面都保留了手动刷新功能：

### 方案 A: 使用 refetch

```typescript
const { refetch } = useOptionsChain(ticker, userSelectedExpiration);

<button onClick={() => refetch()}>刷新</button>
```

### 方案 B: 使用 queryClient

```typescript
import { useQueryClient } from "@tanstack/react-query";

const queryClient = useQueryClient();

<button onClick={() => {
  queryClient.invalidateQueries({ queryKey: ["price"] });
  queryClient.invalidateQueries({ queryKey: ["options-chain"] });
}}>刷新全部</button>
```

## 测试验证

### 测试 1: 快速切换 (< 60s)

1. 清空 Network 面板
2. 访问期权页面
3. 等待加载完成
4. **立即**切换到双币投资
5. **立即**切换回期权页面

**预期**: 没有新的外部 API 请求 (`prices`, `quota`, `options-chain`)

### 测试 2: 长时间后切换 (> 60s)

1. 清空 Network 面板
2. 访问期权页面
3. 等待加载完成
4. 切换走,等待 **70秒**
5. 切换回期权页面

**预期**:
- 页面瞬间显示 (缓存数据)
- Network 面板显示后台请求 (刷新过期数据)
- 没有 loading 状态

### 测试 3: 手动刷新

1. 访问期权页面
2. 点击刷新按钮

**预期**: 触发新请求,数据更新

## 成功标准

1. ✅ 60秒内切换页面: **0个外部API新请求**
2. ✅ 页面切换响应: **< 50ms**
3. ✅ 60秒后切换: 先显示缓存,后台刷新
4. ✅ 手动刷新: 正常工作
5. ✅ 本地数据库 API: 可以有少量请求（响应快）

## Trade-offs

### 优点
- ✅ 零冗余的外部 API 请求
- ✅ 更快的页面切换
- ✅ 降低后端负载
- ✅ 更好的用户体验
- ✅ 根据 API 类型优化缓存时间

### 缺点
- ⚠️  外部数据可能有最多 60 秒的延迟
- ⚠️  用户需要手动刷新获取最新数据

### 缓解措施
- 为关键实时数据（持仓盈亏）使用较短的 30 秒缓存
- 所有页面都有明显的手动刷新按钮
- 本地数据库使用短缓存（5秒），几乎实时

## 未来优化

如果需要自动更新：

### 选项 1: Window Focus Refresh
```typescript
useQuery({
  refetchOnWindowFocus: true,  // 只在切回标签页时刷新
  refetchInterval: false,
})
```

### 选项 2: Visible-Only Polling
```typescript
useQuery({
  refetchInterval: 30000,
  refetchIntervalInBackground: false, // 只在页面可见时轮询
})
```

### 选项 3: WebSocket (推荐)
- 对真正需要实时的数据（如持仓盈亏）使用 WebSocket
- 后端只在数据变化时推送更新
- 无需轮询
