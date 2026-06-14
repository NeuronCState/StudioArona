# Server/rust

v3 Rust 重写目标 (Phase 1, 4-6 周)。

## Crates

```
Server/rust/
├── Cargo.toml          workspace root (见本目录)
├── crates/
│   ├── desktop-core/   桌面 app 的 Rust 后端 (单进程, 顶替 5 个 Python/Node 服务)
│   │                   axum + sqlx + reqwest + tokio
│   ├── protocol/       共享类型 (跟前端 codegen 同步, Rust + TS)
│   ├── tauri-bridge/   Tauri commands 桥接 (Phase 2)
│   └── center-client/  HTTP client 调 Linux 中心 (Phase 3, 现在预留)
└── migrations/         SQLx 风格 PG migrations
```

## 状态

- [x] Cargo workspace 骨架 (4 个 crate stub)
- [ ] Phase 1: Rust 后端 (4-6 周) — desktop-core 实现
- [ ] Phase 2: Tauri 壳 (2 周)
- [ ] Phase 3: 中心客户端 (2 周)

详细: `docs/v3-rust-architecture.md`
迁移计划: `docs/v3-monorepo-migration.md`
