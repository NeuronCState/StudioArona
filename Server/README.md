# Server/

后端 + 协作中心 — 所有不直接跑在用户终端上的代码。

```
Server/
├── python/          Python 后端
│   ├── api-gateway/    FastAPI 网关 (鉴权/路由/SSE)
│   ├── llm_gateway/    OpenAI 兼容 LLM 代理
│   ├── perception/     人脸识别 / 外设抽象
│   ├── agent/          Agent Bridge + RSS/Web Watcher
│   └── weather_fetcher/ 天气缓存服务
├── rust/            Rust 重写目标 (v3 Phase 1)
├── center/          Linux 中心 daemon (v3 Phase 3)
├── protos/          跨语言 API 契约
├── infra/           基础设施
│   ├── compose/       Docker Compose
│   ├── db/            Alembic 数据库迁移
│   └── scripts/       启动/部署脚本
└── tests/           测试套件
```

## 服务架构

```
  ┌─────────┐    读写     ┌──────────┐    SQL     ┌────────────┐
  │  前端    │ ────────→  │ Backend  │ ────────→ │ PostgreSQL │
  │ :5173   │ ←────────  │ :8080    │ ←──────── │            │
  └─────────┘   JSON     │ :18790   │           └────────────┘
                         │ :8002    │
  ┌─────────┐    curl    │          │
  │  LLM    │ ────────→  └──────────┘
  │ :8645   │ ←────────
  └─────────┘   JSON
```

## 服务端口

| 服务 | 端口 | 说明 |
|------|------|------|
| API Gateway | 8080 | FastAPI 网关：鉴权、路由、SSE 中继、内部端点 |
| Agent Bridge | 18790 | Node.js：feeds / schedules / memory |
| LLM Gateway | 8645 | OpenAI 兼容，per-user Hermes 调度 |
| RSS Fetcher | 8003 | 每 5min 抓 RSS/Atom 源 |
| Web Watcher | — | 每 5min 智能监控普通网页 |
| Perception | 8002 | 人脸识别 / 外设 / 硬件监控 |
| PostgreSQL | 5432 | 主数据库 |
| Redis | 6379 | 缓存 / 会话 |

## API Gateway (FastAPI)

`Server/python/api-gateway/app/main.py` 加载 `.env.local`，`create_app()` 组装中间件：

- ErrorHandler → Logging → RateLimit → CSRF → CORS

路由：
- `api/{health, auth, me, users, admin, upload, weather}`
- `ws/routes` (WebSocket)
- `internal/{events, memory_api, metrics, notify_rss}` (localhost-only)
- `proxy/routes` (反代到 Bridge / Perception)

### 认证

- JWT: access 30min + refresh 30day
- 401 → 自动 refresh → 重试
- 注册免邀请码，email 可选

### 邮件通知 (Notifier)

单发件邮箱统一推送，4 触发场景：

| 场景 | 触发 |
|------|------|
| 用户日程到点 | schedule cron |
| admin 群发公告 | admin UI |
| 容器/服务报错 | perception/vm 异常 |
| RSS 订阅更新 | rss-fetcher 新条目 |

双通道：SMTP (QQ/163/Gmail) 或 Microsoft Graph OAuth2。

### 信息源

前端 `/feeds` 接受任意 URL，自动嗅探分流：

| 嗅探规则 | 链路 |
|---|---|
| URL 含 `/feed` `/rss` `/atom` 或扩展名 `.xml` | RSS → `rss-fetcher.js` |
| 其他普通网页 | 智能监控 → `web-watcher.js` |

两个 worker 每 5min 轮询，结果统一写 `feed_item` 表。

## LLM Gateway

OpenAI 兼容 HTTP 端点，per-user Hermes daemon：

- 首次接触懒 spawn Hermes 进程
- 30min 无活动自动回收
- 注入 per-user 上下文 (USER.md + MEMORY.md + 运行时)
- 自动过滤 `<think>...</think>` 推理块

## Perception

人脸识别 / 外设抽象：

- Mac 摄像头 or 图片循环 fallback
- CPU/内存用 psutil (真实)
- GPU mock (开发阶段)
- NAS/HA/VM mock (`.env.local` 中 `MOCK_*=true`)

## 数据库

使用 Alembic 管理 PostgreSQL 迁移：

```bash
make db-migrate       # alembic upgrade head
make db-rollback      # alembic downgrade -1
make db-new-migration m="description"  # 新建迁移
```

## 开发命令

```bash
make bootstrap        # 首次：安装依赖 + PG/Redis + 迁移 + 种子
make dev              # 全栈启动
make test             # 单元测试
make test-integration # 集成测试 (testcontainers)
make lint             # ruff + eslint + spectral
make typecheck        # mypy + tsc
make llm-gateway      # 单独启动 LLM Gateway
make hermes           # Hermes TUI
```

## 环境变量

复制 `.env.example` → `.env.local`，关键配置：

```bash
DATABASE_URL=postgresql+asyncpg://javis:javis@localhost:5432/javis
MINIMAX_API_KEY=              # MiniMax CN endpoint key
MINIMAX_MODEL=MiniMax-M2.5-highspeed
LLM_GATEWAY_PORT=8645
AGENT_URL=http://localhost:18790
PERCEPTION_URL=http://localhost:8002

# 邮件通知 (可选)
NOTIFY_SMTP_HOST=smtp.qq.com
NOTIFY_SMTP_PORT=465
NOTIFY_SMTP_USER=你的邮箱@qq.com
NOTIFY_SMTP_PASS=授权码
NOTIFY_SMTP_SSL=true
```

## 迁移计划

1. **阶段 1 (现在)**: Python 后端全功能运行
2. **阶段 2**: `services/` 迁移到 `Server/python/`
3. **阶段 3**: `Server/rust/` Rust 重写 desktop-core，与 Python 并行
4. **阶段 4**: Rust 顶替 Python，`Server/python/` 冻结
5. **阶段 5**: `Server/center/` 启用，跑 Linux 中心 daemon

## License

私有项目，All Rights Reserved.
