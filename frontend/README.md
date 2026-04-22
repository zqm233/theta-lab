# ThetaLab Frontend

期权智能投研助手前端，基于 Next.js 15 + Tailwind CSS。

## 快速开始

```bash
# 安装依赖
bun install

# 开发模式（默认端口 5173）
bun run dev

# 构建
bun run build

# 生产模式
bun start
```

## 技术栈

- Next.js 15 (App Router)
- React 19
- Tailwind CSS
- TypeScript
- Framer Motion
- shadcn/ui

## 目录结构

```
app/                  # 页面路由
├── layout.tsx       # 根布局
├── page.tsx         # 主页
├── dual-invest/     # 双币投资
├── accounts/        # 账户管理
└── settings/        # 设置

components/          # UI 组件
├── ui/              # shadcn/ui 基础组件
├── layout/          # 布局组件
└── aceternity/      # 特效组件

lib/                 # 工具库
├── utils.ts         # 工具函数
└── i18n.tsx         # 国际化

hooks/               # 自定义 Hooks
```

## 添加 UI 组件

使用 shadcn/ui CLI 添加组件：

```bash
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add table
```

## API 配置

开发环境自动代理 `/api/*` 到后端服务器（端口 8000）。

生产环境配置 `.env.local`：

```
API_BASE_URL=http://localhost:8000
```
