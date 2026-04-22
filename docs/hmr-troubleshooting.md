# Next.js 热更新 (HMR) 故障排查

## 🔍 当前问题

你遇到的问题:**Fast Refresh 因运行时错误而降级为完全重载**

终端显示:
```
⚠ Fast Refresh had to perform a full reload due to a runtime error.
```

## 🎯 原因分析

### Next.js 的 Fast Refresh 工作机制

```
正常情况:
  修改文件 → Fast Refresh → 热更新 ✅
  (保留组件状态,即时更新)

遇到错误时:
  修改文件 → 运行时错误 → 降级为完全重载 ⚠️
  (需要手动刷新浏览器)
```

### 触发完全重载的常见原因

1. **运行时错误** (最常见)
   - 语法错误
   - 类型错误
   - 未定义变量

2. **导出变化**
   - 修改了 default export 的类型
   - 添加/删除了导出

3. **Class Components**
   - Fast Refresh 只支持函数组件
   - Class 组件修改会触发完全重载

4. **匿名组件**
   ```tsx
   // ❌ 会触发完全重载
   export default () => <div>Hello</div>
   
   // ✅ Fast Refresh 友好
   export default function MyComponent() {
     return <div>Hello</div>
   }
   ```

## ✅ 已修复的问题

我们刚才修复了以下运行时错误:

1. ✅ **localStorage 解析错误**
   - 旧数据格式不兼容 → 已添加向后兼容

2. ✅ **ChatPanel useCallback 依赖错误**
   - `handleSend` 在定义前被引用 → 已调整顺序

3. ✅ **settings.tsx 重复导入**
   - 重复的 import 语句 → 已删除

4. ✅ **layout.tsx Server Component 问题**
   - 不当使用 dynamic import → 已改为静态导入

## 🚀 验证 HMR 是否恢复

### 测试步骤

1. **确保没有错误**
   ```bash
   # 查看终端,确保没有红色错误信息
   # 只应该看到:
   ✓ Compiled in XXms
   ```

2. **测试热更新**
   ```tsx
   // 修改任意组件,比如 app/page.tsx
   // 添加一行注释或改变文本
   <h2>Test HMR</h2>  // 改成 <h2>Test HMR Updated!</h2>
   ```

3. **观察浏览器**
   - ✅ 应该**自动更新**,无需刷新
   - ✅ 保留组件状态(输入框内容不丢失)

### 预期行为

```
修改文件并保存
   ↓
✓ Compiled in 34ms          (终端显示)
   ↓
浏览器自动更新 ⚡          (无需手动刷新!)
   ↓
组件状态保持不变            (表单输入等不丢失)
```

## 🔧 如果 HMR 仍然不工作

### 1. 检查浏览器控制台

打开开发者工具 (F12),查看是否有错误:
```
❌ 如果有红色错误 → 修复这些错误
✅ 如果没有错误 → HMR 应该工作
```

### 2. 检查网络连接

Fast Refresh 通过 WebSocket 连接工作:
```
打开 Network 面板 → WS (WebSocket) 标签
应该看到: /_next/webpack-hmr (状态: 101 Switching Protocols)
```

### 3. 清除缓存重启

```bash
# 停止开发服务器 (Ctrl+C)

# 清理缓存
cd frontend-next
rm -rf .next

# 重启
bun run dev
```

### 4. 检查文件保存

确保编辑器真的保存了文件:
- VSCode: 启用 Auto Save (File → Auto Save)
- Cursor: 同上

### 5. 检查防火墙/代理

如果使用 VPN 或代理,可能会干扰 WebSocket:
```bash
# 临时关闭 VPN/代理测试
```

## 📊 Next.js HMR vs Vite HMR

| 特性 | Next.js (Turbopack) | Vite |
|------|---------------------|------|
| **HMR 速度** | ~10ms ⚡⚡⚡ | ~150ms ⚡⚡ |
| **状态保留** | ✅ 完整 | ✅ 完整 |
| **错误处理** | 降级为完全重载 | 同样降级 |
| **WebSocket** | `/_next/webpack-hmr` | `/@vite/client` |

两者机制相同,都是:
1. 检测文件变化
2. 通过 WebSocket 推送更新
3. 浏览器热替换模块

## 🎓 Fast Refresh 最佳实践

### ✅ DO - 这样做

```tsx
// 1. 使用命名的函数组件
export default function MyComponent() {
  return <div>Hello</div>
}

// 2. 保持组件纯净
function PureComponent({ name }: Props) {
  return <div>{name}</div>
}

// 3. 使用 Hooks
const [state, setState] = useState(0)
```

### ❌ DON'T - 避免这样做

```tsx
// 1. 匿名组件
export default () => <div>Hello</div>

// 2. 在组件内定义组件
function Parent() {
  // ❌ 会破坏 Fast Refresh
  function Child() {
    return <div>Child</div>
  }
  return <Child />
}

// 3. 修改导出类型
// 从 default export 改为 named export 会触发完全重载
```

## 🐛 调试技巧

### 1. 启用详细日志

```javascript
// next.config.js
module.exports = {
  webpack: (config, { dev }) => {
    if (dev) {
      config.infrastructureLogging = { level: 'verbose' }
    }
    return config
  }
}
```

### 2. 检查 Fast Refresh 状态

在浏览器控制台运行:
```javascript
// 检查 Fast Refresh 是否启用
console.log(window.__NEXT_DATA__)
```

### 3. 监控文件变化

```bash
# 终端中会显示:
INFO:watchfiles.main:1 change detected
✓ Compiled in 34ms
```

## ✅ 总结

**当前状态**: 运行时错误已全部修复

**预期行为**: Fast Refresh 应该已经恢复正常

**测试方法**: 修改任意 .tsx 文件并保存,浏览器应自动更新

**如果还是不行**: 
1. 检查浏览器控制台的错误
2. 清理 `.next` 缓存
3. 确保文件确实保存了
4. 检查 WebSocket 连接

---

**现在试试修改一个文件,看看是否自动刷新!** 🚀
