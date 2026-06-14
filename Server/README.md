# Server/

后端 + 协作中心 (v3) — 所有不直接跑在用户终端上的代码。

```
Server/
├── python/    当前 Python 后端 (api-gateway / llm_gateway / agent/bridge / weather_fetcher / perception)
│              跟 v3 Rust 重写双轨运行, 灰度切换
├── rust/      v3 Rust 重写目标 (Phase 1)
│              Cargo workspace: desktop-core (单进程 Rust) / protocol (共享类型) / tauri-bridge
├── center/    v3 Linux 中心 daemon (Phase 3)
│              工作室 PG + Redis + NAS/VM/HA 协作能力
└── protos/    跨语言 API 契约 (REST 路径 + JSON schema)
               前后端 + 中心客户端共用
```

## 迁移计划

1. **阶段 1 (现在)**: 建空目录 + 文档
2. **阶段 2**: 把 `services/` 软链/迁移到 `Server/python/` (不复制, symlink 起步)
3. **阶段 3**: `Server/rust/Cargo.toml` workspace 起来, 4 个 crate stub 写 hello-world
4. **阶段 4**: `protos/api.md` 抽出来 (从 OpenAPI + 实际抓的 endpoint 列表)
5. **阶段 5 (v3 Phase 1)**: Rust 重写 desktop-core, 跟 Python 并行跑 1-2 周
6. **阶段 6**: Rust 顶替 Python, `Server/python/` 冻结
7. **阶段 7 (v3 Phase 3)**: `Server/center/` 启用, 跑 Linux 中心

## 不在本目录

- 前端 React 代码 → `Client/web/`
- Tauri 壳 (Phase 2) → `Client/tauri/`
- 跨平台打包脚本 → `infra/`
- 数据库 migrations → `infra/db/`
- 共享类型 (Rust + TS 同步) → `Server/rust/crates/protocol/` (Rust) + 后续 codegen 到 TS
