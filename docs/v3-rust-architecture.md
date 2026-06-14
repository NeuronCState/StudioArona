# StudioArona v3 — Rust 重构 + 中心-边缘架构

> **状态**: 计划中
> **作者**: Mavis
> **日期**: 2026-06-13
> **目标**: 把当前的 Python/Node/多 docker 服务架构重写为单一 Rust 二进制, 跨平台打包,
>         并把"协作能力"剥离到可选的 Linux 中心 daemon。
>
> **数据存储决策 (2026-06-13)**: 桌面 app 仍用 PG + Redis, **不切 SQLite**。理由:
> PG 本来就是为多用户/事务设计, 中心 daemon 也用同一份 PG, 没必要为单机多写一套 schema。
> Redis 同样保留, cache/queue 场景无可替代。**Phase 0 取消**。

---

## 1. 背景与动机

### 1.1 当前架构痛点

| 痛点 | 现状 | 影响 |
|---|---|---|
| **服务多互相依赖** | 7+ 进程: postgres/redis/api-gateway/bridge/llm-gateway/perception/rss-fetcher/web-watcher/weather_fetcher | 任一挂整体降级, watchdog 难写全 |
| **多语言栈** | Python (12K) + Node (3.5K) + React (18K) | 心智负担, 部署复杂 |
| **离线无解** | 必须连工作室 LAN 才能用部分功能 | 出差/家里完全没法用 |
| **打包困难** | 跨平台要分 mac/win/linux 三套 docker 部署 | 工作室成员自助装机门槛高 |
| **PG/Redis 仍依赖 docker** | docker compose 跑 PG/Redis | macOS Docker Desktop 不稳 |

### 1.2 新架构目标

- **桌面 app**: 双击启动, 自包含, 跨 3 平台
- **离线可用**: 没中心时, 整个 app 仍能用 (聊天 / 记忆 / 技能 / 日程 / 个人 RSS)
- **中心可选**: 工作室 Linux 跑中心 daemon, 桌面连接后激活协作功能
- **首次注册必须连中心**: 用户数据存中心 (Linux 上的 PG), 桌面是 thin client
- **无中心时降级**: 没中心 = 个人智能看台 + agent, 自带模型供应商配置
- **数据存储**: **保留 PG + Redis**, 不切 SQLite。中心 daemon 和桌面 app 共用同一个 PG。

---

## 2. 目标架构

### 2.1 总体示意

```
┌─────────────────────────────────────────────────────────────┐
│  StudioArona Desktop App (Tauri + Rust)                       │
│  安装: macOS .dmg / Windows .msi / Linux .AppImage            │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Frontend (React 18K, 不动) — Vite build 静态文件        │ │
│  └─────────────────────────────────────────────────────────┘ │
│                              ↕ 内部 RPC (Tauri commands)        │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Rust core (单进程, tokio runtime)                       │ │
│  │                                                          │ │
│  │  • axum HTTP server (本地 API + 静态资源)               │ │
│  │  • LLM Gateway (reqwest + tokio-stream)                  │ │
│  │  • 聊天 SSE (本地)                                       │ │
│  │  • RSS 抓取 + 全文抽取 (scraper + html5ever)             │ │
│  │  • 邮件通知 (lettre, 纯 Rust SMTP)                       │ │
│  │  • 后台 tasks: weather, perception, rss-poll            │ │
│  │  • 中心客户端: 自动探测 + 反向 WebSocket                 │ │
│  │  • local cache: moka (in-process) — 替代部分 Redis 场景 │ │
│  │  • 离线模式 SQLite: 用户态记忆/草稿 (可选)               │ │
│  └─────────────────────────────────────────────────────────┘ │
│                              ↕ 可选, 探测 + 短 JWT              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  工作室 Linux 中心 (独立 daemon, 跑在 docker 里的 PG)    │ │
│  │                                                          │ │
│  │  • PG + Redis (现状保留, 单一数据源)                     │ │
│  │  • NAS 用户系统 (跨用户共享数据)                          │ │
│  │  • HomeAssistant 网关 (LAN 设备控制)                      │ │
│  │  • VM 编排 (libvirt / VirtualBox API)                    │ │
│  │  • 摄像头 / 人脸识别 (ONNX Runtime)                      │ │
│  │  • 全局 RSS 聚合 + 跨用户通知                            │ │
│  │  • 跨桌面 app 状态同步                                   │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**关于 PG/Redis**:
- **中心 daemon 模式**: 桌面 app 连中心, 用中心的 PG
- **离线模式 (无中心)**: 桌面 app 自带轻量替代 — `moka` (内存 LRU) 替代 Redis, **PG 数据走本地缓存** (近期访问的 user/memory/skills 留在本地)
- **为什么不用 SQLite**: 单机用户态草稿/记忆可放 SQLite, 但用户主数据还在中心 PG, 两套 schema 维护成本高
- **离线写入处理**: 离线时用户编辑的记忆/技能 → 写本地 SQLite → 重连中心时同步 (冲突由中心 last-write-wins)

### 2.2 两种运行模式

#### 模式 A: **离线 (Local Only)**
无中心 daemon, 或探测不到。**功能**:
- 聊天 (LLM API, 用户自配 API key)
- 个人记忆 / 技能 / 日程 (本地缓存 + 离线草稿进 SQLite)
- 个人 RSS 订阅 (本地抓取)
- 邮件通知 (本地配置 SMTP)
- 知识库 (本地 embedding)
- 截图 / 语音输入 (本地)
- 系统监控 (本地)

**用户**:
- 第一次启动时, app 检测不到中心 → 提示"无中心, 创建本地账户"
- 创建本地账户 → 写入本地 SQLite
- 自己配 LLM provider (OpenAI/MiniMax/Anthropic/Ollama)
- **完整个人智能助手体验**, 不依赖任何外部服务
- 离线产生的修改暂存本地, 重连中心时同步

#### 模式 B: **连接中心 (Center Connected)**
探测到 Linux 中心 daemon。**额外功能** (在 A 之上):
- 走中心 PG 认证 (统一账号)
- HomeAssistant 设备控制
- 工作室 VM 创建/管理
- 摄像头 / 人脸识别
- 跨用户共享 RSS
- 跨用户通知 (admin 群发)
- 协作编辑 (skills, memory)
- 全局任务调度 (cron)

### 2.3 首次注册流程

```
Desktop App 启动
   ↓
探测 Linux 中心 (HTTP GET /health, 5s timeout)
   ↓
┌─────────────────────┬──────────────────────────┐
│ 探测到              │ 没探测到                  │
│                     │                          │
│ POST /center/       │ 提示: "未连接工作室"        │
│   register          │  → 询问:                  │
│   (中心管理员        │     a) 重试连接            │
│   预批 invite)       │     b) 跳过, 仅本地模式    │
│                     │                          │
│ 中心返回 user_token │ 选 b → 创建本地账户        │
│ (JWT, 7d) +         │  → 写入本地 SQLite        │
│ 中心 user_id        │  → 配置 LLM provider     │
│                     │  → 引导"如何自助搭中心"    │
│ 本地记录            │                          │
│ center_url + token  │                          │
│                     │                          │
│ 拉取该用户的        │ 之后任何时候可重连中心      │
│ skills/memory/vms   │  → 提示"迁移到工作室?"    │
│ 到本地缓存          │  → 合并本地草稿到中心 PG  │
└─────────────────────┴──────────────────────────┘
```

### 2.4 中心 daemon 接口

桌面 ↔ 中心用 **HTTP + JWT**:

```
桌面 → 中心:
  GET  /health                    健康检查
  POST /api/center/register       注册/重连 (带 invite code)
  GET  /api/users/me              获取用户信息
  GET  /api/users/me/skills       跨用户共享技能
  POST /api/users/me/memory       同步记忆
  GET  /api/vms                   列出工作室 VM
  POST /api/vms                   创建 VM
  GET  /api/homeassistant/*       HA 设备列表 + 控制
  GET  /api/notifications         收件箱
  POST /api/notifications/stream  SSE 长连接 (反向)

中心 → 桌面 (反向 WebSocket):
  ha_event        HomeAssistant 事件推送
  notification     新通知推送
  vm_status        VM 状态变化
  rss_update       全局 RSS 更新
```

桌面 app **必须**实现: 这套接口的 client, **就算探测不到中心也能启动** (degraded mode)。

---

## 3. 阶段计划

### Phase 1: Rust 后端重写 (4-6 周)

**目标**: 12K Python + 3.5K Node → 7-8K Rust (单进程)

**Rust crate 选型**:
| 功能 | crate |
|---|---|
| HTTP server | `axum` 0.7+ |
| Async runtime | `tokio` 1+ |
| HTTP client (LLM API / 中心) | `reqwest` |
| SSE streaming | `axum::response::sse` |
| WebSocket | `axum::extract::ws` |
| PG 异步 (中心模式) | `sqlx` (postgres feature) + `tokio` |
| PG 池 (中心模式) | `deadpool-postgres` 或 `sqlx::PgPool` |
| 内存 cache (离线模式) | `moka` (替代 Redis 部分场景) |
| SQLite (离线草稿) | `rusqlite` + `tokio-rusqlite` |
| JSON | `serde` + `serde_json` |
| JWT | `jsonwebtoken` |
| 密码 hash | `argon2` |
| HTML 解析 | `scraper` + `html5ever` (Readability 移植) |
| SMTP 邮件 | `lettre` |
| RSS | `rss` + `atom_syndication` |
| 时间 | `chrono` + `time` |
| 日志 | `tracing` + `tracing-subscriber` |
| 错误处理 | `thiserror` + `anyhow` |
| 配置 | `config` + `figment` |
| 打包 | `cargo tauri build` |

**重写顺序** (按依赖关系):
1. **Week 1-2**: axum 路由 + SQLx (PG 模式) + JWT auth + user CRUD
2. **Week 2-3**: LLM Gateway (reqwest + SSE streaming) + thinking 过滤
3. **Week 3-4**: 聊天 SSE (本地) + 记忆 / 技能 / 日程 CRUD
4. **Week 4-5**: RSS 抓取 + 全文抽取 + 邮件通知
5. **Week 5-6**: 中心客户端 (HTTP client) + 探测 + 降级 UI + 离线模式

**关键决策**:
- **不追求 1:1 移植** — Rust 类型系统会逼你砍掉 Python boilerplate, 这是好事
- **保留所有外部接口** — 前端代码完全不动, API contract 不变
- **后台 tasks 用 tokio::spawn** — 不再用 Python `asyncio.create_task`
- **错误处理用 `Result<T, AppError>`** — 比 Python exception 安全
- **PG 仍用 alembic 风格 migrations** — SQLx 自带 migrate 工具
- **离线 cache 用 moka** (LRU + TTL) — 不引外部依赖
- **离线草稿用 SQLite** — 写本地, 重连同步

**风险**:
- 高 — 工作量大, 期间无功能增量
- 缓解: 灰度上线, 保留 Python 版 fallback

**验收**:
- 单元测试覆盖核心模块
- 集成测试: 所有 API 端点行为与 Python 版一致
- 性能: 启动时间 < 2s, 内存 < 200MB (vs Python 12K 行的 ~500MB)

### Phase 2: Tauri 壳 + 打包 (2 周)

**目标**: 桌面 app 跨平台打包

| 任务 | 时间 |
|---|---|
| Tauri 项目初始化 + 前端集成 | 2 天 |
| Tauri commands 桥接 (前端 → Rust API) | 1 天 |
| 静态资源打包 (前端 dist → Tauri assets) | 1 天 |
| 系统托盘 + 自动启动 | 2 天 |
| 系统通知 (cross-platform) | 1 天 |
| macOS .dmg 打包 | 1 天 |
| Windows .msi 打包 | 1 天 |
| Linux .AppImage + .deb 打包 | 1 天 |
| 自动更新 (Tauri updater) | 2 天 |

**风险**: 中 — 跨平台打包配置坑多, 签名麻烦

**验收**:
- macOS: 双击 .dmg 拖入 Applications, 双击启动 ✓
- Windows: 双击 .msi 安装, 开始菜单启动 ✓
- Linux: chmod +x AppImage, 双击运行 ✓
- 自动更新: 推新版本后, app 内弹通知

### Phase 3: Linux 中心 daemon (2 周)

**目标**: 工作室 Linux 跑中心, 提供协作能力

| 任务 | 时间 |
|---|---|
| 中心 daemon 骨架 (axum + tokio + sqlx PG) | 2 天 |
| NAS 用户系统 (CRUD + 权限) | 2 天 |
| HomeAssistant 网关 (long-lived API client) | 2 天 |
| VM 编排 (libvirt/vbox 集成) | 2 天 |
| 摄像头 / 人脸识别 (ONNX Runtime) | 3 天 (可选) |
| 跨用户 RSS + 通知 | 2 天 |
| 反向 WebSocket (推送到桌面) | 2 天 |
| systemd unit 文件 (开机自启) | 1 天 |

**部署**: 单独 `studioarona-center` 二进制 + systemd 服务, 监听 9000 端口
**数据存储**: 中心 daemon 用现有的 docker PG + Redis (共享同一份数据库)

**风险**: 中 — 摄像头/人脸识别如果做会拖时间, 可作 v3.1 后置

**验收**:
- 中心 daemon 在 Linux 工作站开机自启
- 桌面 app 启动后自动连接, 激活协作 UI
- 中心 down 后, 桌面 app 自动降级

---

## 4. 工作量与里程碑

| 阶段 | 时间 | 累计 | 关键交付 |
|---|---|---|---|
| Phase 1 | 4-6 周 | 4-6 周 | Rust 后端, 跑通所有 API |
| Phase 2 | 2 周 | 6-8 周 | 桌面 app 跨平台打包 |
| Phase 3 | 2 周 | 8-10 周 | 中心 daemon + 协作功能 |
| **总计** | **8-10 周** | | 完整 v3 架构 |

**前提假设**: 1 人全职 Rust 经验中等, 或 0 经验 + 1 个 Rust 老手带 2 周。

---

## 5. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| **Rust 学习曲线** | Phase 1 延期 | 雇 Rust 老手 2 周带, 用 `cargo clippy` + `cargo fmt` 强约束 |
| **工期太长无功能增量** | 团队士气 / 业务停滞 | 每 2 周 release 一个 phase 切片, 别 all-or-nothing |
| **Tauri 打包签名** | Phase 2 延期 | macOS 需 Apple Developer ID ($99/y), Windows 需 EV 证书 (~$300/y); 早期先用未签名 + 用户手动 trust |
| **中心 daemon 部署复杂** | Phase 3 延期 | 单一 Rust 二进制 + systemd, 跟桌面 app 同源 |
| **现有数据迁移** | 用户流失 | 提供 export/import, 让用户在新版本启动时手动迁移 |
| **PG/Redis 仍依赖 docker** | 部分痛点遗留 | 中心 daemon 自己跑 docker compose, 桌面 app 不依赖; 中心如果挂了降级用本地 cache |

---

## 6. 双轨期策略 (Phase 1 期间)

Phase 1 期间, **保留 Python 版作为 fallback**:

```
部署时:
  - rust 版监听 :8081 (新端口, 不冲突)
  - python 版继续监听 :8080 (旧)

用户切换:
  - nginx / 前端 env: VITE_API_BASE=/api 指向 rust 版
  - 出问题: 一行 env 切回 python 版

降级开关:
  - 桌面 app 启动时探测 rust 后端健康
  - 不健康 → 弹"用旧版?"按钮
```

这样 Phase 1 期间**任何时候都能回退**, 不冒险。

---

## 7. 不在 v3 范围内 (明确)

| 功能 | 状态 |
|---|---|
| OpenClaw 兼容 | ❌ 已废弃, 不支持 |
| 实时多用户同步 (Google Docs 式) | ❌ 推后 v4 |
| 移动端 app (iOS/Android) | ❌ 推后 v4 (Tauri 2 mobile) |
| 视频通话 / WebRTC | ❌ 推后 v4 |
| 公网部署 (对外发布) | ❌ 仅局域网 |
| 切 SQLite 替代 PG | ❌ 保留 PG, 中心 daemon 用同一份 |

---

## 8. 验收清单 (Phase 1 完成时)

- [ ] Rust 后端编译, 启动 < 2s
- [ ] 内存占用 < 200MB
- [ ] 所有现有 API 端点行为与 Python 版一致 (集成测试覆盖)
- [ ] 单进程跑所有 task (LLM/RSS/perception/weather)
- [ ] 桌面 app 双击启动, 离线模式完整可用 (含本地 cache)
- [ ] 中心 daemon 在 Linux 开机自启
- [ ] macOS .dmg + Windows .msi + Linux .AppImage 三平台打包成功
- [ ] 自动更新流程跑通
- [ ] 旧 Python 版可作为 fallback 切换

---

## 9. 立即可做 (本周)

| 任务 | 时间 | 谁做 |
|---|---|---|
| 列出 Rust crate 清单 + 各自在哪个 phase 用 | 半天 | Mavis |
| 选第一个要重写的 Python 模块 (推荐 LLM Gateway) | 半天 | 你 |
| 把 watchdog 修全 (perception + api-gateway) | 半天 | Mavis |
| 重置 watchdog ports 配置文件 (避免再漏) | 1 小时 | Mavis |

---

## 10. 参考

- [Tauri docs](https://tauri.app/start/) — Rust + Web 桌面框架
- [axum](https://docs.rs/axum/) — Rust HTTP 框架
- [sqlx](https://github.com/launchbadge/sqlx) — 编译时 SQL 检查的 Rust ORM
- [lettre](https://github.com/lettre/lettre) — Rust SMTP client
- [scraper](https://github.com/causal-agent/scraper) — Rust HTML 解析 (Readability 移植基础)
- [moka](https://github.com/moka-rs/moka) — Rust 内存 cache
- 当前架构 docs: `docs/multi-user-hermes.md`, `docs/email-notifier.md`
- v2 设计: `docs/2026-05-22_冲刺设计`
