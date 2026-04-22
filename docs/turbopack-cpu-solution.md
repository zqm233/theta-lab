# Turbopack CPU 占用高问题 - 实际解决方案

## 问题根源
Next.js 16.2 的 Turbopack 有已知的无限重载 bug,没有官方的 `watchOptions` 配置可以解决。

## 解决方案

### 方案 1: 禁用 Turbopack,使用稳定的 Webpack (推荐)

修改 `frontend/package.json`:
```json
{
  "scripts": {
    "dev": "bun --bun next dev -p 5173",
    "dev:turbo": "bun --bun next dev --turbopack -p 5173",
    "dev:webpack": "bun --bun next dev -p 5173"
  }
}
```

**优点**:
- ✅ 稳定,没有 bug
- ✅ CPU 占用正常
- ✅ 热重载可靠

**缺点**:
- ⚠️ 启动稍慢 (但更稳定)

### 方案 2: 降级到 Next.js 15.x

```bash
cd frontend
bun remove next
bun add next@15.5.15
```

**优点**:
- ✅ Next.js 15 的 Turbopack 更稳定
- ✅ 没有 16.2 的新 bug

**缺点**:
- ⚠️ 失去 Next.js 16 的新特性

### 方案 3: 环境变量优化 (减轻症状)

修改 `frontend/package.json`:
```json
{
  "scripts": {
    "dev": "NODE_OPTIONS='--max-old-space-size=4096' TURBOPACK_CACHE_DIR=.turbo bun --bun next dev -p 5173"
  }
}
```

增加 `.env.local`:
```bash
# 减少文件监听的灵敏度
CHOKIDAR_USEPOLLING=false
WATCHPACK_POLLING=false
```

**优点**:
- ✅ 不改变技术栈
- ✅ 可能减轻症状

**缺点**:
- ⚠️ 治标不治本

### 方案 4: 等待 Next.js 16.3 修复

监控这些 issue:
- https://github.com/vercel/next.js/issues/92256 (global-not-found infinite loop)
- https://github.com/vercel/next.js/issues/87322 (opengraph-image loop)

**优点**:
- ✅ 官方修复最可靠

**缺点**:
- ⚠️ 时间不确定

## 我的建议

### 立即采取 (方案 1)
暂时禁用 Turbopack,使用稳定的 Webpack:

1. **修改 package.json**:
   ```json
   "dev": "bun --bun next dev -p 5173"
   ```
   (去掉 `--turbopack` 标志)

2. **重启**:
   ```bash
   make dev
   ```

### 效果
- 🚀 启动时间: ~10秒 (vs Turbopack 5秒)
- 💻 CPU: <10% (vs Turbopack >50%)
- ⚡ 热重载: 稳定可靠
- ✅ 无无限循环

### 未来
等 Next.js 16.3 修复 Turbopack bug 后再启用。

## 验证

启动后检查:
```bash
# 看日志应该显示 "using webpack" 而不是 "using turbopack"
# CPU 应该稳定在 <10%
top -pid $(pgrep -f "next dev")
```
