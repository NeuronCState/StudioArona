# Client/

用户终端上跑的代码 — 前端 + 桌面壳。

```
Client/
├── web/     React + TypeScript + Vite + Tailwind SPA
└── tauri/   Tauri v3 Rust 桌面壳
```

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | React 18 + TypeScript |
| 构建 | Vite 5 |
| 样式 | Tailwind CSS + CSS Variables |
| 状态 | Zustand (auth / session / design-mode / locale / scene / ui) |
| 数据 | TanStack Query (React Query v5) |
| 动效 | Framer Motion |
| 桌面 | Tauri v3 (Rust + WebView) |

## 快速开始

```bash
cd Client/web
pnpm install
pnpm dev          # http://localhost:5173
```

`pnpm dev` 启动后，`/api` 请求自动代理到后端 `localhost:8080`。

## 目录结构

```
Client/web/src/
├── pages/           # 页面组件
│   ├── studio/      # 首页 (4 磁贴 + 聊天)
│   ├── feeds/       # 信息源 (RSS + 网页监控)
│   ├── schedule/    # 日程管理
│   ├── memory/      # 跨会话记忆
│   ├── skills/      # 技能库 + 技能市场
│   ├── ocr/         # 文档解析 (PaddleOCR)
│   ├── vms/         # 虚拟机管理
│   ├── nas/         # NAS 存储
│   ├── admin/       # 管理面板
│   ├── login/       # 登录/注册
│   └── me/          # 个人设置
├── components/      # 通用组件
│   ├── agent/       # Agent 输入/消息列表/附件
│   ├── arona/       # Arona 3D/动画
│   ├── layout/      # 侧边栏/页面壳
│   ├── motion/      # 动效组件 (Pressable/StaggerList/FadeIn)
│   ├── studio/      # 专注模式
│   ├── ui/          # 通用 UI (Drawer/SlideOver/Toast/Calendar)
│   └── wake/        # 离开检测
├── lib/             # 工具库
│   ├── api/         # API 客户端 (JWT 自动续期)
│   ├── sse-client.ts # SSE 流连接
│   ├── ui-actions.ts # Agent UI 控制分发
│   ├── event-bus.ts  # WebSocket 事件总线
│   ├── i18n.ts       # 国际化
│   └── motion.ts     # 动效 token
├── stores/          # Zustand 状态管理
├── hooks/           # 自定义 Hooks
├── types/           # TypeScript 类型
├── mocks/           # MSW Mock 数据 (测试用)
└── styles/          # 全局样式 + 主题 token
```

## 前端页面

| 路由 | 页面 | 作用 |
|---|---|---|
| `/` | HomePage | 时间 + 今日日程 + 快捷入口 |
| `/feeds` | FeedsPage | RSS 订阅 + 网页监控 |
| `/schedule` | SchedulePage | 日程 CRUD |
| `/memory` | MemoryPage | 跨会话记忆浏览 |
| `/skills` | SkillsPage | 技能库 + 技能市场 |
| `/ocr` | OCR Page | 本地文档解析 |
| `/vms` | VmsPage | 虚拟机管理 |
| `/admin` | AdminPage | 系统资源 / 用户 / 邮件通知 (admin only) |

侧边栏分组：
- **常规功能**：首页、信息源、日程、OCR、记忆、技能
- **工作室服务**：虚拟机、NAS、管理（admin）

## 设计模式

首页支持两种模式切换：
- **Dashboard**：4 个磁贴 (日程/天气/系统/信息源)
- **Focus**：专注对话模式，圆环动画展开

## Tauri 桌面壳

```bash
cd Client/tauri
cargo tauri build --target aarch64-apple-darwin  # macOS
cargo tauri build --target x86_64-pc-windows-msvc # Windows
cargo tauri build --target x86_64-unknown-linux-gnu # Linux
```

产物：
- macOS: `.dmg` + `.app`
- Windows: `.msi`
- Linux: `.AppImage` + `.deb`

## 开发命令

```bash
pnpm dev          # 启动开发服务器
pnpm build        # 生产构建
pnpm typecheck    # TypeScript 检查
pnpm lint         # ESLint 检查
pnpm test         # 单元测试 (Vitest)
pnpm e2e          # 端到端测试 (Playwright)
```

## 跟 Server 的边界

- **永远只走 HTTP/REST/WebSocket**, 不知道 backend 是 Python 还是 Rust
- 配置文件 / 静态资源通过 Tauri 桥接拿到
- 跨用户协作能力通过 `Server/center/` 的反向 WebSocket 推过来

## License

私有项目，All Rights Reserved.
