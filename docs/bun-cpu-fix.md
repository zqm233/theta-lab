# Bun CPU 占用高问题修复总结

## 问题诊断

### 1. 后端无限重载
```
INFO:watchfiles.main:7 changes detected  # 反复触发
```
**原因**: uvicorn 监听了数据库文件变化

### 2. 前端缓存过大
```bash
.next/  # 1.1GB!
.next/standalone/AI/thetalab/frontend-next/.next/  # 嵌套构建
```
**原因**: standalone 输出被监听,触发重新构建

## 已修复

### 1. ✅ 后端 watchfiles 排除
`backend/app.py`:
```python
uvicorn.run(
    reload_excludes=[
        "data/rag/**",
        "data/*.db*",
        "**/__pycache__/**",
        "**/.pytest_cache/**",
    ],
)
```

### 2. ✅ 前端 Turbopack 排除
`frontend/next.config.js`:
```javascript
experimental: {
  turbopack: {
    watchOptions: {
      ignoredPaths: [
        "**/.next/**",
        "**/node_modules/**",
        "**/.cursor/**",
        "**/.turbo/**",
        "**/*.log",
        "**/standalone/**", // 关键!
      ],
    },
  },
},
```

### 3. ✅ .gitignore 更新
```
# 前端
.next
.turbo
.cursor/

# 后端
data/rag/chroma/
data/rag/*.sqlite3
```

### 4. ✅ 清理缓存
```bash
make clean  # 已执行
```

## 验证

重新启动后应该看到:
- ✅ CPU 占用正常 (<10%)
- ✅ 没有无限的 "changes detected"
- ✅ 热重载正常工作

## 性能提示

如果还是慢,可以:
1. **禁用 Turbopack** (改用 Webpack):
   ```json
   "dev": "bun --bun next dev -p 5173"
   // 改为
   "dev": "NODE_OPTIONS='--max-old-space-size=4096' bun --bun next dev -p 5173"
   ```

2. **限制监听目录** (只监听 `app/` 和 `lib/`):
   ```javascript
   watchOptions: {
     paths: ['app/**', 'lib/**', 'components/**'],
   }
   ```

3. **使用 SWC 而非 Babel** (已默认启用)
