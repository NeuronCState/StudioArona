# Studio Arona — 工作室阿洛娜

> 部署在工作室 Ubuntu 物理主机上、有"身体"（屏幕 + 机械臂 + 摄像头）的智能公告板系统。  
> 管理工作室 LAN（NAS / HomeAssistant / VMs / RSS / 日程），识别成员人脸，跨会话记忆，AI 驱动 UI。

**当前阶段**：Mac 开发环境，硬件接口 mock。

---

## 快速开始

```bash
./start.sh
```

- **前端**：http://localhost:5173
- **API 文档**：http://localhost:8080/docs

```bash
make bootstrap   # 首次：安装依赖 + 启动 PG/Redis + 迁移 + 种子数据
```

---

## 项目结构

```
StudioArona/
├── apps/web/                     # 前端 (Vite + React + TS + Tailwind)
│   └── src/
│       ├── pages/                # studio / feeds / memory / schedule / system / vms / voice / login
│       ├── components/           # layout (ThemeToggle / LocaleToggle / DesignModeToggle) / arona / studio
│       ├── hooks/                # useTheme / useSpeechRecognition / useWeather
│       ├── lib/                  # api-client / sse-client / ui-actions / i18n
│       ├── stores/               # zustand: auth / session / design-mode / locale / scene
│       └── styles/               # globals.css + tokens + 1s theme transition
│
├── services/
│   ├── agent/                    # OpenClaw + Node.js Bridge
│   │   ├── bridge/               # server.js / web-watcher / rss-fetcher / minimax / tts / memory
│   │   ├── skills/               # face / feeds / ha / meta / nas / network / schedules / system / ui / vm / weather
│   │   ├── workspace/            # Agent 身份: IDENTITY / SOUL / TOOLS / HEARTBEAT
│   │   └── data/pages/           # 网页监控提取内容 (Readability + 图片)
│   ├── api-gateway/              # FastAPI 网关
│   │   └── app/                  # api / auth / proxy / ws / memory / middleware / models
│   ├── perception/               # 人脸识别 / 外设抽象 (FastAPI)
│   └── rssany/                   # [submodule] RSSAny 引擎 (备选)
│
├── packages/
│   ├── contracts/                # OpenAPI + TS/Python types
│   ├── skills/                   # Python Skill handlers
│   ├── ui-kit/                   # 20+ React 组件
│   ├── theme-toggle/             # 白天黑夜切换 Web Component (1s 过渡)
│   ├── live2d-arona/             # Spine/Live2D 模型 + 语音包
│   └── voice-button/             # 语音交互按钮素材
│
├── infra/
│   ├── compose/                  # Docker Compose (dev / test / prod)
│   ├── docker/                   # Dockerfiles
│   ├── db/                       # Alembic migrations
│   └── scripts/                  # start.sh / bootstrap / smoke / backup
│
├── docs/                         # 按日期组织: 2026-05-21~24
└── tests/                        # A(前端) / B(Agent) / C(Perception) / D(Gateway)
```

---

## 核心特性

### 信息源（统一 RSS + 网页监控）

输入 URL 自动识别类型：
- **RSS/Atom** → rss-fetcher 每 15 分钟抓取，新文章自动入库
- **网页** → web-watcher 每 1 分钟检测变化 → cheerio 提取链接 → Readability 提取正文 → **MiniMax AI 总结** → 生成标题+摘要

前端：统一列表展示，点击条目 → 干净阅读页（正文+图片），"查看原文"新标签打开。

### 主题切换

- `<theme-button>` Web Component，胶囊按钮 280em 宽，1 秒平滑过渡
- Shadow DOM 内实现：云朵漂移、星星闪烁、月亮切换
- 全局 CSS `transition: 1s` 确保深/浅色平滑

### 国际化

侧边栏中文/EN 切换，导航标签即时翻译。`useLocaleStore` 持久化到 localStorage。

### 天气

基于 IP 自动定位（ip-api.com），Open-Meteo 免费数据，展示：温度、湿度、风力、体感、紫外线。

### OpenClaw Agent 工作流

```
┌─────────────────────────────────────────────────────┐
│                    OpenClaw Agent                    │
│                                                     │
│  用户输入 (文本/语音)                                 │
│      │                                              │
│      ▼                                              │
│  ┌──────────────┐    ┌─────────────────┐            │
│  │ Prompt 组装   │───▶│ MiniMax-M2.7    │            │
│  │ (7层动态)     │    │ (云端 Chat API)  │            │
│  │ • IDENTITY   │    └────────┬────────┘            │
│  │ • SOUL       │             │                     │
│  │ • TOOLS      │             ▼                     │
│  │ • Memory     │    ┌─────────────────┐            │
│  │ • Context    │    │ 响应解析         │            │
│  │ • History    │    │ • token 流式输出 │            │
│  │ • Message    │    │ • tool_call 检测 │            │
│  └──────────────┘    │ • ui_action 生成 │            │
│                      └────────┬────────┘            │
│                               │                     │
│              ┌────────────────┼────────────────┐    │
│              ▼                ▼                 ▼    │
│       ┌──────────┐   ┌──────────────┐   ┌────────┐ │
│       │ SSE 推流  │   │ Skill 调用    │   │ UI 控制│ │
│       │ 前端渲染  │   │ curl API      │   │ 页面跳转│ │
│       │ 打字效果  │   │ schedules     │   │ 卡片渲染│ │
│       │          │   │ feeds/rss     │   │ Toast   │ │
│       └──────────┘   │ weather/vm    │   └────────┘ │
│                      └──────────────┘               │
└─────────────────────────────────────────────────────┘
```

**7 层 Prompt 动态组装**：每次对话前从 Identity → Soul → Tools → Memory Context → Runtime Context → Recent History → User Message 逐层构建，确保阿洛娜始终有完整上下文。

**Skill 工具调用**：Agent 可通过 HTTP API 调用 12 个 Skill —— 查询天气、管理日程、添加 RSS、操作 VM、搜索记忆等。Skill 定义在 `services/agent/skills/`，OpenClaw 自动发现并加载。

**ui_action 前端控制**：Agent 通过 SSE 流发出 `ui_action` 事件，前端组件注册表自动分发——页面跳转、卡片渲染、高亮、Toast 提示，无需硬编码路由。

### 对话管线（云 / 离线双路径）

```
用户语音输入
    │
    ├── ☁️ 云端路径（当前）
    │   ASR: MiniMax / Web Speech API
    │   LLM: MiniMax-M2.7 (Chat Completions)
    │   TTS: MiniMax TTS（支持声音克隆）
    │   Tool Calling: OpenClaw Skills（12 个 HTTP API）
    │
    └── 📴 离线路径（规划中，Deepseek说我这个是天才方案）
        LLM: fun-audio-chat 8B 4bit（本地量化推理）
        TTS: CosyVoice3（零样本声音克隆）
        Tool Calling: 本地 function calling + HTTP API
        场景: 断网 / 隐私敏感 / 低延迟本地对话
```

**声音克隆**：云端 MiniMax TTS 和离线 CosyVoice3 均支持用户声音克隆，阿洛娜可用你自己的声音说话。

**离线工具调用**：fun-audio-chat 8B 支持 function calling，离线模式下同样可调用本地 Skill API，完全对标云端能力。

### 跨会话记忆

Per-user memory，三层结构（raw → structured → embeddings），会话结束自动总结。

---

## Skills（已落地 12 个）

| Skill | 触发 | 端点 |
|-------|------|------|
| rss | RSS/网页订阅管理 | `:18790/api/feeds` |
| weather | 天气查询 | `:8080/api/weather` |
| schedules | 日程 CRUD | `:18790/api/schedules` |
| vm | 虚拟机管理 | `:8002/api/vms` |
| system | 系统指标 | `:8002/api/system/*` |
| meta | 偏好与记忆 | `:18790/api/me/*` |
| face | 人脸识别 | perception |
| ha / nas / network / ui | 各自领域 | - |

---

---

## 架构

### 数据流

```
  ┌─────────┐    读写     ┌──────────┐    SQL     ┌────────────┐
  │  前端    │ ────────→  │ Backend  │ ────────→ │ PostgreSQL │
  │ :5173   │ ←────────  │ :8080    │ ←──────── │            │
  └─────────┘   JSON     │ :18790   │           └────────────┘
                         │ :8002    │
  ┌─────────┐    curl    │          │
  │ OpenClaw│ ────────→  └──────────┘
  │ :18789  │ ←────────
  └─────────┘   JSON
```

**前端、OpenClaw、后端共享同一套 PostgreSQL**，全部通过 HTTP API 读写：

| 操作 | 前端 | OpenClaw | 结果 |
|------|------|----------|------|
| 添加 RSS | `POST /api/feeds` | `curl :18790/api/feeds` | 同一条 feed 记录 |
| 查看日程 | `GET /api/schedules` | `curl :18790/api/schedules` | 同一个 JSON 列表 |
| 删除订阅 | `DELETE /api/feeds/:id` | `curl -X DELETE` | 后台自动停止抓取 |
| 天气查询 | 天气卡片自动请求 | `curl :8080/api/weather` | IP 自动定位 |
| AI 总结 | 网页监控 → 生成的标题 | Skill 触发 `rss` → 读取摘要 | 同一批 feed_item |
| 记忆管理 | `/memory` 页面 | `meta` skill → `recall_memory` | 同一条 memory_entry |

**关键设计**：任何一方写入的数据，另一方立即可见。删除即停止后台服务，保持一致。

### 服务端口

| 服务 | 端口 | 说明 |
|------|------|------|
| 前端 Vite | 5173 | React dev server，proxy `/api` → 8080 |
| API Gateway | 8080 | FastAPI 网关：鉴权、路由、SSE 中继 |
| Agent Bridge | 18790 | Node.js：feeds / schedules / memory / web-watcher |
| OpenClaw | 18789 | Agent 网关，Skill 自动发现 |
| Perception | 8002 | 人脸识别 / 外设 / 硬件监控 |
| PostgreSQL | 5432 | 主数据库 |
| Redis | 6379 | 缓存 / 会话 |

---

## 开发命令

```bash
make dev              # 全栈启动
make test             # 所有单元测试
make lint             # ruff + eslint + spectral
make typecheck        # mypy + tsc
make db-migrate       # 数据库迁移
```

---

## 环境变量

复制 `.env.example` → `.env.local`，关键配置：

```bash
DATABASE_URL=postgresql+asyncpg://javis:javis@localhost:5432/javis
MINIMAX_API_KEY=      # 网页监控 AI 总结（web-watcher）
AGENT_URL=http://localhost:18790
PERCEPTION_URL=http://localhost:8002
```

---

## License

私有项目，All Rights Reserved.
