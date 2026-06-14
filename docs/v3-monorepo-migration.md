# v3 Monorepo 迁移

> **状态**: 进行中 (阶段 1 — 目录划分)
> **作者**: Mavis
> **日期**: 2026-06-14
> **配套**: `docs/v3-rust-architecture.md`, `docs/v3-feature-matrix.md`

## 目标

把当前 `services/` + `apps/web/` + `infra/` 的混合结构, 重组成清晰的 `Server/` + `Client/` 双层架构, 为 v3 Rust 重写 + 中心 daemon 留好空间。

## 新结构

```
StudioArona/
├── Server/                  ← 后端 + 中心 (所有不跑在用户终端的代码)
│   ├── python/             ← 当前 Python 后端 (v2, 继续维护, 跟 Rust 双轨)
│   ├── rust/               ← v3 Rust 重写目标 (Phase 1)
│   │   └── crates/
│   │       ├── desktop-core/   单进程 Rust 顶替 5 个 Python/Node 服务
│   │       ├── protocol/       共享类型 (跟前端 codegen 同步)
│   │       ├── tauri-bridge/   Tauri commands 桥接
│   │       └── center-client/  桌面端调中心的 HTTP client
│   ├── center/             ← v3 Linux 中心 daemon (Phase 3)
│   └── protos/             ← 跨语言 API 契约
│
├── Client/                  ← 跑在用户终端的代码
│   ├── web/                ← 当前 React 18K + Vite SPA
│   └── tauri/              ← v3 Tauri 桌面壳 (Phase 2)
│
├── apps/                    ← 旧目录 (渐进废弃)
│   └── web/                (→ Client/web 软链)
│
├── services/                ← 旧目录 (渐进废弃)
│   ├── api-gateway         (→ Server/python/services/api-gateway)
│   ├── llm_gateway         (→ Server/python/services/llm_gateway)
│   ├── agent/bridge        (→ Server/python/services/agent-bridge)
│   ├── perception          (→ Server/python/services/perception)
│   └── weather_fetcher     (→ Server/python/services/weather-fetcher)
│
├── infra/                   ← 不变 (跨平台打包 / DB / docker / nginx)
│
├── packages/                ← 不变 (ui-kit workspace package)
│
├── docs/                    ← 不变 (设计文档)
│
├── start.py / start.sh     ← 改: 加 Server/Client 双启动路径
├── run.sh / run.bat        ← 改: 跨平台脚本从 Server/python/services 启动
└── .env.local              ← 不变
```

## 迁移阶段

### 阶段 1 (现在): 目录划分 + 文档
- ✅ 建 `Server/{python,rust,center,protos}` + `Client/{web,tauri}` 空目录
- ✅ 每个子目录加 README 说明职责 + 跟其他目录关系
- ⏳ 启动 Rust Cargo workspace 骨架 (4 个 crate stub)

### 阶段 2: 软链旧目录 (低风险)
- `Server/python/services/` ← symlink → `services/`
- `Client/web/` ← symlink → `apps/web/`
- 验证所有 watch / build 流程不破

### 阶段 3: 抽 API 契约
- `Server/protos/api.md` 从 OpenAPI + 实际抓的 endpoint 抽出来
- 加 CI check: 前端 types 跟 protos 同步

### 阶段 4 (v3 Phase 1): Rust 重写 desktop-core
- `Server/rust/Cargo.toml` workspace 起来
- `desktop-core` crate 顶替 api-gateway + llm_gateway + bridge + perception
- 跟 Python 双轨 1-2 周对比

### 阶段 5 (v3 Phase 1 末): Rust 顶替
- `Server/python/` 冻结
- `Server/rust/crates/desktop-core` 上线

### 阶段 6 (v3 Phase 2): Tauri 壳
- `Client/tauri/` 启用
- 跨平台打包 .dmg / .msi / .AppImage

### 阶段 7 (v3 Phase 3): 中心 daemon
- `Server/center/` 启用
- `Server/rust/crates/center-client` 调中心
- 反向 WebSocket 推送

## 风险

| 风险 | 缓解 |
|---|---|
| 软链在 Windows 上不工作 | `git mv` 真移动, 不用 symlink |
| 跨平台打包脚本路径 hardcode `services/` | 同时更新 `start.py` / `run.sh` / `run.bat` |
| CI / docs / IDE 引用旧路径 | 一次迁移, 全项目 grep + sed |
| Rust 重写期间 Python / Rust 双重维护 | 重叠期 ≤ 2 周, 灰度切换 |

## 验收

- [ ] 顶层 README.md 解释新结构
- [ ] `Server/` `Client/` 各子目录 README 写清楚
- [ ] `Server/rust/Cargo.toml` workspace 起来, `cargo metadata` 成功
- [ ] 4 个 crate stub 各自 `cargo build` 通过
- [ ] 当前 Python 后端从 `Server/python/services/` 启动仍正常
- [ ] 当前 React 前端从 `Client/web/` 启动仍正常
- [ ] 文档/script/IDE 全部引用新路径
