# Hermes 集成 & LLM Gateway 指南

> 2026-06-10 — 状态：**已完成 MVP**。Hermes v0.16.0 已装好并验证。
> 目标：通过 LLM Gateway (FastAPI, 18789) 提供 OpenAI 兼容 API，per-user Hermes daemon 管理用户上下文。

## 1. TL;DR

| 组件 | 说明 |
|------|------|
| **LLM Gateway**（FastAPI, 18789）| OpenAI 兼容 HTTP 端点，fronting MiniMax API |
| `bridge/minimax.js` | 走 `http://127.0.0.1:18789/v1/chat/completions` |
| 前端 | 指向 `http://localhost:18789`（无需改动）|
| thinking 过滤 | LLM Gateway **自动过滤** `<think>...</think>` |

**前端零改动**——所有调 LLM 的地方仍然指向 `http://localhost:18789`。

## 2. 架构

```
 ┌──────────┐  OpenAI 协议 SSE   ┌─────────────────┐  HTTP+JSON   ┌──────────────────┐
 │ 前端 /web│ ────────────────→ │ LLM Gateway     │ ───────────→ │ MiniMax CN API   │
 │  /bridge │   /v1/chat/...    │ (FastAPI:18789)  │              │  api.minimaxi.com │
 └──────────┘                   │ • thinking 过滤   │              └──────────────────┘
                                │ • 模型路由         │
 ┌──────────┐   CLI/TUI/IM      │                  │  ┌──────────────────┐
 │ Developer│ ←───────────────→ │  Hermes          │  │ ~/.hermes/        │
 │  Hermes  │                   │  (消息网关+cron)  │  │ (配置/记忆/skill) │
 └──────────┘                   └──────────────────┘  └──────────────────┘
```

## 3. 验证过的能力（Hermes v0.16.0）

| 能力 | 状态 | 数据 |
|------|------|------|
| MiniMax 模型连通 | ✅ | `provider=minimax-cn` + `MiniMax-M2.5-highspeed` |
| OpenAI 兼容 SSE 流式 | ✅ | `https://api.minimaxi.com/v1/chat/completions` |
| Thinking 块过滤 | ✅ | LLM Gateway 自动去 `<think>...</think>` |
| TUI 工具调用 | ✅ | grep, search_files, browser_navigate, terminal, tts 等 |
| 消息网关（IM）| ⏳ | 未实测（需要配置 Telegram/微信/飞书 token）|
| 桌面 GUI | ⏳ | `hermes desktop` 命令存在，未实测 |
| 模型速度对比 | ✅ | 详见 §5 |

### 实测速度（M2.5-highspeed + `reasoning_effort: none`，热路径）

| 模型 | Duration | 备注 |
|------|---------|------|
| `MiniMax-M2.5-highspeed` | **3s** | 🥇 最快 |
| `MiniMax-M2.7-highspeed` | 4s | 🥈 |
| `MiniMax-M3` | 5s | 跟 M2.7 base 持平 |
| `MiniMax-M2.7` | 6s | base 较慢 |
| `MiniMax-M2.5` | 9s | base 不开 thinking 也无效 |

## 4. Hermes 还没做到的事

| 能力 | 状态 | 解决路径 |
|------|------|----------|
| **OpenAI 兼容 HTTP 端点**（含 thinking 过滤）| ❌ Hermes proxy 只支持 nous/xai，不支持 minimax | **用本地 LLM Gateway 替代**（已实现 `services/llm_gateway/main.py`）|
| **Hermes 作为运行时** | ❌ Hermes 主要是消息网关 daemon + CLI/TUI/Desktop，**不是** LLM 推理 HTTP 网关 | 用 Hermes 当开发/调试工具；生产用 LLM Gateway |
| Skill 系统 | Hermes 用 `agentskills.io` 开放格式 | 你的 `services/agent/skills/*` 暂未迁移，**保持现状**，需要时再按 manifest 重写 |
| IM 网关 | 命令存在（`hermes gateway run` + `hermes gateway setup`）| 需要 Telegram/飞书/微信 token 才能启用 |

## 5. 关键决策

| 决策 | 选项 | 选择 | 原因 |
|------|------|------|------|
| LLM API 协议 | A 直连 MiniMax B LLM Gateway C Hermes | **B** | 前端 0 改动；thinking 自动过滤 |
| 端口 | A 18789 B 新端口 | **A** | 前端配置不动 |
| Thinking 过滤 | A 前端过滤 B 网关过滤 C Hermes 过滤 | **B** | 一处处理，前端简化 |
| 启动方式 | A 前台 run B 后台 daemon | **A**（前台）| start.py 已用 Popen 管理 |
| 模型 | M2.5-highspeed 最快 | 锁默认 | 见 §3 速度表 |

## 6. 怎么用

### 6.1 启动全栈
```bash./run.sh start  # 自动启动 LLM Gateway + Agent Bridge + 后端 + 前端
```

### 6.2 单启 LLM Gateway
```bashmake llm-gateway
# 或
uv run python -m uvicorn main:app --app-dir services/llm_gateway --host 127.0.0.1 --port 18789
```

### 6.3 用 Hermes TUI/桌面
```bashmake hermes          # 交互式 chat
make hermes-tui      # 完整 TUI
make hermes-gateway  # 消息网关（需要先配 IM token）
make hermes-proxy    # OpenAI 兼容代理（端口 8645，**仅 nous/xai**）
```

### 6.4 健康检查
```bashcurl http://localhost:18789/health
# {"status":"ok","upstream":"https://api.minimaxi.com/v1","default_model":"MiniMax-M2.5-highspeed","api_key_configured":true}
```

## 7. 待办 / 后续工作

- [ ] 迁移 `services/agent/skills/*` 到 Hermes Skill Atlas 格式
- [ ] 配置 IM 网关（微信/飞书）—— 拿到 token 后用 `hermes gateway setup`
- [ ] Hermes desktop GUI 实测 + 截图
- [ ] 如果 Hermes 后续支持 minimax 的 OpenAI 兼容 proxy（`hermes proxy start --provider minimax-cn`），可以去掉 LLM Gateway，直接用 Hermes proxy
- [ ] 重新实现 TTS（当前 tts.js 为 no-op，需接 MiniMax TTS API 或 Hermes TTS）
