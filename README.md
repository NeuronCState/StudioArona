# Studio Arona — 智能公告板

> 个人 AI 助理平台 — 统一管理日程 / 信息源 / 记忆 / 技能 / OCR / VMs / 系统。  
> v3 monorepo: **Client** (React + Tauri 桌面) + **Server** (Rust center daemon + PG/Redis)。  
> v3.1: 集成 [SonettoHere](https://github.com/Miso2233/SonettoHere) 当 agent framework (LangGraph ReAct)。

---

## 当前状态 (2026-06-17)

| 端 | 状态 | 说明 |
|---|---|---|
| **Client/web** | ✅ 14 页面 + 14 endpoint 全通 | React 18 + TS + Vite + Tailwind + Zustand + TanStack Query |
| **Client/tauri** | ✅ macOS dev OK, .dmg 打包待办 | Tauri v2 + Rust 桌面, 启动时 spawn SonettoHere |
| **Server/center** | ✅ 20 endpoint, cargo build 0.5s | Rust axum + sqlx (PG) + redis |
| **Agent** | ✅ SonettoHere 0 改集成 | LangGraph ReAct, 43 native + 54 MCP tools |
| **OCR** | ✅ 端到端通 (lazy load) | PaddleOCR-VL-1.6 GGUF + llama.cpp, 模型首次下载 |
| **三平台** | ✅ Web dev OK / ⚠️ .dmg 不急 | web 模式跨平台, .dmg 待办 |

---

## 快速开始

### 前置依赖

- **Python 3.12** (`uv python install 3.12`)
- **uv** (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
- **Docker** (启 PG/Redis)
- **Rust** (`curl https://sh.rustup.rs -sSf | sh`)
- **Node.js 22** + **pnpm 9**
- **SonettoHere Agent runtime** 已内置于 `Client/services/sonetto`，无需单独克隆

### 启动

```bash
# 终端 1: Server (PG/Redis + Rust daemon)
cd Server
python3 run.py                # 前台跑

# 终端 2: Client (venv + SonettoHere + OCR + Vite)
cd Client
python3 run.py                # 前台跑 (首次会建 venv + 装 SonettoHere 依赖 ~30s)
python3 run.py --download-ocr # 首次下载 OCR 资源 (1.85G, 5-30min)

# 浏览器打开
open http://localhost:5173
```

### 端口分配

| 端口 | 服务 | 启在哪 |
|---|---|---|
| 5173 | Vite (前端) | Client `run.py` |
| 8080 | Rust center daemon | Server `run.py` |
| 8081 | SonettoHere uvicorn | Client `run.py` |
| 8083 | OCR FastAPI (Web 模式 dev) | Client `run.py --download-ocr` 后 |
| 5432 | PostgreSQL | Server `run.py` 启 docker |
| 6379 | Redis | Server `run.py` 启 docker |

---

## 目录结构

```
StudioArona/                              # v3 monorepo (471 files / ~3.5 MB)
├── README.md                             # 本文件
├── .env.example                          # dev env 模板 (无敏感信息)
├── .env.production.template              # production env 模板 (所有 secret 是 CHANGE_ME)
├── .gitignore
├── .gitattributes
│
├── .github/                              # CI workflows
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── workflows/
│       ├── nightly.yml                   # 每日 e2e/contract/security scan (过期, 引用旧 services/ 结构)
│       ├── pr.yml                        # PR 流水线 (过期, 同上)
│       └── release.yml                   # 多平台 release (macOS arm64+x64 + Windows + Linux)
│
├── Client/                               # 用户端 — 前端 + Tauri 桌面壳 (409 files)
│   ├── README.md
│   ├── package.json + pnpm-lock.yaml + pnpm-workspace.yaml
│   ├── run.py                            # 一键启动: venv + SonettoHere + OCR + Vite
│   ├── packages/ui-kit/                  # 共享 React 组件 (Avatar, Button, Card, Dialog, ...)
│   ├── services/
│   │   ├── sonetto/                      # SonettoHere agent 运行时 (内置, 首次启动 uv venv + 装 deps)
│   │   └── ocr/                          # OCR FastAPI 包装
│   ├── tauri/                            # Tauri v2 桌面壳 (25 files)
│   │   ├── Cargo.toml + Cargo.lock
│   │   ├── tauri.conf.json
│   │   ├── capabilities/default.json     # 权限: dialog/notification/shell/fs/scope=Documents/studioarona
│   │   ├── icons/                        # .icns + .ico + 各种 png
│   │   └── src/{main.rs, lib.rs}         # spawn SonettoHere + OCR (lazy, 5min 空闲 kill)
│   └── web/                              # React + TS + Vite SPA (229 files)
│       └── src/{pages, components, stores, lib, hooks, mocks, ...}
│
└── Server/                               # 中心服务 (58 files)
    ├── README.md
    ├── run.py                            # 一键启动: docker (PG/Redis) + cargo run
    ├── center/                           # Rust axum center daemon
    │   ├── Cargo.toml + Cargo.lock
    │   ├── src/                          # 20 endpoint: auth/schedule/rss/memory/skills/vms/weather/...
    │   └── tests/                        # integration_http/isolation/round_trip/runtime_fixes
    ├── infra/
    │   ├── compose/docker-compose.yml    # postgres:16 + redis:7-alpine
    │   └── db/versions/                  # 16 SQL migrations
    ├── scripts/download_ocr.sh           # OCR 资源下载 (1.85G, hf-mirror 镜像)
    └── services/ocr/                     # FastAPI OCR 服务 (PaddleOCR-VL-1.6 + llama.cpp)
```

**运行时数据 (`.gitignore` 排除, 不在 repo 里)**:
- `Client/.venv-sonetto/` — Python 3.12 venv (首次启动自动建, 装 SonettoHere + OCR deps)
- `Client/vendor/` + `Server/vendor/` — OCR 模型 (1.85G, 首次 `python3 run.py --download-ocr` 拉)
- `Client/web/dist/` — Vite build 产物 (Tauri build 时自动 build)
- `Client/tauri/target/` — Rust 编译产物
- `Server/center/target/` — Rust 编译产物
- `Client/.run-logs/` + `Server/.run-logs/` — 运行时日志

---

## 核心特性

### 信息源 (统一 RSS + 网页监控)
- `/feeds` 接受任意 URL, 自动嗅探分流
- RSS 源 (`.xml`/`.atom`/`/feed`) → rss-fetcher 5min 抓
- 普通网页 → web-watcher hash 对比 + Readability + AI 总结

### 日程管理
- `/schedule` 完整 CRUD
- PATCH 乐观锁 (`expected_updated_at` 不匹配 → 409 + server/client/field_diff)
- 客户端到点触发 (前端实现)

### 跨会话记忆
- `/memory` 三层结构 (raw → structured → embeddings)
- 会话结束自动总结

### 技能市场 + 安装
- `/skills` 浏览 + 搜索 + 一键安装
- 多源: SkillsMP / GitHub
- 自动中英文翻译

### OCR (本地 PaddleOCR-VL-1.6)
- `/ocr` PDF / 图片 → Markdown
- **按需启动**: 用户点 OCR 才 spawn 模型, 空闲 5min 自动 kill (释放 1.7G 模型内存)
- macOS: Metal GPU (5s 加载); Linux: CUDA; Windows: Vulkan

### Agent (SonettoHere 集成)
- LangGraph ReAct, 43 native tools + 54 MCP tools
- 4 preset provider: MiniMax / OpenAI / DeepSeek / 自定义
- WebSocket `/ws/chat/{session_id}` 协议
- 思考块 + 工具调用卡片 + 进度条 + 命令面板 (`/`)

### 工作室服务 (VMs / NAS / Admin)
- 未连接时显示"未连接"占位 (StudioServiceOffline 组件)
- 连接后自动展开

---

## 数据流

```
   ┌─────────┐    HTTP     ┌──────────┐    SQL    ┌────────────┐
   │ 前端     │ ────────→ │ Rust    │ ────────→ │ PostgreSQL │
   │ :5173   │ ←──────── │ :8080    │ ←──────── │  + Redis  │
   └─────────┘  JSON      └──────────┘           └────────────┘
        │                      ↑
        │ WebSocket            │
        ↓                      │
   ┌─────────┐                  │
   │Sonetto  │ ─── HTTP ──────→│
   │ :8081   │ ←── JSON ──────│
   └─────────┘                  │
                                │
   ┌─────────┐  spawn (按需)   │
   │OCR      │ ←───────────────│
   │ :8083   │                  │
   └─────────┘                  │
```

**关键设计**: Client 永远只走 HTTP/REST/WebSocket, 不知道 backend 是 Python 还是 Rust.

---

## 开发命令

### Client

```bash
cd Client
python3 run.py                # 全套: venv + SonettoHere + OCR + Vite
python3 run.py --no-sonetto   # 不启 SonettoHere (纯前端)
python3 run.py --no-ocr       # 不启 OCR
python3 run.py --download-ocr # 首次下载 OCR 资源 (1.85G)
python3 run.py --stop         # kill 所有子进程
python3 run.py --logs         # tail 日志

# Vite 单独 (后端另起):
cd web && pnpm dev

# Tauri 桌面:
cd tauri && cargo build
cd .. && cargo tauri dev
```

### Server

```bash
cd Server
python3 run.py                # 全套: docker up + cargo run
python3 run.py --no-docker    # 不启 docker (PG/Redis 已起)
python3 run.py --build        # 只 cargo build
python3 run.py --daemon       # background 模式 (log → .run-logs/center.log)
python3 run.py --stop         # 停 docker + kill center
python3 run.py --logs         # tail 日志

# 单独 cargo:
cd center && cargo build --release && ./target/release/center
```

### 数据库迁移

```bash
# 启动时自动跑 migrations (sqlx::migrate!("../infra/db/versions"))
# 加新表: 在 Server/infra/db/versions/ 加 NNN_xxx.sql
```

---

## 环境变量

`Server/.env.local` (模板: `Server/.env.example`):

```bash
DATABASE_URL=postgres://javis:javis@localhost:5432/javis
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev-only-change-me-please-32-chars

# 天气 (可选, 无 key 用 wttr.in fallback)
WEATHER_API_KEY=

# LLM (在 Client 端 useSonettoConfigStore 推, 不在 Server env)
```

---

## Agent 集成 (SonettoHere)

v3.1 起, Agent 框架从 Hermes 切换到 SonettoHere (LangGraph ReAct).

**集成原则**: Agent 后端运行时内置于 Client；上游 Vue 界面由 StudioArona React 界面替代.

**协议** (`ws://127.0.0.1:8081/ws/chat/{session_id}`):
- Client send: `chat` / `cancel` / `ping`
- Server send: `thinking_start` / `token` / `thinking_end` / `tool_start` / `tool_end` / `final_answer` / `error` / `context_usage`

**Provider 配置**: Client `ProfileSettingsDialog` + `SetupPage` 用 SonettoHere schema 推 4 preset (minimax-cn / openai-test / deepseek / custom).

**SonettoHere 运行时**: `Client/services/sonetto` (内置于 Client, 首次启动 `uv venv` + `uv pip install` 清华源, ~30s 一次性).

---

## OCR 集成

引擎: PaddleOCR-VL-1.6 GGUF (892M) + llama-server (按平台 ~30-200M)
视觉: PaddleOCR-VL-1.6-GGUF-mmproj.gguf (841M)
API: OpenAI 兼容 `/v1/chat/completions`

**资源位置**: `Client/vendor/paddle-ocr/*.gguf` + `Client/vendor/llama.cpp/{plat}/*` (`.gitignore` 排除, 首次 `python3 Client/run.py --download-ocr` 拉)
**首次下载**: `python3 Client/run.py --download-ocr` (1.85G, 5-30min)

**桌面模式 (Tauri)**: 
- `client OCRPage` → `invoke('ocr_ensure')` → Rust spawn llama-server + FastAPI (5s ready)
- 5min 空闲自动 kill (释放 1.7G 模型 + Metal 显存)
- 复用 `Client/.venv-sonetto` Python venv

**Web 模式 (dev)**:
- `python3 run.py --download-ocr` 下载资源
- `python3 run.py` 启 OCR FastAPI (端口 8083)
- `client OCRPage` 直接 fetch localhost:8083

**端到端验证**:
```
$ curl -X POST http://127.0.0.1:8083/ocr/recognize -F "image=@test.png"
{"markdown":"Hello OCR Test 2026"}
```

---

## Sprint backlog (1-7 收官后)

- [ ] **S3**: 三平台 .dmg/.msi/.AppImage 打包 + Tauri updater
- [ ] **S4**: 完善 — VM 真实 hypervisor / Marketplace registry / WS 实时 / i18n / 错误重试
- [ ] **S5**: 生产化 — HTTPS / rate limit / audit / backup / secrets / OAuth
- [ ] **OCR**: v3.1 已完成基础版, 待办: PDF 多页表格识别优化 / 公式识别

---

## License

私有项目, All Rights Reserved.
