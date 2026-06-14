# Server/protos/

**跨语言 API 契约** — 前后端 + 中心客户端共用的 HTTP 路径 + JSON schema。

目的: 不管 backend 是 Python 还是 Rust, 不管前端是 React 还是 Tauri, **接口契约**是单一事实源。

## 文件

- `api.md` — 所有 HTTP 端点 (path + method + request/response JSON schema + 状态码)
- `events.md` — 反向 WebSocket 事件 (中心 → 桌面推送)
- `auth.md` — JWT / invite code / center-registration 流程

## 同步策略

1. **Phase 1 (Rust 重写期间)**: Python 端是 source of truth, 用 `python -m app.api.docs` 自动生成 `api.md`
2. **Phase 1 后**: Rust 端用 `utoipa` 注解, `cargo run --bin gen-openapi` 同步到 `api.md`
3. **前后端同步**: 每次改 API, CI 检查:
   - `apps/web/src/lib/api/types.ts` 跟 `Server/protos/api.md` 一致
   - 字段不匹配就 fail PR
4. **TS codegen**: 后续加 `ts-rs` 或 `specta` 从 Rust protocol crate 自动生成 TS 类型
