# Studio Arona — 工作室阿洛娜

> 部署在工作室 Ubuntu 物理主机上、有"身体"（屏幕 + 机械臂 + 摄像头）的智能公告板系统。  
> 管理工作室 LAN（NAS / HomeAssistant / VMs / RSS / 日程），识别成员人脸，跨会话记忆，AI 驱动 UI。

**当前阶段**：Mac 开发环境，硬件接口 mock。  
**2026-06-13（v6）**：技能市场上线 — 多源搜索（SkillsMP/GitHub）、分类浏览、自动中英文翻译、一键安装到用户目录、安全扫描。侧边栏新增"工作室云服务"分组（未连接可展开但不可导航），OCR 本地可用。  
**2026-06-13（v5）**：PaddleOCR-VL-1.6 模型下载到 `vendor/paddle-ocr/`（GGUF 格式，~1.8GB），支持本地文档解析。v3 功能矩阵文档完善（安全模型、冲突处理、性能目标、迁移路径）。  
**2026-06-13（v4）**：前端动效统一化 — motion token + 三个共享组件（Pressable / StaggerList / FadeIn），6 个页面应用，Drawer 弹层 portal 到 body，深色 sheet 整页下拉，日历 + 时间选择器重构。JWT 改 30min/30day，401 自动 refresh 续期。  
**2026-06-11（v1）**：邮件通知（Notifier）上线 — QQ SMTP 双通道、4 触发场景、admin 端点 5 个、前端通知面板就位。  
**2026-06-11（v2）**：RSS 智能监控上线 — 双 worker（rss-fetcher + web-watcher）按 URL 自动嗅探分流，每 5min 聚合推邮件。

---

## 快速开始

```bash
./run.sh start
```

- **前端**：http://localhost:5173
- **API 文档**：http://localhost:8080/docs
- **LLM Gateway**（OpenAI 兼容）：http://localhost:8645/v1/chat/completions
- **Hermes Agent**（开发/调试 agent runtime）：参见 `docs/hermes-integration.md`

```bash
make bootstrap   # 首次：安装依赖 + 启动 PG/Redis + 迁移 + 种子数据
```

### 邮件通知（可选）

填 `.env.local` 启用（默认 SMTP，留空则不发送）：

```bash
NOTIFY_SMTP_HOST=smtp.qq.com           # 或 smtp.163.com / smtp.gmail.com
NOTIFY_SMTP_PORT=465
NOTIFY_SMTP_USER=你的邮箱@qq.com
NOTIFY_SMTP_PASS=授权码（不是密码）     # QQ 在 网页邮箱→设置→账户→SMTP服务→生成授权码
NOTIFY_SMTP_SSL=true
NOTIFY_FROM_NAME=什亭之匣 AI
NOTIFY_FROM_EMAIL=你的邮箱@qq.com
```

admin 在 `/admin` → **邮件通知** tab 测试发送 / 群发。详见 `docs/email-notifier.md`。

### 前端页面索引

| 路由 | 页面 | 可见者 | 作用 |
|---|---|---|---|
| `/` | HomePage | 全员 | 时间 + 今日日程 + 快捷入口 |
| `/chat` | ChatPage | 全员 | LLM Gateway 聊天（OpenAI 兼容） |
| `/feeds` | FeedsPage | 全员 | RSS 订阅 + 网页监控（统一列表 + 干净阅读页） |
| `/schedule` | SchedulePage | 全员 | 日程 CRUD，到点触发邮件 |
| `/memory` | MemoryPage | 全员 | 跨会话记忆浏览（来自 Hermes） |
| `/skills` | SkillsPage | 全员 | 技能库 + 技能市场（多源搜索、分类浏览、一键安装） |
| `/ocr` | OCR Page | 全员 | 本地 OCR 识别（PaddleOCR-VL-1.6，离线可用） |
| `/admin` | AdminPage | **admin** | 系统资源 / 用户列表 / 邮件通知（3 tab） |
| `/settings` | SettingsDialog | 全员 | 个人偏好（弹窗，含通知邮箱字段） |

侧边栏分组：
- **常规功能**：首页、信息源、日程、OCR、记忆、技能
- **工作室云服务**：虚拟机、系统监控、摄像头、NAS（未连接可展开但不可导航）
- **管理**：仅 admin 可见

---

## 新功能（2026-06-13）

### 技能市场

前端 `/skills` 页面新增"市场"标签页，支持：
- **多源搜索**：聚合 SkillsMP（1.7M+ 技能）和 GitHub 的技能
- **分类浏览**：开发、数据与AI、设计、运维、测试安全、文档、内容媒体、商业、工具
- **自动翻译**：英文描述自动翻译为中文（通过 LLM Gateway）
- **一键安装**：下载技能到 `~/.hermes/profiles/<user_id>/skills/`
- **安全扫描**：自动检测恶意代码模式（eval、subprocess、os.system 等）

后端 API：`/api/skills/marketplace/{search,install,installed}`

### PaddleOCR-VL-1.6（本地 OCR）

模型文件需手动下载到 `vendor/paddle-ocr/`（GGUF 格式，~1.8GB）：
- `PaddleOCR-VL-1.6-GGUF.gguf` — 主模型 (936MB)
- `PaddleOCR-VL-1.6-GGUF-mmproj.gguf` — 多模态投影器 (882MB)

下载命令：
```bash
# 使用 hf-mirror（国内镜像）
curl -L "https://hf-mirror.com/PaddlePaddle/PaddleOCR-VL-1.6-GGUF/resolve/main/PaddleOCR-VL-1.6-GGUF.gguf" \
  -o vendor/paddle-ocr/PaddleOCR-VL-1.6-GGUF.gguf

curl -L "https://hf-mirror.com/PaddlePaddle/PaddleOCR-VL-1.6-GGUF/resolve/main/PaddleOCR-VL-1.6-GGUF-mmproj.gguf" \
  -o vendor/paddle-ocr/PaddleOCR-VL-1.6-GGUF-mmproj.gguf
```

使用方式（需安装 llama.cpp）：
```bash
# 启动推理服务
llama-server -hf PaddlePaddle/PaddleOCR-VL-1.6-GGUF

# 或使用 Python
pip install llama-cpp-python
```

支持功能：OCR、表格识别、公式识别、图表识别、印章识别、文字定位

### 工作室云服务

侧边栏新增"工作室云服务"分组：
- 未连接工作室时可展开查看，但导航项不可点击
- 连接后自动展开，可正常导航
- 包含：虚拟机、系统监控、摄像头、NAS 存储

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
├── vendor/
│   ├── python/                   # 三平台 Python 3.12 解释器
│   └── paddle-ocr/               # PaddleOCR-VL-1.6 GGUF 模型 (~1.8GB)
│
├── infra/
│   ├── compose/                  # Docker Compose (dev / test / prod)
│   ├── docker/                   # Dockerfiles
│   ├── db/                       # Alembic migrations
│   └── scripts/                  # start.py / bootstrap / smoke / backup
│
├── docs/                         # 按日期组织: 2026-05-21~24
└── tests/                        # A(前端) / B(Agent) / C(Perception) / D(Gateway)
```

---

## 核心特性

### 信息源（统一 RSS + 智能网页监控）

**前端"信息源"页** `/feeds` 接受任意 URL，**自动嗅探类型**后分流到两个独立 worker：

| 嗅探规则 | 走的链路 | 后端 worker |
|---|---|---|
| URL 路径含 `/feed` `/rss` `/atom`、扩展名 `.xml` `.atom`、hostname 含 `rss` `rsshub` `feedburner` | RSS 源 | `rss-fetcher.js`（`rss-parser` 解析，UNIQUE 去重） |
| 其他（普通网页） | 智能监控 | `web-watcher.js`（整页 SHA256 hash 对比 → cheerio 抽链接 → Readability 提正文 → MiniMax AI 总结） |

两个 worker 都被 `start.py` 自动 spawn，每 **5 分钟**轮询一次（不再是 README 旧版本写的 15min / 1min），结果统一写到 `feed_item` 表（前端 `/api/feeds` UNION 展示，含 `kind: feed|page`）。

**智能监控完整 pipeline**（web-watcher，普通网页）：
```
fetch URL → SHA256 hash → 比 last_hash
  ↓ 变了
cheerio 抽同 host 链接（过滤 /rss /feed /tag /app/static + 必须含数字段）
  ↓ 每个新链接
fetch → jsdom → @mozilla/readability → 提正文（标题/段落/图片 src>100px）
  ↓ 下载图片到 ~/.studioarona/data/pages/<site>/<date>/<guid>.html
MiniMax API → 15 字标题 + 详细摘要
  ↓ 写入 feed_item
读 USER.md city → 调 notifier.rss_update(items) → 推邮件给 owner
```

**MINIMAX_API_KEY 缺时**自动 fallback：直接用 article 自身 title + 前 300 字（链路口子不变）。

**邮件防刷屏**：5 分钟 debounce（`RSS_NOTIFY_DEBOUNCE_SEC=300`）。同 user 在窗口内多次抓到的内容**累积到 pending**，下一窗口合成一封 digest 邮件推送。

**前端"信息源"页**统一列表（feed + page_monitor UNION），点击条目 → 干净阅读页（正文+图片），"查看原文"新标签打开。**支持的前端操作**：添加（自动嗅探）/ 列表 / 标记已读 / 加星 / 删除。

### 主题切换

- `<theme-button>` Web Component，胶囊按钮 280em 宽，1 秒平滑过渡
- Shadow DOM 内实现：云朵漂移、星星闪烁、月亮切换
- 全局 CSS `transition: 1s` 确保深/浅色平滑

### 国际化

侧边栏中文/EN 切换，导航标签即时翻译。`useLocaleStore` 持久化到 localStorage。

### 天气

基于 IP 自动定位（ip-api.com），Open-Meteo 免费数据，展示：温度、湿度、风力、体感、紫外线。  
（v2.1+ 改用本地 weather fetcher daemon，每 5 分钟从 wttr.in 拉所有用户城市的天气缓存到 `~/.studioarona/weather_cache.json`，前端 cold-start 时兜底）

### 多用户隔离 + 每用户独立 Hermes

- 注册时分配独立目录 `~/.hermes/profiles/<user_id>/`（含 `USER.md` / `MEMORY.md` / `skills/` / `state.db` / `hermes.log`）
- 用户首条 chat 时 LLM Gateway 懒 spawn 该用户的 Hermes daemon 进程（端口独立，PID 独立）
- 30 分钟无活动自动清理；admin 可在管理面板"强制下线"立刻 kill
- 详见 `docs/multi-user-hermes.md`

### 角色权限（admin / member）

- 普通用户：看到首页 / 对话 / 信息源 / 日程 / 技能 / 记忆
- 管理员额外看到：**技能管理（`/skills`）** 和 **管理面板（`/admin`）**
- 角色在用户表 `users.role` 字段，admin 可在 UI 直接改

### 邮件通知（4 触发场景 + 双通道）

单发件邮箱（当前 `345988168@qq.com`）统一推送：

| 触发场景 | 钩子函数 | 何时 |
|---|---|---|
| 用户日程到点 | `notifier.scheduler.user_due(user, event)` | schedule cron 到点 |
| admin 群发公告 | `notifier.scheduler.admin_broadcast(subject, body)` | admin Page "📢 群发" |
| 容器/服务报错 | `notifier.scheduler.vm_error(error)` | perception/vm 服务异常 |
| RSS 订阅更新 | `notifier.scheduler.rss_update(items, user)` | rss-fetcher 新条目 |

支持双通道（启动时 env 选）：
- **(A) SMTP**（默认）— QQ / 163 / Gmail basic auth 还活着
- **(B) Microsoft Graph OAuth2** — 适合工作/学校租户

详见 `docs/email-notifier.md`。

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
    └── 📴 离线路径（已验证可用）
        ASR + LLM: Fun-Audio-Chat-8B-MNN（4bit 量化，MNN 引擎推理）
        TTS: CosyVoice3-0.5B（零样本声音克隆）
        Tool Calling: <tool_call> XML 标签 → 本地 HTTP API
        场景: 断网 / 隐私敏感 / 低延迟本地对话
```

#### 离线管线架构

```
┌──────────────────────────────────────────────────────────┐
│                    离线语音对话管线                        │
│                                                          │
│  麦克风 ──▶ audio.mnn (编码器)                            │
│              │  波形 → 音频 embedding                     │
│              ▼                                          │
│            llm.mnn (4bit 量化, ~6GB)                     │
│              │  理解 + 推理 + 工具调用决策                  │
│              │  输出: 文本 tokens + <tool_call> JSON       │
│              ▼                                          │
│       ┌──────┴──────┐                                    │
│       │             │                                    │
│       ▼             ▼                                    │
│   纯文本回复     <tool_call> 工具调用                       │
│       │             │                                    │
│       │             ▼                                    │
│       │      执行 HTTP API → 结果回传 llm.mnn               │
│       │             │                                    │
│       └──────┬──────┘                                    │
│              ▼                                          │
│        CosyVoice3-0.5B (TTS)                            │
│          llm.pt + flow.pt + hift.pt                      │
│          零样本声音克隆 · 9 语言 · 150ms 首包               │
│              │                                          │
│              ▼                                          │
│           扬声器                                         │
└──────────────────────────────────────────────────────────┘
```

**关键设计**：Fun-Audio-Chat 的 `audio.mnn` 编码器已集成在 `llm.mnn` 的 multimodal 推理管线中，无需单独调用。CosyVoice3 替换 Fun-Audio-Chat 内置 TTS 以获得更好的音质和声音克隆能力。

**MNN Python API 调用示例**：

```python
import MNN

# 加载模型（自动加载 llm.mnn + audio.mnn）
llm = MNN.llm.create("config.json")
llm.load()

# 语音输入（支持文件路径或波形 tensor）
result = llm.response({"audios": [{"file_path": "user_speech.wav"}]})

# 工具调用 — 使用 Jinja template 定义的 <tool_call> 格式
messages = [
    {"role": "system", "content": "# Tools\n<tools>\n{...}\n</tools>\n..."},
    {"role": "user", "content": "查询东京天气"}
]
prompt = llm.apply_chat_template(messages)
output = llm.generate(llm.tokenizer_encode(prompt), max_new_tokens=200)
# 输出示例: <tool_call>\n{"name": "get_weather", "arguments": {"city": "Tokyo"}}\n</tool_call>
```

**模型文件位置**：

| 模型 | 路径 | 大小 |
|------|------|------|
| Fun-Audio-Chat-8B (LLM + Audio) | `services/agent/models/Fun-Audio-Chat-8B-MNN/` | 6.0GB |
| CosyVoice3-0.5B (TTS) | `services/agent/models/Fun-CosyVoice3-0.5B-2512/` | 9.1GB |

模型文件不上传 Git，通过 `modelscope download` 下载到上述路径。

**声音克隆**：云端 MiniMax TTS 和离线 CosyVoice3 均支持用户声音克隆，阿洛娜可用你自己的声音说话。

**离线工具调用**：fun-audio-chat 8B 通过 Jinja template 原生支持 function calling（`<tool_call>` XML 标签），离线模式下同样可调用本地 Skill API，完全对标云端能力。

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
  │ :8645   │ ←────────
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
| API Gateway | 8080 | FastAPI 网关：鉴权、路由、SSE 中继、内部端点 |
| Agent Bridge | 18790 | Node.js：feeds / schedules / memory |
| LLM Gateway | 8645 | OpenAI 兼容，per-user Hermes 调度 |
| RSS Fetcher | 8003 | Node.js sidecar，每 5min 抓 `feed` 表 RSS/Atom 源 |
| Web Watcher | — | 内嵌 bridge 进程，每 5min 智能监控普通网页（hash + cheerio + Readability + AI 总结） |
| Perception | 8002 | 人脸识别 / 外设 / 硬件监控 |
| Weather Fetcher | — | 内嵌 llm_gateway 进程，每 5min 预拉用户城市天气 |
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
make llm-gateway      # 单独启动 LLM Gateway (port 8645)
make hermes           # 启动 Hermes TUI
make hermes-gateway   # 启动 Hermes 消息网关（需要 IM token）
```

> ⚠️ **LLM Gateway** 在 8645 端口提供 OpenAI 兼容 API。
> 详见 `docs/hermes-integration.md`。

### Watchdog（自愈）

macOS Docker Desktop daemon 经常挂（环境问题），加 watchdog 自动拉起所有服务：

```bash
./run-watchdog.sh install   # 装成 launchd 服务（开机自启 + 进程死了 KeepAlive 拉起）
./run-watchdog.sh status    # 看 watchdog 状态
./run-watchdog.sh uninstall # 卸
```

Watchdog 每 30s 检查：Docker daemon / PG+Redis / Bridge (18790) / LLM Gateway (8645)，
挂了自动 `nohup` 拉起。日志在 `/tmp/studio-watchdog.log`。

---

## 环境变量

复制 `.env.example` → `.env.local`，关键配置：

```bash
DATABASE_URL=postgresql+asyncpg://javis:javis@localhost:5432/javis
MINIMAX_API_KEY=      # MiniMax CN endpoint key
MINIMAX_MODEL=MiniMax-M2.5-highspeed  # 默认模型
LLM_GATEWAY_PORT=8645  # LLM Gateway 端口
AGENT_URL=http://localhost:18790
PERCEPTION_URL=http://localhost:8002

# 邮件通知（可选）
NOTIFY_SMTP_HOST=smtp.qq.com   # 或 smtp.163.com / smtp.gmail.com
NOTIFY_SMTP_PORT=465
NOTIFY_SMTP_USER=345988168@qq.com
NOTIFY_SMTP_PASS=授权码
NOTIFY_SMTP_SSL=true
NOTIFY_FROM_NAME=什亭之匣 AI
NOTIFY_FROM_EMAIL=345988168@qq.com
NOTIFY_RETRY_MAX=3

# RSS 邮件防刷屏（可选，默认 5min debounce）
RSS_NOTIFY_DEBOUNCE_SEC=300
```

---

## 更新日志

### 2026-06-13 — 前端动效统一化 + Drawer/Calendar 组件 + JWT 自动续期 + 滚动条稳定

**目标**：让全站动效统一优雅；侧边栏/列表/卡片/页面切换有 spring + stagger；danger 操作走确认弹窗；JWT 自动续期不再"突然被踢"；滚动条永不引起布局跳动。

#### Motion token 体系（`src/lib/motion.ts`）

集中管理全站动效参数，改这里 = 改全站：
- **5 档 duration**：75/150/240/400/600ms（instant/fast/base/slow/scenic）
- **3 种 easing**：out (spring-like 收尾) / inout / spring
- **2 档 stagger**：list 40ms / page 80ms
- Tailwind 同步加 `duration-instant/fast/base/slow/scenic` + `ease-out-soft/inout-soft/spring-soft`

#### 三个共享动效组件（`src/components/motion/`）

- **`<Pressable variant="card|button|ghost">`** — hover 抬升 / tap 缩放 / focus ring
- **`<StaggerList>` + `<StaggerItem>`** — 列表项按序进入
- **`<FadeIn delay>`** — 单元素淡入

#### 通用 Drawer 组件（`src/components/ui/Drawer.tsx`）

支持两种方向 + 两种 top 形态：
- `from="top" variant="card"`：顶部居中小卡片（默认）
- `from="top" variant="sheet"`：**整页深色 sheet**，从 header 下方覆盖整页（Schedule 用）
- `from="right"`：右侧滑出 100vh 高（VM 用）

特性：
- **React Portal 渲染到 `document.body`** — 避免祖先 `transform` 干扰 `position: fixed`
- spring 物理（stiffness 380 / damping 38）
- 背景遮罩 fade + 抽屉 spring 滑入/滑出
- Esc 键关闭 + body 滚动锁 + 遮罩点击关闭

**接入页面**：
- `SchedulePage` — "添加日程" 用 top sheet（深色全屏覆盖），含大日历 + 时间选择器
- `VmsPage` — "申请 VM" 用 right drawer（拉满整页高度，560px 宽）

#### 通用确认弹窗（`src/components/ui/ConfirmDialog.tsx`）

- 共用组件：`title / description / confirmLabel / cancelLabel / destructive / loading`
- 走 ui-kit `Dialog`（自动 portal + 焦点恢复 + 240ms 动画）
- destructive 时：警告图标 spring 旋转进入 + 红色按钮
- SchedulePage 已接入：删日程弹"删除日程?「测试编辑」将被永久删除, 无法恢复。"
- 任何其他页面要加确认（VM 销毁、Skill 删除等）直接复用

#### Calendar + TimePicker 组件

**`<Calendar variant="dark|light" />`**（`src/components/ui/Calendar.tsx`）
- 6×7 网格月历
- `<` `2026年6月` `>` 翻月（带 spring scale）
- 跨月日期淡色，今天: amber 文字 + 圆点
- 选中: amber 高亮 + shadow
- 0 外部依赖（原生 Date）

**`<TimePicker variant="dark|light" />`**（`src/components/ui/TimePicker.tsx`）
- 大数字 HH:MM，中间 `:` 分隔
- 上下箭头 ±1，数字 input 直接键盘输
- tabular-nums 等宽数字

**SchedulePage 重构**：
- 拆 state: `startDate: 'YYYY-MM-DD'` + `startTime: 'HH:MM'` → 提交时合并成 ISO
- Drawer 内布局 `max-w-5xl grid lg:grid-cols-[1.4fr_1fr]`：左日历 / 右时间+字段
- 卡片左侧加 monospace 时间显示
- 编辑中状态：amber 环 + "编辑中" 标签
- Edit form 也改用同款 Drawer sheet（保持一致体验）

#### 已重构 6 个页面的动效

- `StudioSidebar` — nav items stagger + active indicator spring scaleY + 按钮 hover/tap
- `FeedsPage` — 订阅卡片 stagger + hover lift
- `AdminPage` — header FadeIn + 盾牌 spring 进入 + 2 张表 tbody stagger + DLQ stagger
- `SkillsPage` — skill 卡片 stagger + hover lift
- `MemoryPage` — 时间线记忆 stagger
- `App.tsx` — AnimatePresence 页面切换（y 6 → 0, 150ms）
- `<motion.div className="h-full w-full">` 修了一个关键 bug：之前没加高度导致 home 页面 4 磁贴塌成 0 高度

#### JWT 自动续期

**之前**：60 min access + 7 day refresh，但前端**没有自动 refresh** → 60 分钟后用户任何操作就 401 被踢。

**现在**（`apps/web/src/lib/api/client.ts`）：
- access 30 min + refresh 30 day（`services/api-gateway/app/core/config.py`）
- 401 → 自动 `POST /api/auth/refresh` 拿新 token → 用新 token 重试原请求
- **并发 401 共享同一个 refresh promise** — `refreshInflight` 单例锁，避免 3 个请求同时触发 3 次 refresh
- refresh 失败才真的踢出登录
- auth store 加 `setAccessToken()` 单独更新 access token（不动 user）

**验证**：篡改 localStorage 里的 access token 为 `EXPIRED_INVALID`，刷新页面触发请求 → `[refresh] 200`，`still authenticated: true`，新 token 拿到。`refresh called: 1`（只刷一次）。

#### 滚动条策略：完全隐藏

**理由**：跨浏览器最稳定，永不占布局空间，永不抖动。滚轮/触摸板/方向键仍能滚。

```css
::-webkit-scrollbar { display: none; width: 0; height: 0; }
* { scrollbar-width: none; -ms-overflow-style: none; }
```

**验证**：5 个页面切换 `clientWidth` 全稳定 1180，无横向溢出。撤了之前的 `scrollbar-gutter: stable`（不需要了）。

#### 闪烁修复（页面切换 loading 闪屏）

**根因**（3 层叠加）：
1. AnimatePresence `opacity: 0` + `mode="wait"` → 老页面 exit 期间右半屏全空
2. page 级 `if (loading) return <Skeleton />` → 整页换成 4 行小 skeleton，上下全空
3. `isLoading` 语义错误 → React Query v5 中 `isLoading` 仅首次为 true

**修复**：
1. `query-client.ts` 加 `placeholderData: keepPreviousData` — 老数据保持可见
2. 各 page `isLoading` → `isPending && !data` — 缓存命中时不显示 skeleton
3. **页面 chrome（标题/搜索/按钮）loading 时保留，只数据区 skeleton** — 切页时立刻看到完整页面结构
4. AnimatePresence 减负：`initial={false}` 首次不动画 + `opacity 0.6 → 1`（不会完全透明）+ `150ms fast`（2.5x 更快）

**验证**（慢网 800ms throttle）：t=240ms loading 状态 = 标题 + 搜索 + 4 行 skeleton 矩形；t=640ms = 完整 EmptyState。无"全屏白"或"全屏 loading 蒙层"。

#### 验证
- `tsc --noEmit` 0 errors（所有页面 + 新组件）
- Playwright 端到端：motion hover 验证 `transform: none → matrix(1.005, 0, 0, 1.005, 0, -2)`
- 侧边栏 nav hover `matrix(1, 0, 0, 1, 2, 0)` (translateX 2px)
- 6 页面全 stagger 验证
- JWT refresh 端到端通过



**目标**：清除 OpenClaw 历史遗留，统一品牌为 Studio Arona，端口从 OpenClaw 时代的 18789 迁移到 Hermes 默认 8645。

**OpenClaw 清理**：
- `services/agent/bridge/server.js` — 删除 `OPENCLAW_CONFIG`、`agentPool` import 和全部 dead code 路径（agentPool fallback + tool-call hallucination retry）
- `services/agent/bridge/tts.js` — 移除 `openclaw infer tts convert` 调用，改为 no-op（TODO: 接 MiniMax TTS API）
- `services/agent/bridge/agent-pool.js` — **删除**（dead code，不再被任何文件 import）
- `services/agent/bridge/minimax.js` — 更新注释
- `infra/scripts/start.py` — 移除 `pkill openclaw gateway` 模式
- `.env.example` — 删除废弃的 `OPENCLAW_*` 配置块
- `Makefile` — 更新注释和消息
- `CLAUDE.md`、`docs/hermes-integration.md`、`docs/multi-user-hermes.md` — 更新文档

**Studio Javis → Studio Arona**：
- `services/agent/package.json` — `@studio-javis/agent` → `@studio-arona/agent`
- `Makefile` — echo 消息
- `.env.example`、`infra/compose/.env.production` — 注释
- `services/agent/bridge/web-watcher.js`、`lib/article.js` — User-Agent 头
- `services/api-gateway/app/main.py` — docstring 和 API title
- `services/api-gateway/pyproject.toml` — description
- `infra/docker/` — Dockerfile 注释、docker-compose.prod.yml 镜像名
- `packages/contracts/openapi.yaml` — API title
- `packages/ui-kit/src/index.ts` — 注释
- `apps/web/src/stores/` — localStorage key (`studio-javis-*` → `studio-arona-*`)
- `services/agent/workspace/SUMMARIZER.md` — 提示词
- `CLAUDE.md` — 命名说明

**注意**：`pyproject.toml` 的 `name = "studio-javis"` 未修改（改名会破坏 uv workspace），历史规划文档 `docs/` 保留原样。

**端口迁移 18789 → 8645**：
- `services/llm_gateway/main.py` — `DEFAULT_PORT = 8645`
- `.env.example` — `LLM_GATEWAY_PORT=8645`、URL 更新
- `infra/scripts/start.py` — 端口检测和启动横幅
- `services/agent/bridge/minimax.js`、`server.js` — 默认 URL
- `services/api-gateway/app/proxy/forward.py`、`app/api/admin.py` — 默认 URL
- `scripts/watchdog.sh` — 端口检查
- `scripts/test_multi_user_isolation.py`、`benchmark_hermes.py` — 测试/基准 URL
- `Makefile`、`package.json` — 启动命令
- `infra/compose/.env.production`、`.env.production.template` — 生产配置

**本地模型兼容性**：Fun-Audio-Chat-8B-MNN（MNN 引擎）和 CosyVoice3-0.5B（ONNX/PyTorch）均支持 macOS/Linux/Windows，无需修改。

**验证**：Python 语法检查 5/5 通过，Node.js 语法检查 4/4 通过，单元测试 20/22 通过（2 个 pre-existing 失败与本次修改无关）。

### 2026-06-12 — 三平台自适应完整修复

**目标**：修复 macOS/Windows/Linux 三平台运行时的硬编码路径和 POSIX API 依赖，确保 Windows 上能正常启动。

**修复**：

**P0 — 阻塞性（Windows 启动崩溃）**：
- `infra/scripts/start.py` — 新增 `venv_bin()` 辅助函数（Windows 用 `.venv/Scripts/`，POSIX 用 `.venv/bin/`），替换全部 8 处硬编码 `.venv/bin/` 路径
- `infra/scripts/start.py` — `cleanup()` 中 `pkill` 替换为平台分支：Windows 用 `taskkill /F /IM node.exe`，POSIX 保持 `pkill -f`
- `infra/scripts/start.py` — 全部 `/tmp/` 日志路径替换为 `tempfile.gettempdir()`（alembic、weather-fetcher、rss-fetcher、web-watcher 日志）
- `services/llm_gateway/main.py` — `spawn()` 在 Windows 上使用 `creationflags=CREATE_NEW_PROCESS_GROUP` 替代 `start_new_session=True`
- `services/llm_gateway/main.py` — `_kill()` 在 Windows 上使用 `taskkill /PID /T` 和 `taskkill /F /PID /T` 替代 `os.killpg()` / `signal.SIGKILL`
- `services/agent/bridge/tts.js` — `/tmp/arona_tts/` 替换为 `os.tmpdir() + /arona_tts/`
- `services/agent/bridge/server.js` — TTS 音频路径同样替换为 `os.tmpdir()`
- `services/perception/app/api/vms.py` — `/tmp/` 替换为 `tempfile.gettempdir()`
- `services/perception/app/core/face/auto_calibrate.py` — `/tmp/calibration` 替换为 `Path(tempfile.gettempdir()) / "calibration"`

**P1 — 功能缺失**：
- `run.bat` — 新增 `install` 子命令（对齐 `run.sh install`），调用 `install_deps.py`
- `infra/scripts/install_deps.py` — `install_uv()` 在 Windows 上使用 PowerShell 安装脚本替代 `curl | sh`
- `infra/scripts/install_deps.py` — `install_hermes()` 在 Windows 上跳过安装并提示手动安装
- `infra/scripts/install_deps.py` — PATH 分隔符使用 `os.path.pathsep` 替代硬编码 `:`
- `services/api-gateway/app/nas/__init__.py` — sshpass 查找改用 `shutil.which()` 跨平台搜索；`UserKnownHostsFile=/dev/null` 在 Windows 上改为 `NUL`

**P2 — 低优先级**：
- `services/api-gateway/app/memory/tests/test_paths.py` — `/tmp/javis-test` 替换为 `tempfile.gettempdir()`
- `.env.example` — `PERCEPTION_PLATFORM` 默认值从 `mac` 改为 `auto`
 - `services/perception/app/config.py` — `Platform` 枚举新增 `WINDOWS`；`from_env()` 支持 `auto` 自动检测（`sys.platform` → `mac/linux/windows`）

### 2026-06-12 — Article 阅读修复

**目标**：让 RSS 文章有真正的完整正文（不只是摘要）。

**新增**：

**改**：
- `infra/scripts/start.py` —— spawn rss-fetcher + web-watcher（前者独立进程；后者之前已集成到 server.js 这次改为独立）
- `services/agent/bridge/rss-fetcher.js` —— `REFRESH_INTERVAL_MS: 15min → 5min`；跳过 `page://` 开头的合成 feed URL；pollAll 末尾按 user_id 聚合 new items，调 `/internal/notify/rss` 推邮件
- `services/agent/bridge/web-watcher.js` —— `ensureFeed` 写 `enabled=false`（合成 feed 不进 listFeeds，避免和真 feed 重复）；checkOne 处理完一批 article 后拉回 `feed_item` 最新 20 条调 notify
- `services/api-gateway/app/main.py` —— 挂载 `internal_notify_rss_router`

**用户操作**：
```bash
# 添加 RSS 源（自动嗅探）
curl -X POST http://localhost:8080/api/feeds \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"url":"https://36kr.com/feed","title":"36氪","category":"tech"}'
# → kind=feed, rss-fetcher 5min 抓

# 添加普通网页（自动 sniff 失败 → page_monitor）
curl -X POST http://localhost:8080/api/feeds \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"url":"https://www.ithome.com","title":"IT之家","category":"tech"}'
# → kind=page, web-watcher 5min 抓首页新文章 + Readability + AI 总结
```

**验证**：
- `run.sh start` 自动 spawn 两个 worker（之前 start.py 漏了）
- 实测：`/api/feeds` 返回混合 5 个源（3 RSS + 2 page_monitor）
- 5min 轮询：rss-fetcher 抓到 90 条新条目（36kr + IT之家 RSS）→ 聚合发 1 封邮件；web-watcher 抓到 10 条 IT 之家新文章 → 5min 后聚合发 1 封邮件
- 邮件真收到 `345988168@qq.com`（QQ SMTP via aiosmtplib，2 封：20 条 + 10 条）
- debounce 验证：第 2 次调用间隔 < 10s → `rss_notify_debounced pending=10 wait=6`；第 3 次间隔 > 10s → flush 出去

**已支持**：自动嗅探（`/feed` / `.xml` / hostname 含 rss/rsshub）→ feed；其他 → page_monitor

**还没做**（可选）：
- ~~CSS selector 字段生效~~ **2026-06-11 v2 已支持**：`monitor.css_selector` 用 cheerio 提取关注区（如 `.article-list` / `#content` / `.main`），不匹配自动 fallback 到 body
- ~~RSSHub 实例部署~~ **2026-06-11 v2 已部分支持**：hostname 含 `rsshub` 自动 sniff 成 feed，用户可直接贴 `https://rsshub.app/<route>` 抓无 RSS 的站。但公开实例 `rsshub.app` 国内访问不稳，**生产建议本地部署**：
  ```bash
  # 另开终端（需要 docker）
  docker run -d --name rsshub -p 1200:1200 rsshub/rsshub
  # 然后添加源时用 http://127.0.0.1:1200/...
  ```
- `MINIMAX_API_KEY` 填到 `.env.local`（当前缺，AI 总结走 article title fallback，不影响功能）

### 2026-06-11 — 邮件通知 Notifier（QQ SMTP 双通道）

**目标**：单发件邮箱（`345988168@qq.com`）统一推送，覆盖 4 个触发场景。

**新增**：
- `services/api-gateway/app/notifier/email.py` — 通知核心（aiosmtplib + retry + DLQ + Jinja2 模板）
- `services/api-gateway/app/notifier/templates/{base,schedule_due,admin_broadcast,vm_error,rss_update}.html.j2` — 4 个场景 HTML 邮件模板（基于 base）
- `services/api-gateway/app/api/admin.py` — 5 个 admin 端点：
  - `GET  /api/admin/notify/status` — 当前通道 + 配置（不泄漏密码）
  - `POST /api/admin/notify/test` — 测试发送（任意 to）
  - `POST /api/admin/notify/broadcast` — 群发（所有有 email 的用户）
  - `POST /api/admin/notify/user/{user_id}` — 单用户定向
  - `GET  /api/admin/notify/dlq` — 死信队列（NDJSON 读）
- `services/api-gateway/app/api/auth.py` — 注册流程免邀请码，加可选 `email` 字段（带格式校验 + 唯一性）
- `services/api-gateway/app/api/me.py` — `PATCH /api/me` 加 `email` 字段（用户可自填/清空）
- `services/api-gateway/app/api/users.py` — admin 可在 `CreateUserRequest` / `UpdateUserRequest` 加/改 `email`
- `services/api-gateway/app/models/user.py` + `infra/db/versions/011_user_email.py` — `users.email VARCHAR(320) NULL` + 索引
- `docs/email-notifier.md` — 双通道操作指南（QQ SMTP + Outlook OAuth2 中文 UI 步骤）
- `apps/web/src/pages/admin/AdminPage.tsx` — 加 **邮件通知** tab（状态卡 + 测试发送 + 群发 + 死信展示）；Users tab 加用户行内"📧 通知"按钮

**改**：
- `services/api-gateway/app/main.py` — 启动时 `load_dotenv(.env.local, override=False)`，让 SMTP/OAuth env 在模块 import 时就能读到
- `services/api-gateway/app/notifier/email.py` — 双 backend：`NOTIFY_SMTP_HOST` 设了走 SMTP（QQ/163/Gmail），`NOTIFY_OAUTH_CLIENT_ID` 设了走 Microsoft Graph（适合 outlook 工作/学校租户）
- `services/api-gateway/pyproject.toml` — 加 `aiosmtplib>=5.1`, `jinja2>=3.1`, `python-dotenv>=1.0`, `httpx>=0.28`
- `.env.example` — 增 NOTIFY_* 默认块
- `.env.local` (chmod 600) — 填 QQ 邮箱 `345988168@qq.com` + 授权码（启动时不被 export，只用 python 读）

**Schema**：
- alembic 跑通 `010 → 011`：users 加 email + 索引
- 旧 invitation_code 字段保留（向后兼容，不再强校验）

**验证**：
- `notify/test` 发给 `345988168@qq.com` → `ok=true, backend=smtp`
- `notify/broadcast` → 1 个用户收到（zhangxuanning 改 email 为 `345988168@qq.com` 后自测）
- 4 个 HTML 模板 render 成功
- `/api/admin/notify/status` 返回 `{backend: smtp, host: smtp.qq.com, user: 345988168@qq.com, pass_set: true, ...}`
- tsc --noEmit 0 errors

**4 触发钩子（函数已就位，等真实数据流接入）**：
1. `notifier.scheduler.user_due(user, event)` — schedule cron 到点
2. `notifier.scheduler.admin_broadcast(subject, body)` — admin UI
3. `notifier.scheduler.vm_error(error)` — perception/vm 异常时
4. `notifier.scheduler.rss_update(items, user)` — rss-fetcher 新条目

### 2026-06-10 — Watchdog 自愈 + USER.md 注入 + 写接口

**新增**：
- `scripts/watchdog.sh` + `run-watchdog.sh` —— macOS launchd 守护，自动拉起 Docker / Bridge / LLM Gateway
- LLM Gateway 写接口（`POST /v1/users/{id}/skills`、`PATCH` / `DELETE` / `PUT /v1/users/{id}/memory`）—— 前端可创建/编辑技能和用户档案
- `apps/web/src/pages/skills/SkillsPage.tsx` —— 用户技能库页面（仿 MemoryPage 风格，user/hermes 双 tab）
- api-gateway 反代 `/api/v1/chat/*` `/api/v1/models` `/api/v1/users/*`（含 PUT）到 LLM Gateway
- 端到端 USER.md 注入：bridge 调用 LLM Gateway `/v1/users/{id}/memory` 拉用户档案，组装 context 后调 LLM → 模型正确回答用户身份（"老师住在上海"、"老师叫张宣宁"）

**改**：
- `infra/scripts/start.py` —— pnpm 改 warn（不硬退出）；LLM Gateway 加 `--reload`；docker compose up 失败 graceful（不再 sys.exit）；alembic 失败 graceful；main loop 加 bridge 端口监听自愈
- `services/agent/bridge/server.js` —— `useDirectMiniMax=true` 走 LLM Gateway，移除 OpenClaw 硬依赖；新增 `fetchUserProfile()` 拉 USER.md 注入 context
- `services/llm_gateway/main.py` —— 加 `_ensure_profile()` 懒初始化、写接口全套

**验证**：
- `test_multi_user_isolation.py` 3/3 通过
- 端到端 chat 真实调 MiniMax 成功，USER.md 注入正确
- Watchdog 守护：杀 bridge 30s 内拉起，杀 LLM Gateway 30s 内拉起

### 2026-06-10 — 用 Hermes + LLM Gateway 取代 OpenClaw

**目标**：把"OpenClaw gateway 18789"和"前端直连 MiniMax API"两条路全部走 Hermes / LLM Gateway，前端 0 改动。

**新增**：
- `services/llm_gateway/main.py`（~200 行 FastAPI）—— OpenAI 兼容 HTTP 端点，端口 18789
  - 透传到 MiniMax CN endpoint
  - **自动过滤 `<think>...</think>` 推理块**（前端不用处理）
  - 支持流式（SSE）和非流式
  - 通过 `.env.local` 读取 `MINIMAX_API_KEY` / `MINIMAX_CN_BASE_URL` / `LLM_GATEWAY_PORT`
- `docs/hermes-integration.md` —— 完整迁移指南

**改**：
- `infra/scripts/start.py` —— 启动 LLM Gateway 替代 OpenClaw gateway（同一端口 18789）
- `Makefile` —— 新增 `make llm-gateway`、`make hermes`、`make hermes-gateway`、`make hermes-proxy`；`make agent` 默认启动 LLM Gateway + Bridge
- `services/agent/package.json` —— 删除 `openclaw` 依赖；`pnpm start` 报废弃错误
- `services/agent/bridge/minimax.js` —— 走 LLM Gateway（`http://127.0.0.1:18789/v1/chat/completions`），不再直连 minimax
- `.env.example` —— `OPENCLAW_*` 配置改为 `LLM_GATEWAY_*`，加注释说明

**删**：
- `services/agent/openclaw.json`（包含已泄露的硬编码 token `aea15c27...`，已移到 .env.local）

**验证过的 Hermes 能力**（v0.16.0）：
- MiniMax provider 连通（`provider=minimax-cn`，中国 endpoint）
- OpenAI 兼容 SSE 流式
- Hermes 内部默认过滤 thinking（前端对接 Hermes 不需要做过滤）
- 工具调用（grep, search_files, browser_navigate, terminal, tts 等）
- 5 个模型速度对比（最快 `MiniMax-M2.5-highspeed` + `reasoning_effort: none` = 3s 热路径）

**Hermes 还没做到**（需要后续）：
- 不直接提供 minimax 的 OpenAI 兼容代理（`hermes proxy` 只支持 nous/xai）—— 这是 LLM Gateway 存在的理由
- Skill 迁移：原 `services/agent/skills/*` 是 OpenClaw 风格，需要按 `agentskills.io` manifest 重写
- IM 网关：需要先配 Telegram/微信/飞书 token

### 2026-06-10 — 跨平台自包含 + 启动脚本 Python 化

**目标**：项目拷到任何机器上 `./run.sh` 直接跑，不依赖系统 Python、不依赖任何绝对路径，业务启动行为跨平台一致。

#### 1. 三平台 Python 解释器内嵌（`vendor/python/`）

| 平台 | 路径 | 大小 |
|------|------|------|
| macOS Apple Silicon | `vendor/python/darwin-arm64/` | ~25 MB |
| macOS Intel | `vendor/python/darwin-x64/` | （按需添加） |
| Linux x86_64 | `vendor/python/linux-x64/` | ~106 MB |
| Windows x86_64 | `vendor/python/windows-x64/` | ~44 MB |

基于 [python-build-standalone](https://github.com/astral-sh/python-build-standalone) 20260602 release。自带 SSL/ffi/sqlite，**不依赖系统 Python**。

#### 2. 跨平台启动入口（`run.sh` / `run.bat`）

- `run.sh`（macOS/Linux）：`bash` + `ln -sf` + `uv sync` 平台检测
- `run.bat`（Windows）：`cmd` 镜像同一逻辑
- 自动按 `uname -s/m` 或 `%PROCESSOR_ARCHITECTURE%` 选平台 interpreter
- 首次跑自动 `uv sync` 装平台特定的 wheels
- 用法：
  - `./run.sh start` — 启动整个项目（PG/Redis/API/前端）
  - `./run.sh python xxx.py` — 跑任意 Python 命令
  - `./run.sh -m pytest` — 跑测试

#### 3. 全相对路径化

- `.venv/bin/python` → `../../vendor/python/<plat>/bin/python3.12`（相对路径 symlink）
- `.venv/bin/` 下所有脚本 shebang 改为 `#!/usr/bin/env python3`
- `activate` / `activate.csh` / `activate.fish` / `activate.nu` / `activate.bat` 的 `VIRTUAL_ENV` 改为脚本自定位（`BASH_SOURCE[0]` / `status -f` / `%~dp0..`）

项目目录拷到任意位置都能直接跑，不用改任何路径。

#### 4. 业务启动器 Python 化（`infra/scripts/start.py`）

把原来的 `infra/scripts/start.sh`（357 行 bash）翻译成纯 Python（370 行）：

- 不依赖 shell trap、ANSI 颜色等 bash 黑魔法
- `subprocess.Popen` + 全局 `PIDS` 列表管理子进程
- `signal.signal(SIGINT/SIGTERM, cleanup)` 统一清理
- `kill_port()` 跨平台：macOS/Linux 用 `lsof`，Windows 回退 `netstat + taskkill`
- import 时无副作用（signal 注册移到 `main()` 内）

#### 5. 镜像加速 + 测试

- `pyproject.toml` 加清华镜像：`index-url = "https://pypi.tuna.tsinghua.edu.cn/simple/"`
- 新增 `tests/E_infra/unit/test_start.py`，**22 个单元测试**覆盖 start.py 关键路径（端口检测 / env 加载 / 环境探测 / venv 自愈 / 清理幂等 / main 完整流程）

#### 6. 修复：Fun-Audio-Chat 模型解压损坏

原 `StudioArona.zip` 解压时 `services/agent/models/Fun-Audio-Chat-8B-MNN/llm.mnn.weight` CRC 校验失败。用 `modelscope download` 重新拉取，文件完整（1.2 GB）。

#### 7. 清理

- 删除旧的 `start.sh`（根目录 3 行包装）和 `infra/scripts/start.sh`（357 行 bash）

---

## License

私有项目，All Rights Reserved.

### 首次安装（仅需一次）

```bash
# macOS / Linux:
./install-deps.sh   # 自动装 OrbStack (macOS) 或 docker (Linux)

# Windows (PowerShell / Git Bash):
# 自行下载 Docker Desktop: https://docker.com
```
