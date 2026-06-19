# Studio Arona Server

Studio Arona Server 是面向多个独立 Client 的中心服务。当前实现为单个 Rust axum daemon，负责认证、用户数据保存、信息源抓取、通知、系统状态和开发阶段的 VM 管理。

> 当前仍处于开发阶段。Server 可以编译并提供主要 CRUD，但 RSS 通知、智能变化摘要、自定义 Skill/Agent 配置同步、邮件验证和部分生产安全工作尚未完成。完整工作清单见 [WORK_REQUIREMENTS.md](./WORK_REQUIREMENTS.md)。

## 目录结构

```text
Server/
├── run.py                         一站式启动脚本
├── center/                        Rust axum 中心 daemon
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs                AppState、路由和启动流程
│       ├── auth.rs                JWT 与 bcrypt
│       ├── schedule.rs            日程 CRUD
│       ├── rss.rs                 RSS CRUD、抓取和 cron
│       ├── memory.rs              Memory CRUD
│       ├── skills.rs              Skill 市场安装记录
│       ├── page_monitor/           网页监控、内容规范化和 cron
│       ├── events.rs              SSE 事件流
│       ├── notifications.rs       站内通知与邮件降级
│       ├── email.rs               SMTP 发送
│       ├── safe_fetch.rs          信息源抓取安全边界
│       ├── vms.rs                 VM mock 操作
│       └── weather.rs             天气与系统指标
├── infra/
│   ├── compose/docker-compose.yml PostgreSQL 和 Redis
│   └── db/versions/               sqlx 迁移
├── services/ocr/                  可选 OCR 服务
└── WORK_REQUIREMENTS.md           后续实施与验收规范
```

## 架构

```text
Client :5173
    |
    | HTTP/JSON + JWT
    | SSE /api/events
    v
Rust Center :8080
    |
    +-- PostgreSQL :5432  用户与业务数据
    +-- Redis      :6379  已部署但尚未接入核心流程
    +-- SMTP              离线邮件，可选
    +-- Public Web/RSS    服务端定时抓取
```

Server 不运行 SonettoHere。SonettoHere 位于 `Client/services/sonetto`，由 Client 自己启动。Server 也不依赖根目录中的外部 SonettoHere clone。

## 快速启动

### 前置依赖

- Python 3
- Rust toolchain
- Docker Desktop 或兼容 Docker daemon
- 可用端口：8080、5432、6379

### 完整启动

```bash
cd Server
python3 run.py
```

该命令会：

1. 启动 `infra/compose/docker-compose.yml` 中的 PostgreSQL 与 Redis。
2. 构建并启动 `center`。
3. Server 启动时自动执行 `infra/db/versions/` 中的 sqlx migrations。

默认监听：`http://127.0.0.1:8080`。

开发数据库为空时，当前代码会创建 `admin / admin123`。这是开发行为，不适合生产部署，后续必须按工作规范移除或改为显式开关。

### 常用命令

```bash
cd Server

python3 run.py                 # Docker + Center
python3 run.py --no-docker     # PG/Redis 已经运行
python3 run.py --build         # 只构建 Center
python3 run.py --daemon        # 后台运行，日志写入 .run-logs/
python3 run.py --stop          # 停止 Center、OCR 和 Docker 服务
python3 run.py --logs          # 查看运行日志
python3 run.py --ocr           # 同时启动 Server OCR :8083
python3 run.py --download-ocr  # 下载 OCR 资源
```

直接运行 Rust daemon：

```bash
cd Server/center
cargo run
```

## 服务端口

| 端口 | 服务 | 状态 |
|---:|---|---|
| 8080 | Rust Center HTTP/SSE | 默认启用 |
| 8083 | OCR FastAPI | 仅 `--ocr` 启用 |
| 5432 | PostgreSQL 16 | Docker Compose |
| 6379 | Redis 7 | Docker Compose，核心流程尚未接入 |

## API 概览

除 `/health` 和当前的 `/api/weather` 外，用户业务 API 应通过 JWT 认证。部分系统管理接口仅允许 owner/admin。

### 认证与用户

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/register` | 注册 member 用户 |
| POST | `/api/auth/login` | 登录并返回 access/refresh token |
| POST | `/api/auth/refresh` | 刷新 token |
| GET | `/api/me` | 当前用户资料 |
| PATCH | `/api/me/notification-prefs` | 邮箱和邮件通知偏好 |

### 信息源

| 方法 | 路径 | 说明 |
|---|---|---|
| GET, POST | `/api/feeds` | RSS 列表与创建 |
| PATCH, DELETE | `/api/feeds/:id` | RSS 更新与删除 |
| GET | `/api/feeds/:id/items` | RSS 条目 |
| POST | `/api/feeds/:id/refresh` | 手动刷新 RSS |
| GET, POST | `/api/page-monitors` | 网页监控列表与创建 |
| PATCH, DELETE | `/api/page-monitors/:id` | 网页监控更新与删除 |
| GET | `/api/page-monitors/:id/events` | 网页变化历史 |
| POST | `/api/page-monitors/:id/check` | 手动检查网页 |

RSS 和网页 cron 默认每 900 秒运行一次，可分别通过环境变量调整。网页监控支持按记录设置 `check_interval_min`。

当前限制：

- 网页变化摘要只是正文预览，不是 LLM 变化摘要。
- RSS cron 会保存新条目，但尚未创建 SSE/邮件通知。
- 网页 cron 每轮最多串行处理 50 条。

### 用户数据

| 方法 | 路径 | 说明 |
|---|---|---|
| GET, POST | `/api/schedules` | 日程列表与创建 |
| GET, PATCH, DELETE | `/api/schedules/:id` | 单个日程 |
| GET, POST | `/api/memory/entries` | Memory 列表与创建 |
| PATCH, DELETE | `/api/memory/entries/:id` | Memory 更新与删除 |
| GET | `/api/skills/installed` | 已安装 Skill 元数据 |
| POST | `/api/skills/marketplace/install` | 安装市场 Skill 记录 |
| DELETE | `/api/skills/:slug` | 卸载 Skill 记录 |

当前 Skill API 只保存安装元数据，不能保存用户 Skill 的 `SKILL.md` 和附属文件。Provider、Persona、Tool、MCP 与 Agent secret 也尚未同步到 Server。

### 实时事件与通知

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/events` | 当前使用 query token 的 SSE 流 |
| GET | `/api/notifications` | 通知列表 |
| GET | `/api/notifications/unread-count` | 未读数 |
| POST | `/api/notifications/:id/read` | 标记已读 |
| POST | `/api/notifications/read-all` | 全部已读 |

SSE 事件按 `user_id` 过滤。当前 presence 只在连接时更新一次，邮件发送也尚未执行邮箱验证检查，这两项属于待修复问题。

### 系统与开发功能

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | liveness |
| GET | `/api/weather` | 天气 |
| GET | `/api/system/metrics` | 系统指标，仅 owner/admin |
| GET | `/api/system/cron-status` | cron 状态，当前待补认证 |
| GET | `/api/vms` | 当前用户 VM 列表 |
| POST | `/api/vms/:id/start` | mock 启动 |
| POST | `/api/vms/:id/stop` | mock 停止 |
| POST | `/api/vms/:id/restart` | mock 重启 |

VM 操作只更新数据库状态，不会调用 libvirt、VirtualBox 或其他 hypervisor。

## 数据与用户隔离

以下表当前通过 `user_id` 外键归属用户：

- `feeds`
- `schedules`
- `memory_entries`
- `vms`
- `nas_files`
- `skills`
- `page_monitors`
- `notifications`
- `presence`

业务 CRUD 大体使用 JWT 中的用户 ID 过滤。新增接口必须继续遵循以下规则：

- 不接受请求体提供的可信 `user_id`。
- 单项读写必须同时匹配资源 ID 与认证用户 ID。
- 子资源必须先验证父资源所有权。
- 跨用户管理能力必须显式授权，不得依赖“知道 UUID”。

## 数据库迁移

迁移由 Server 启动时自动执行：

```rust
sqlx::migrate!("../infra/db/versions")
```

新增 schema：

1. 在 `Server/infra/db/versions/` 新建时间戳或递增编号 SQL 文件。
2. 只追加迁移，不修改已经发布的迁移。
3. 从空数据库和现有数据库分别验证。

本项目不使用 Alembic，也没有手动 Makefile 迁移命令。

## 环境变量

Server 可从运行环境和 `Server/.env.local` 获取配置。

| 变量 | 默认值 | 说明 |
|---|---|---|
| `CENTER_PORT` | `8080` | HTTP 端口 |
| `DATABASE_URL` | 本地 javis PostgreSQL | PostgreSQL 连接 |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Redis 连接，当前未实际使用 |
| `JWT_SECRET` | 开发默认值 | JWT secret，生产必须覆盖 |
| `JWT_EXPIRES_IN` | `1800` | access token 秒数 |
| `REFRESH_EXPIRES_IN` | `2592000` | refresh token 秒数 |
| `RSS_CRON_INTERVAL_SECS` | `900` | RSS cron 周期 |
| `PAGE_MONITOR_CRON_INTERVAL_SECS` | `900` | 网页 cron 周期 |
| `WEATHER_API_KEY` | 空 | OpenWeatherMap key；为空时使用 wttr.in |
| `SMTP_HOST` | 空 | SMTP host；为空则邮件功能关闭 |
| `SMTP_PORT` | `587` | SMTP 端口 |
| `SMTP_USER` | 空 | SMTP 用户 |
| `SMTP_PASSWORD` | 空 | SMTP 密码 |
| `SMTP_FROM` | Studio Arona 本地地址 | 发件人 |

生产部署不能依赖默认 JWT secret、默认管理员、任意 CORS 或未验证邮箱。具体整改要求见 [WORK_REQUIREMENTS.md](./WORK_REQUIREMENTS.md)。

## 测试与质量检查

```bash
cd Server/center

cargo fmt --check
cargo test
cargo clippy --all-targets -- -D warnings
cargo build

cd ..
python3 -m py_compile run.py
```

当前基线：

- `cargo build` 通过。
- `run.py` 语法检查通过。
- `cargo test` 目前 22 项中 1 项失败：`http://[::1]/` 未被 SSRF guard 拒绝。
- 严格 Clippy 当前不通过。
- 尚无 PostgreSQL 多用户隔离和完整监控链路集成测试。

在上述基线问题修复前，不应把 Server 标记为生产就绪。

## 后续开发

另一个 Agent 开发时应以 [WORK_REQUIREMENTS.md](./WORK_REQUIREMENTS.md) 为唯一详细任务清单。该文档包含：

- P0-P3 优先级。
- API 与数据模型要求。
- RSS/网页监控和摘要闭环。
- Skill 与 Sonetto 配置同步。
- SSE、邮件、重试和多实例设计。
- 自动化测试与最终验收标准。

## License

私有项目，All Rights Reserved.
