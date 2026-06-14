# Server/python/

**当前 (v2) Python 后端** — 8 个 FastAPI 服务 + 1 个 Node bridge。

双轨运行 (跟 v3 Rust 并行) 期间, 这里的所有代码继续维护, 但**不**新增功能, 等 Rust 顶替后冻结。

## 服务清单

| 服务 | 端口 | 职责 | 对应 Rust crate |
|---|---|---|---|
| `services/api-gateway` | 8080 | 业务 API (user/skill/memory/schedule/vm/admin/...) | `desktop-core` (Phase 1) |
| `services/llm_gateway` | 8645 | LLM 代理 + MiniMax 5h quota 守卫 | `desktop-core` (Phase 1) |
| `services/agent/bridge` (Node) | 18790 | Hermes + RSS + Weather 桥 | `desktop-core` (Phase 1) |
| `services/perception` | 8002 | 屏幕/语音/OCR | `desktop-core` (Phase 1) |
| `services/weather_fetcher` | (后台) | 天气抓取 | `desktop-core` (Phase 1) |

## 不在本目录

- 跨平台打包 → `infra/`
- DB migrations → `infra/db/`
- 中心 daemon (PG + Redis + NAS/VM/HA) → `Server/center/`
- Rust 重写目标 → `Server/rust/`
