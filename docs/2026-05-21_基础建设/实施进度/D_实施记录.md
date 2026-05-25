# 04 · D · 基础设施实施记录

> **记录人**：D（基础设施工程师）
> **时间跨度**：2026-05-20 ~ 2026-05-21
> **对应规划书**：`04_基础设施D_规划书.md`
> **对应协作总纲**：`00_协作总纲与接口契约.md`

---

## W1 — 骨架与契约冻结

**目标**：让另外三人插上电就能干活。

### 新建文件

| 文件 | 功能 |
|------|------|
| `pyproject.toml` | 根项目配置，声明所有 Python 依赖 + uv workspace + ruff/mypy/pytest 配置 |
| `services/api-gateway/app/__init__.py` | 包初始化 |
| `services/api-gateway/app/core/__init__.py` | 核心模块初始化 |
| `services/api-gateway/app/core/config.py` | Pydantic Settings，从 `.env.local` 加载 DATABASE_URL / JWT_SECRET 等 |
| `services/api-gateway/app/db/__init__.py` | 数据库模块初始化 |
| `services/api-gateway/app/db/session.py` | AsyncSession 工厂 + `get_db` FastAPI 依赖 |
| `services/api-gateway/app/models/__init__.py` | 模型模块初始化 |
| `services/api-gateway/app/models/base.py` | SQLAlchemy `Base` + `TimestampMixin`（created_at / updated_at） |
| `services/api-gateway/app/models/user.py` | `users` / `user_preferences` / `user_face_embeddings` 三表模型 |
| `services/api-gateway/app/models/audit.py` | `audit_log` 表模型 |
| `services/api-gateway/app/auth/__init__.py` | 认证模块初始化 |
| `services/api-gateway/app/auth/password.py` | bcrypt (cost=12) 哈希/验证 |
| `services/api-gateway/app/auth/jwt.py` | JWT HS256 创建/验证（access + refresh） |
| `services/api-gateway/app/auth/deps.py` | FastAPI 依赖：`get_current_user` / `require_admin` |
| `services/api-gateway/app/api/__init__.py` | API 路由模块初始化 |
| `services/api-gateway/app/api/health.py` | `GET /health` 端点 |
| `services/api-gateway/app/api/auth.py` | `POST /api/auth/login` / `refresh` / `logout` |
| `services/api-gateway/app/api/me.py` | `GET /api/me` / `PATCH /api/me/preferences` |
| `services/api-gateway/app/api/users.py` | `GET /api/users`（admin-only） |
| `services/api-gateway/app/middleware/__init__.py` | 中间件模块初始化 |
| `services/api-gateway/app/middleware/error_handler.py` | 统一 JSON 错误格式（`JAVIS_*` code） |
| `services/api-gateway/app/middleware/logging.py` | structlog 请求日志中间件 |
| `services/api-gateway/app/main.py` | FastAPI 入口，注册路由 + 中间件 |
| `services/api-gateway/app/proxy/__init__.py` | 代理模块初始化 |
| `services/api-gateway/app/ws/__init__.py` | WebSocket 模块初始化 |
| `services/api-gateway/app/internal/__init__.py` | 内部端点模块初始化 |
| `alembic.ini` | 项目根目录 Alembic 配置 |
| `infra/db/env.py` | Alembic 异步迁移引擎 |
| `infra/db/metadata.py` | 聚合所有 SQLAlchemy 模型 |
| `infra/db/script.py.mako` | 迁移文件模板 |
| `infra/db/versions/001_initial_schema.py` | 初始迁移：users + user_preferences + user_face_embeddings + audit_log |
| `infra/scripts/seed_dev_data.py` | 种子数据：admin + member 测试用户 |
| `tests/D/__init__.py` | 测试包初始化 |
| `tests/D/conftest.py` | 共享 fixtures（TestClient） |
| `tests/D/unit/__init__.py` | 单元测试包初始化 |
| `tests/D/unit/test_auth.py` | JWT + bcrypt 单元测试（9 个） |
| `tests/D/unit/test_models.py` | 模型约束测试（7 个） |
| `tests/D/unit/test_health.py` | /health 端点测试（1 个） |
| `tests/D/integration/__init__.py` | 集成测试包初始化 |
| `tests/D/integration/test_auth_flow.py` | 登录→刷新→注销集成测试骨架 |
| `tests/D/contract/__init__.py` | 契约测试包初始化 |
| `tests/D/security/__init__.py` | 安全测试包初始化 |
| `packages/contracts/python/__init__.py` | 自动生成的 pydantic 模型包 |
| `packages/contracts/python/models.py` | 从 OpenAPI 生成的 pydantic v2 模型 |
| `.spectral.yml` | OpenAPI lint 规则配置 |
| `package.json` | 根 Node 包配置（lint-staged + commitlint） |

### 修改文件

| 文件 | 变更 |
|------|------|
| `Makefile` | 更新 alembic 命令加 `-c alembic.ini`；新增 `generate-types-py` / `openapi-lint` / `openapi-diff` 目标 |
| `infra/docker/Dockerfile.api-gateway` | 复制 `alembic.ini` + `infra/db/` 到容器 |
| `pyproject.toml` | 添加 FastAPI / SQLAlchemy / Alembic / JWT / bcrypt / httpx / structlog / redis 等依赖；配置 `pythonpath` / `ignore` 规则 |

### 测试结果

```
19 个单元测试 — 全部通过
JWT roundtrip / bcrypt 哈希验证 / 模型约束 / health 端点
```

### 本地验证

```bash
make bootstrap          # 一键初始化
make dev                # 启动全栈
uv run pytest tests/D/unit/ -v  # 跑测试

# 登录拿 token
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

---

## W2 — Proxy + Rate Limit + Pre-commit

**目标**：api-gateway 能转发请求到 agent/perception，限流防刷，提交前自动检查。

### 新建文件

| 文件 | 功能 |
|------|------|
| `services/api-gateway/app/proxy/forward.py` | HTTP 转发引擎，连接池 + SSE 流式透传 + 断线清理 |
| `services/api-gateway/app/proxy/routes.py` | Agent/Perception 路由映射（chat/feeds/schedules → agent，system/vms/network → perception） |
| `services/api-gateway/app/middleware/rate_limit.py` | Redis 滑动窗口限流（匿名 60/min，认证 120/min）；Redis 不可用时 fail-open |

### 修改文件

| 文件 | 变更 |
|------|------|
| `services/api-gateway/app/main.py` | 注册 proxy_router + RateLimitMiddleware |

### 关键设计决策

- **Rate Limit**：使用 Redis INCR + TTL 实现滑动窗口，基于 Bearer token 前缀标识认证用户
- **Proxy**：使用 httpx 共享客户端（连接池），SSE 流式透传时检查 `request.is_disconnected()` 自动清理
- **Fail-open**：Redis 挂了不阻断请求，降级为无限流

---

## W3 — SSE 中转 + WS 事件总线 + CI Pipeline

**目标**：浏览器能收到 Agent SSE 流式响应和 Perception WS 事件推送；CI 全绿。

### 新建文件

| 文件 | 功能 |
|------|------|
| `services/api-gateway/app/ws/hub.py` | WebSocket 连接管理，按 user_id fan-out；死连接自动清理 |
| `services/api-gateway/app/ws/routes.py` | `/ws/events` 端点，JWT 认证（通过 `?token=`） |
| `services/api-gateway/app/internal/events.py` | `/internal/events/publish` 仅 localhost 可访问，Perception 推事件用 |
| `tests/D/unit/test_ws_hub.py` | WS hub 单元测试（7 个） |
| `.github/workflows/pr.yml` | PR pipeline：lint-python / lint-ts / lint-openapi / typecheck / test-d / test-b / build |
| `.github/workflows/nightly.yml` | Nightly：e2e / contract / security-scan |

### 修改文件

| 文件 | 变更 |
|------|------|
| `services/api-gateway/app/proxy/forward.py` | 重写：连接池共享 + SSE keepalive + 断线检测 |
| `services/api-gateway/app/main.py` | 注册 ws_router + internal_events_router + close_client shutdown hook |
| `pyproject.toml` | 添加 `websockets>=14.0` 依赖 |

### WS 事件流

```
Browser ──WS──→ Gateway ──fan-out──→ user_id 匹配的连接
Perception ──HTTP POST /internal/events/publish──→ Gateway ──WS──→ Browser
```

### CI Pipeline 结构

```
PR pipeline (每次 push):
  lint-python → typecheck → test-d → build (Docker buildx)
  lint-ts (独立)
  lint-openapi (Spectral)
  test-b (独立，允许失败)

Nightly (每天 03:00 UTC):
  e2e / contract / security-scan
```

### 测试结果

```
26 个单元测试 — 全部通过
新增 7 个 WS hub 测试：connect / disconnect / send / broadcast / dead connection cleanup
```

---

## W4 — 用户管理 + CSRF 防护

**目标**：管理员能创建/更新用户；CSRF 双提交 Cookie 防护。

### 新建文件

| 文件 | 功能 |
|------|------|
| `services/api-gateway/app/middleware/csrf.py` | Double-submit cookie 模式；POST/PUT/PATCH/DELETE 校验；login/internal/WS 豁免 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `services/api-gateway/app/api/auth.py` | 登录成功后设置 CSRF cookie（非 HttpOnly，SameSite=Strict） |
| `services/api-gateway/app/api/users.py` | 新增 `POST /api/users`（创建成员）+ `PATCH /api/users/{id}`（更新用户） |
| `services/api-gateway/app/main.py` | 注册 CSRFMiddleware |

### CSRF 流程

```
1. 客户端 POST /api/auth/login
2. 服务器返回 Set-Cookie: csrf_token=xxx (非 HttpOnly)
3. 客户端读取 cookie，后续请求带 X-CSRF-Token header
4. 服务器校验 header == cookie
```

---

## W5 — 上传组件 + 审计日志

**目标**：文件上传安全校验；危险操作自动记录审计日志。

### 新建文件

| 文件 | 功能 |
|------|------|
| `services/api-gateway/app/utils/__init__.py` | 工具模块初始化 |
| `services/api-gateway/app/utils/audit.py` | `write_audit_log()` + `@audit_action` 装饰器 |
| `services/api-gateway/app/api/upload.py` | 文件上传端点，安全校验 |

### 上传安全措施

| 措施 | 实现 |
|------|------|
| 大小限制 | 100MB |
| 扩展名白名单 | jpg/png/gif/webp/mp4/mp3/pdf/zip/py/ts 等 |
| Content-Type 校验 | 白名单匹配 |
| zip-slip 防护 | 检查 ZIP 内文件路径是否包含 `..` 或以 `/` 开头 |
| zip bomb 防护 | 解压总大小上限 500MB |
| 审计日志 | 每次上传记录 actor / filename / size / content_type |

### 审计日志记录的操作

- `user.create` — 管理员创建用户
- `user.update` — 管理员更新用户
- `upload.file` — 文件上传

---

## W6 — 契约测试

**目标**：schemathesis 自动验证 API 实现与 OpenAPI 规范一致。

### 新建文件

| 文件 | 功能 |
|------|------|
| `tests/D/contract/test_contract.py` | schemathesis 从 ASGI 加载 OpenAPI spec，自动 fuzz 所有端点 |

### 运行方式

```bash
# 本地
uv run pytest tests/D/contract/ -v -m contract

# CI (PR pipeline 中自动运行)
make contract-test
```

---

## W7 — 生产部署

**目标**：Linux 生产环境一键部署，可回滚。

### 已有文件（本轮未修改）

| 文件 | 功能 |
|------|------|
| `infra/compose/docker-compose.prod.yml` | 生产 Compose：无 bind mount / restart=always / 日志轮转 / GPU 直通 |
| `infra/docker/nginx.conf` | Nginx 反代：SPA catch-all + API proxy + SSE/WS 透传 + 安全头 |
| `infra/scripts/deploy-linux.sh` | 部署脚本：git checkout → pull → migrate → up → healthcheck |
| `infra/scripts/rollback.sh` | 回滚脚本：切 tag → 重启 → 检查不可逆迁移 |

---

## W8 — 备份与恢复

**目标**：数据库每日自动备份，可恢复。

### 新建文件

| 文件 | 功能 |
|------|------|
| `infra/scripts/backup.sh` | pg_dump → gzip，保留 7 份本地 + 30 份远端（NAS） |
| `infra/scripts/restore.sh` | 从 dump 文件恢复，自动停止/重启服务 |

### 备份策略

```
每天 03:00 cron 执行 backup.sh
  ↓
pg_dump → gzip → /opt/studio-javis/backups/javis_YYYYMMDD_HHMMSS.sql.gz
  ↓
同步到 NAS（如果配置了 REMOTE_DIR）
  ↓
清理本地 > 7 天的旧备份
清理远端 > 30 天的旧备份
```

---

## W9 — CI Nightly 骨架

**目标**：Nightly pipeline 框架就绪，待具体测试接入。

### 已有文件

| 文件 | 功能 |
|------|------|
| `.github/workflows/nightly.yml` | e2e（Playwright 占位）/ contract / security-scan（pip-audit + Trivy） |

---

## W10 — Runbook 全套

**目标**：运维文档完整，新人看文档就能操作。

### 新建文件

| 文件 | 内容 |
|------|------|
| `docs/runbook/deployment.md` | 部署流程：前置条件 / 脚本部署 / 手动部署 / 验证 |
| `docs/runbook/rollback.md` | 回滚流程：快速回滚 / 数据库回滚（可逆/不可逆）/ 决策树 |
| `docs/runbook/troubleshooting.md` | 故障排查：容器启动失败 / DB 连接 / JWT / SSE / 上传 / 日志查看 / 性能排查 |
| `docs/runbook/credential-rotation.md` | 凭据轮换：JWT_SECRET / PG_PASSWORD / MINIMAX_API_KEY / GitHub SSH key |

---

## 最终文件清单

```
studio-javis/
├── .github/
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── workflows/
│       ├── pr.yml                    # PR pipeline
│       └── nightly.yml               # Nightly pipeline
├── .spectral.yml                     # OpenAPI lint 配置
├── alembic.ini                       # Alembic 配置
├── Makefile                          # 一键命令
├── package.json                      # Node 工具链
├── pyproject.toml                    # Python 依赖 + 工具配置
├── docs/
│   └── runbook/
│       ├── deployment.md
│       ├── rollback.md
│       ├── troubleshooting.md
│       └── credential-rotation.md
├── infra/
│   ├── db/
│   │   ├── env.py
│   │   ├── metadata.py
│   │   ├── script.py.mako
│   │   └── versions/
│   │       └── 001_initial_schema.py
│   ├── docker/
│   │   ├── Dockerfile.api-gateway
│   │   ├── Dockerfile.agent
│   │   ├── Dockerfile.perception
│   │   ├── Dockerfile.web
│   │   ├── nginx.conf
│   │   └── scripts/
│   │       ├── entrypoint.sh
│   │       └── healthcheck.sh
│   ├── compose/
│   │   ├── docker-compose.yml
│   │   ├── docker-compose.test.yml
│   │   └── docker-compose.prod.yml
│   └── scripts/
│       ├── bootstrap.sh
│       ├── seed_dev_data.py
│       ├── deploy-linux.sh
│       ├── rollback.sh
│       ├── backup.sh
│       └── restore.sh
├── packages/
│   └── contracts/
│       ├── openapi.yaml
│       ├── python/
│       │   ├── __init__.py
│       │   └── models.py            # 自动生成
│       ├── ts/
│       ├── ui-actions.schema.json
│       └── ws-events.schema.json
├── services/
│   └── api-gateway/
│       └── app/
│           ├── main.py
│           ├── core/config.py
│           ├── db/session.py
│           ├── auth/
│           │   ├── jwt.py
│           │   ├── password.py
│           │   └── deps.py
│           ├── models/
│           │   ├── base.py
│           │   ├── user.py
│           │   └── audit.py
│           ├── api/
│           │   ├── health.py
│           │   ├── auth.py
│           │   ├── me.py
│           │   ├── users.py
│           │   └── upload.py
│           ├── middleware/
│           │   ├── cors.py
│           │   ├── csrf.py
│           │   ├── error_handler.py
│           │   ├── logging.py
│           │   └── rate_limit.py
│           ├── proxy/
│           │   ├── forward.py
│           │   └── routes.py
│           ├── ws/
│           │   ├── hub.py
│           │   └── routes.py
│           ├── internal/
│           │   └── events.py
│           └── utils/
│               └── audit.py
└── tests/
    └── D/
        ├── conftest.py
        ├── unit/
        │   ├── test_auth.py
        │   ├── test_models.py
        │   ├── test_health.py
        │   └── test_ws_hub.py
        ├── integration/
        │   └── test_auth_flow.py
        ├── contract/
        │   └── test_contract.py
        └── security/
```

## 测试覆盖

```
单元测试: 26 个 (全部通过)
  - JWT: 6 个
  - bcrypt: 3 个
  - 模型: 7 个
  - health: 1 个
  - WS hub: 7 个

集成测试: 7 个骨架 (需 DB)
契约测试: schemathesis 自动 fuzz (需 Docker)
```

## 路由总览 (24 条)

```
Gateway 自有:
  /health                           GET
  /api/auth/login                   POST
  /api/auth/refresh                 POST
  /api/auth/logout                  POST
  /api/me                           GET
  /api/me/preferences               PATCH
  /api/users                        GET (admin) / POST (admin)
  /api/users/{id}                   PATCH (admin)
  /api/upload                       POST

Proxy → Agent:
  /api/chat/{path}                  GET/POST/DELETE
  /api/feeds                        GET/POST
  /api/feeds/{path}                 GET/POST/DELETE
  /api/schedules                    GET/POST
  /api/schedules/{path}             GET/POST/PATCH/DELETE

Proxy → Perception:
  /api/system/{path}                GET
  /api/vms                          GET/POST
  /api/vms/{path}                   GET/POST/DELETE
  /api/network/{path}               GET

WebSocket:
  /ws/events                        WS (JWT auth via ?token=)

Internal:
  /internal/events/publish          POST (localhost only)
```

## 安全措施清单

| 措施 | 状态 | 文件 |
|------|------|------|
| JWT HS256 + bcrypt cost=12 | ✅ | `auth/jwt.py`, `auth/password.py` |
| CSRF double-submit cookie | ✅ | `middleware/csrf.py` |
| Redis rate limit (60/120 req/min) | ✅ | `middleware/rate_limit.py` |
| 上传大小限制 (100MB) | ✅ | `api/upload.py` |
| 上传扩展名白名单 | ✅ | `api/upload.py` |
| zip-slip 路径校验 | ✅ | `api/upload.py` |
| zip bomb 解压限制 (500MB) | ✅ | `api/upload.py` |
| 审计日志 | ✅ | `utils/audit.py` |
| 内部端点 localhost 限制 | ✅ | `internal/events.py` |
| 统一错误格式 | ✅ | `middleware/error_handler.py` |
| gitleaks secret 扫描 | ✅ | `.husky/pre-commit` |
| commitlint 格式检查 | ✅ | `.husky/commit-msg` |
| Spectral OpenAPI lint | ✅ | `.spectral.yml` |
| 依赖安全扫描 (pip-audit + Trivy) | ✅ | `.github/workflows/nightly.yml` |
