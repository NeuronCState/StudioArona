# Studio Arona — 什亭之匣

> 个人 AI 助理平台。统一管理日程、信息源、记忆、技能、OCR、虚拟机、系统监控。  
> v3 monorepo，前端 React + Tauri 桌面，后端 Rust，Agent 基于 [SonettoHere](https://github.com/Miso2233/SonettoHere) (LangGraph ReAct)。

---

## 项目概览

Studio Arona 是一个全栈个人助理系统，以"阿洛娜"为交互形象，提供日程管理、RSS/网页信息订阅、跨会话记忆、技能市场、OCR 文档解析、虚拟机管理和硬件监控等功能。

**核心理念**：数据本地优先，Server 端做协作同步。Client 离线完全可用，数据在 Web 端存 IndexedDB，桌面端存 `~/Documents/studioarona/`。

| 端 | 技术栈 | 说明 |
|---|---|---|
| **Client/web** | React 19 + TypeScript 6 + Vite 8 + Tailwind 4 | 14 页面 SPA |
| **Client/tauri** | Tauri 2 + Rust | macOS 桌面壳 |
| **Client/agent** | SonettoHere (Python, LangGraph ReAct) | 97 tools，WS 流式 |
| **Client/ocr** | PaddleOCR-VL-1.6 GGUF + llama.cpp | 按需启停，Metal/CUDA 加速 |
| **Server** | Rust axum + PostgreSQL 16 + Redis 7 | 20 endpoint REST API |

---

## 快速开始

### 前置条件

- Python 3.12 + [uv](https://astral.sh/uv)
- Docker (PostgreSQL 16 + Redis 7)
- Rust latest stable
- Node.js 22 + pnpm

### 启动

```bash
# 终端 1 — Server
cd Server
python3 run.py          # docker up + cargo run，端口 8080

# 终端 2 — Client (Agent + OCR + 前端)
cd Client
python3 run.py          # uv venv + SonettoHere + Vite，端口 5173
python3 run.py --download-ocr  # 首次下载 OCR 模型 (1.85G)

open http://localhost:5173
```

### 端口

| 端口 | 服务 |
|------|------|
| 5173 | Vite dev server |
| 8080 | Rust center daemon |
| 8081 | SonettoHere agent |
| 8083 | OCR FastAPI |
| 5432 | PostgreSQL |
| 6379 | Redis |

---

## 功能

### 日程管理
完整的日程 CRUD，日历选日期、按天分组展示。支持"即将到来"和"全部"两种视图。PATCH 乐观锁防冲突，冲突时弹窗手动合并。本地优先存储，离线可用。

### 信息源
输入 URL 自动嗅探分流——RSS 订阅源或网页变更监控。RSS 每 15 分钟抓取一次，网页监控基于 hash 对比。本地优先存储，离线可添加和删除。

### 跨会话记忆
三层结构（原始 → 结构化 → embeddings），会话结束后自动总结，Agent 对话时注入上下文。

### 技能市场
浏览、搜索、一键安装技能。多源支持（SkillsMP / GitHub），中英文自动翻译。

### Agent 对话
基于 SonettoHere (LangGraph ReAct)，97 个工具（43 native + 54 MCP）。支持 MiniMax / OpenAI / DeepSeek / 自定义四种 Provider。WebSocket 流式协议，思考块、工具调用卡片、命令面板（`/`）等交互组件。

### OCR 文档解析
PDF 和图片转 Markdown。PaddleOCR-VL-1.6 GGUF 模型（892M），按需启动、空闲 5 分钟自动释放。macOS Metal GPU / Linux CUDA / Windows Vulkan。

### 硬件监控
CPU 核心利用率、GPU 温度/使用率、内存/磁盘占用、训练任务、网络设备、Cron 状态。仪表盘式展示。

### 虚拟机管理
申请、查看、操作虚拟机。Mock / libvirt / VirtualBox 三种 Hypervisor。XTerm 终端直连。

### 3D 交互形象
Arona 模式：Three.js 教室场景（白天/夜晚切换）+ PixiJS Spine 角色（鼠标视线追踪 + 情绪表情切换）。

---

## 架构

```
┌─────────────────┐        HTTP/REST       ┌──────────────┐      SQL       ┌────────────┐
│  Client (Web)    │ ─────────────────────→ │ Rust Center   │ ────────────→ │ PostgreSQL │
│  :5173           │ ←───────────────────── │ :8080         │ ←──────────── │ + Redis    │
└─────────────────┘        JSON             └──────────────┘               └────────────┘
        │                                           ↑
        │ WebSocket                                 │ HTTP
        ↓                                           │
┌─────────────────┐                                 │
│ SonettoHere     │ ──────── HTTP ────────────────→ │
│ :8081           │ ←─────── JSON ─────────────────│
└─────────────────┘                                 │
                                                    │
┌─────────────────┐  spawn (按需)                   │
│ OCR :8083       │ ←───────────────────────────────│
└─────────────────┘                                 │
```

**本地优先**：Client 先写本地存储，online 时 push server。Web 端用 IndexedDB (Dexie)，Tauri 桌面端用 `~/Documents/studioarona/` 下的 JSON 文件。连接检测每 30s ping `/health`，离线自动切本地模式，重连后自动同步。

---

## 项目结构

```
StudioArona/
├── Client/
│   ├── run.py                      # 一键启动 SonettoHere + OCR + Vite
│   ├── packages/ui-kit/            # 共享 React 组件 (Avatar, Button, Card, Dialog...)
│   ├── services/sonetto/           # SonettoHere agent 运行时 (内置)
│   ├── services/ocr/               # OCR FastAPI 包装
│   ├── tauri/                      # Tauri 2 桌面壳
│   │   ├── capabilities/default.json
│   │   └── src/main.rs             # spawn SonettoHere + OCR
│   └── web/                        # React SPA
│       └── src/
│           ├── pages/              # 14 页面 (login, home, feeds, schedule, system, vms...)
│           ├── components/         # agent/arona/motion/layout/ui 组件
│           ├── stores/             # Zustand (auth, session, ui, connection, focus-mode...)
│           ├── lib/
│           │   ├── schemas/        # Zod 4 模式 (auth, vm, api)
│           │   ├── storage/        # 本地存储 (IDB / FS 自适应)
│           │   └── api/            # HTTP client
│           └── hooks/              # useApiQuery, useChatStream, useLocalResource...
│
├── Server/
│   ├── run.py                      # docker up + cargo run
│   ├── center/                     # Rust axum daemon (20 endpoint)
│   ├── infra/compose/              # PG 16 + Redis 7
│   └── infra/db/versions/          # SQL migrations
│
└── docs/
    ├── upgrade-plan.md             # 依赖升级计划与执行记录
    └── RELEASE_NOTES_v3.md         # v3 发布说明
```

---

## 开发

### Client

```bash
cd Client
python3 run.py                      # 全套启动
python3 run.py --no-sonetto         # 跳过 Agent
python3 run.py --no-ocr             # 跳过 OCR
python3 run.py --download-ocr       # 下载 OCR 模型

# 前端单独
cd web
pnpm dev                            # Vite dev server
pnpm build                          # 生产构建
pnpm typecheck                      # TypeScript 检查
pnpm lint                           # ESLint + Stylelint
pnpm test                           # Vitest 单元测试 (83 tests)
pnpm test:browser                   # Vitest 浏览器模式测试
pnpm e2e                            # Playwright E2E

# Tauri 桌面
pnpm tauri dev
pnpm tauri build --debug
```

### Server

```bash
cd Server
python3 run.py                      # docker + cargo run
python3 run.py --no-docker          # PG/Redis 已启动时跳过 docker
python3 run.py --daemon             # 后台模式
python3 run.py --stop               # 停全部服务

# Rust 单独
cd center
cargo build --release
./target/release/center
```

### 环境变量

`Server/.env.local`:

```bash
DATABASE_URL=postgres://javis:javis@localhost:5432/javis
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev-only-change-me-please-32-chars
WEATHER_API_KEY=                    # 可选
```

---

## 技术栈

| 类别 | 选型 | 版本 |
|------|------|------|
| 前端框架 | React | 19.2 |
| 类型系统 | TypeScript | 6.0 |
| 构建工具 | Vite (Rolldown) | 8.0 |
| CSS 框架 | Tailwind CSS | 4.3 |
| 路由 | React Router | 7.18 |
| 状态管理 | Zustand | 5.0 |
| 数据获取 | TanStack React Query | 5.101 |
| 表单 | React Hook Form + useActionState | 7.80 |
| 数据验证 | Zod | 4.4 |
| 动画 | Framer Motion | 12.40 |
| 3D 渲染 | React Three Fiber + Drei | 9.6 / 10.7 |
| 2D 角色 | PixiJS + pixi-spine | 7.4 / 4.0 |
| 本地存储 | Dexie (IndexedDB) + Tauri FS | 4.4 / 2.5 |
| 测试 | Vitest + Testing Library + Playwright | 4.1 / 16.3 / 1.61 |
| 桌面壳 | Tauri | 2.11 |
| 后端框架 | Rust axum | 0.8 |
| 数据库 | PostgreSQL + Redis | 16 / 7 |
| Agent 框架 | SonettoHere (LangGraph ReAct) | — |
| OCR 引擎 | PaddleOCR-VL-1.6 GGUF + llama.cpp | — |

---

## License

私有项目，All Rights Reserved。
