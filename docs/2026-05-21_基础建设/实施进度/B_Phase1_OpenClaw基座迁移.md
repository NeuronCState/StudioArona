# Phase 1 · OpenClaw 基座迁移

> **日期**：2026-05-20 ~ 2026-05-21
> **角色**：B — Agent 工程师
> **决策**：方案 B — 删除 Python agent 服务，用 OpenClaw 替代

## 1. 迁移决策

| 维度 | 旧方案（Python） | 新方案（OpenClaw） |
|------|-----------------|-------------------|
| 运行时 | Python 3.12 + FastAPI | Node.js 24 + OpenClaw Gateway |
| LLM 接入 | 自建 MiniMax 客户端 | OpenClaw 内置 MiniMax Provider |
| Skill 格式 | Python handler.py | SKILL.md 声明式 |
| 前端通道 | 自建 SSE 端点 | OpenClaw WebChat → 桥接层 |
| 记忆系统 | 自建 pgvector + FTS5 | OpenClaw 内置 Memory |
| 会话管理 | 自建 runtime.py | OpenClaw 内置 Session |

## 2. 删除的代码

从 `services/agent/` 删除：
- `app/main.py` — FastAPI 入口
- `app/core/llm/base.py` — LLMProvider 抽象
- `app/core/llm/mock.py` — Mock 回声
- `app/core/llm/minimax.py` — MiniMax 客户端
- `app/core/llm/llamacpp.py` — llama.cpp stub
- `app/core/runtime.py` — Agent 主循环
- `app/core/tools/registry.py` — Skill 注册
- `app/core/safety/injection.py` — 注入扫描
- `app/core/safety/policy.py` — 风险分级
- `app/api/chat.py` — SSE 端点
- `app/api/feeds.py` / `schedules.py` — API stub
- `app/api/sse.py` — SSE 格式化
- `app/config.py` — pydantic-settings
- `pyproject.toml` (agent)

## 3. 新增的文件

```
services/agent/
├── openclaw.json                # OpenClaw Gateway 配置
├── package.json                 # Node.js 包（依赖 openclaw）
├── bridge/server.js             # SSE 桥接层
└── skills/                      # Studio Javis 自定义技能
    ├── nas/SKILL.md             # NAS 文件查询
    ├── rss/SKILL.md             # RSS 订阅管理
    ├── schedules/SKILL.md       # 日程管理
    ├── ui/SKILL.md              # 前端操作
    ├── meta/SKILL.md            # 记忆与偏好
    ├── system/SKILL.md          # 系统硬件监控
    ├── vm/SKILL.md              # 虚拟机管理
    └── network/SKILL.md         # 局域网设备
```

## 4. 配置变更

- `pnpm-workspace.yaml`：添加 `services/*`
- `pyproject.toml`：`services/*` → `services/api-gateway, services/perception`
- `.env.example`：移除 `LLM_PROVIDER`, `LLM_FALLBACK`，新增 `OPENCLAW_GATEWAY_TOKEN`, `BRIDGE_PORT`
- `.env.local`：新建，含 `MINIMAX_API_KEY`, `OPENCLAW_GATEWAY_TOKEN`
- `Makefile`：新增 `agent`, `agent-bridge`, `agent-onboard` 目标

## 5. 验证结果

- [x] `pnpm install` — openclaw 2026.5.18 本地安装成功
- [x] `openclaw gateway --port 18789` — Gateway 启动成功，health check 200
- [x] `openclaw agent --agent main --message` — MiniMax-M2.7 真模型连通
- [ ] Agent 身份配置（贾维斯 system prompt）
- [ ] 桥接层与前端联调
- [ ] Skills 与 C 的 HTTP API 联调

## 6. 下一步

Phase 2：配置贾维斯身份 + 桥接层 SSE 串通 + Skills 联调
