# 零 Loading 修复验证指南

## 修复内容 (2026-04-18)

### 问题诊断

从用户的 Network 截图发现:
1. `prices?tickers=TSLL` 重复请求 4 次
2. `quota` 重复请求 4 次  
3. `TSLL` (options-chain) 重复请求 2 次

### 根本原因

1. **`useOptionsChain` 的 `useEffect` 问题**
   - 位置: `lib/hooks/useOptionsChain.ts` 第 47-49 行
   - 问题: `useEffect` 监听 `initialExpiration`,每次变化触发状态更新 → queryKey 变化 → 新请求
   
2. **`usePrice` 双重刷新系统**
   - 旧的 `PriceProvider` 定时器 (每 10s)
   - 新的 React Query `refetchInterval` (每 10s)
   - **两套系统同时运行,导致重复请求**

3. **`quota` API 没有缓存**
   - 每次组件挂载都重新请求

### 修复措施

#### 1. 修复 `useOptionsChain.ts`

```typescript
// ❌ 移除这个 useEffect
useEffect(() => {
  setEffectiveExpiration(initialExpiration);
}, [initialExpiration]);

// ✅ 直接使用初始值
const [effectiveExpiration, setEffectiveExpiration] = useState<string | null>(initialExpiration);
```

#### 2. 完全重写 `lib/price.tsx`

**之前** (复杂的双重系统):
- PriceProvider + 订阅模式
- 手动定时器刷新
- 加上 React Query

**之后** (简洁):
- 只使用 React Query
- 移除所有 Provider 逻辑
- 移除手动定时器

```typescript
export function usePrice(ticker: string): PriceData | undefined {
  const { data, isLoading } = useQuery({
    queryKey: ["price", ticker],
    queryFn: async () => { /* ... */ },
    staleTime: 15000,
    refetchInterval: 10000,
  });
  return data;
}
```

#### 3. 修复 `OptionsChain.tsx` quota 缓存

```typescript
// ❌ 之前
const [faQuota, setFaQuota] = useState(...);
useEffect(() => { refreshFaQuota(); }, [refreshFaQuota]);

// ✅ 之后
const { data: faQuota = {...} } = useQuery({
  queryKey: ["flashalpha-quota"],
  queryFn: () => fetchApi("/flashalpha/quota"),
  staleTime: 300000, // 5分钟
});
```

## 验证步骤

### 测试 1: 期权链页面切换

**操作**:
1. 清空 Network 面板
2. 访问首页 (期权链 - TSLL)
3. 等待加载完成
4. 切换到 "双币投资"
5. **立即**切换回 "期权链"

**预期结果**:
- ✅ `prices?tickers=TSLL`: 只有 **1 次**请求 (首次)
- ✅ `quota`: 只有 **1 次**请求 (首次)
- ✅ `TSLL` (options-chain): 只有 **1 次**请求 (首次)
- ✅ 步骤 5 **没有任何新请求**

### 测试 2: 等待 15 秒后切换

**操作**:
1. 清空 Network 面板
2. 访问首页 (期权链 - TSLL)
3. 等待加载完成
4. **等待 15 秒** (staleTime)
5. 切换到其他页面,再切换回来

**预期结果**:
- ✅ 步骤 5: `prices?tickers=TSLL` 会有 **1 次**请求 (数据过期,后台刷新)
- ✅ 但页面内容应该**瞬间显示** (先显示缓存数据)
- ✅ 没有 loading 状态

### 测试 3: 自动刷新 (停留在页面)

**操作**:
1. 清空 Network 面板
2. 停留在期权链页面
3. 观察 10 秒

**预期结果**:
- ✅ 10 秒后: `prices?tickers=TSLL` 自动请求 1 次 (refetchInterval)
- ✅ **没有视觉反馈** (后台刷新)
- ✅ 用户可以正常操作

### 测试 4: 快速来回切换

**操作**:
1. 清空 Network 面板
2. 快速切换: 期权链 → 双币投资 → 期权链 → 双币投资 → 期权链 (每个停留 < 2s)

**预期结果**:
- ✅ 每个页面只在**首次访问时**有请求
- ✅ 后续切换**完全没有请求**
- ✅ 页面切换瞬间响应

## React Query DevTools 验证

### 查看缓存状态

1. 打开页面右下角的 React Query 图标
2. 找到这些 queries:
   - `["price", "TSLL"]`
   - `["flashalpha-quota"]`
   - `["options-chain", "TSLL", "auto"]`

### 验证缓存行为

**首次访问**:
```
["price", "TSLL"]: fetching → fresh
```

**切换走再切换回 (< 15s)**:
```
["price", "TSLL"]: inactive → fresh (没有 fetching!)
```

**切换走再切换回 (> 15s)**:
```
["price", "TSLL"]: inactive → stale → fetching → fresh
```

## 成功标准

1. ✅ **单次请求**: 每个 API 在首次访问时只请求 1 次
2. ✅ **零 loading**: 60 秒内切换回页面,瞬间显示内容
3. ✅ **后台刷新**: 自动刷新时没有视觉反馈
4. ✅ **请求减少**: 相比优化前减少 70-90%

## 预期改进

| API | 优化前 (切换一次) | 优化后 (切换一次) | 节省 |
|-----|-----------------|-----------------|------|
| `prices?tickers=TSLL` | 4 次 | 0-1 次 | **75-100%** |
| `quota` | 4 次 | 0 次 | **100%** |
| `TSLL` | 2 次 | 0-1 次 | **50-100%** |

## 如果仍有问题

### 检查清单

1. **确认服务器已重启**: 旧的代码可能还在内存中
2. **清空浏览器缓存**: Cmd+Shift+R (macOS)
3. **检查 React Query 版本**: 确保是 5.99.0+
4. **查看 DevTools**: 确认 query 状态正确

### 调试方法

1. 打开 React Query DevTools
2. 观察每次操作后 query 的状态变化
3. 如果看到 `fetching`,说明触发了新请求
4. 检查 `queryKey` 是否意外变化

## 总结

本次修复彻底解决了:
- ❌ 双重刷新系统冲突
- ❌ useEffect 导致的意外请求
- ❌ 缺失的 API 缓存

现在所有数据请求统一由 React Query 管理,实现了真正的"零 loading"页面切换体验!
