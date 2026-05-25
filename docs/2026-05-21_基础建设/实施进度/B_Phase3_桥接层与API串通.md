# Phase 3 · 桥接层与 API 串通

> **日期**：2026-05-21
> **前置**：Phase 2 — 身份配置与真模型验证

## 1. 桥接层方案

### 问题
OpenClaw Gateway 的 OpenAI-compat HTTP 端点 (`/v1/chat/completions`) 返回 404，可能需要额外配置启用。直接 HTTP 调用不可用。

### 方案
桥接层使用 **子进程 + JSON 输出** 方式调用 OpenClaw CLI：

```
前端 (SSE) → Bridge (child_process) → openclaw agent --json → MiniMax-M2.7
```

- 前端发 HTTP POST 到 Bridge
- Bridge spawn `pnpm exec openclaw agent --agent main --json`
- 等待进程完成，解析 JSON result
- 逐字符流式返回为 SSE token 事件

### 桥接层端点

| Method | Path | 说明 |
|--------|------|------|
| GET | `/health` | 健康检查 |
| POST | `/api/chat/sessions` | 创建会话 |
| POST | `/api/chat/sessions/:id/messages` | **SSE 流式对话** |
| GET | `/api/feeds` | RSS 订阅列表 |
| POST | `/api/feeds` | 添加 RSS 订阅 |
| DELETE | `/api/feeds/:id` | 删除 RSS 订阅 |
| GET | `/api/schedules` | 日程列表 |
| POST | `/api/schedules` | 创建日程 |
| DELETE | `/api/schedules/:id` | 删除日程 |
| POST | `/api/ui/action` | 推送 UI 事件 |
| GET | `/api/ui/stream` | 订阅 UI 事件流 |
| POST | `/api/me/preferences` | 更新用户偏好 |

## 2. 验证结果

### SSE 流式对话
```
POST /api/chat/sessions/s_br_test/messages
Body: {"content": "你好，一句话回复"}

event: session_started
data: {"session_id":"s_br_test"}
event: token
data: {"delta":"收","index":0}
event: token
data: {"delta":"到","index":1}
event: token
data: {"delta":"，","index":2}
event: token
data: {"delta":"老","index":3}
event: token
data: {"delta":"师","index":4}
event: token
data: {"delta":"好","index":5}
event: token
data: {"delta":"！","index":6}
event: done
data: {"message_id":"m_7cc93310-88f","tokens":7}
```

- [x] SSE 协议对齐 00 §3.2
- [x] 逐字符流式输出
- [x] Arona 人设生效（"老师"称呼）
- [x] session_started → token... → done 完整事件流

### Feeds API
- [x] GET/POST/DELETE 全部正常
- [x] 内存存储（W4 迁移到 PostgreSQL）

### Schedules API
- [x] GET/POST/DELETE 全部正常
- [x] 创建日程时自动广播 `ui_action: navigate → /schedules`

## 3. 已知限制

1. **非实时流式**：子进程方式需要等 Agent 完成才能返回结果（不是真正的逐 token 流式）。当前用字符级间隔模拟
2. **性能**：每次请求 spawn 新进程，有 ~2-3s 冷启动开销
3. **工具调用**：`openclaw agent --json` 不暴露中间 tool_call 事件

## 4. 改进方向

- W4+ 启用 OpenClaw Gateway 的 OpenAI-compat HTTP 端点，获得真正的 token 级流式
- 或使用 WebSocket 直连 Gateway，获得完整 tool_call/tool_result 事件
- feeds/schedules 迁移到 PostgreSQL 持久化

## 5. 下一步
Phase 4：前端联调 + Skills 与 C 的 HTTP API 对通
