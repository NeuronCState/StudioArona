# Phase 5 · 会话生命周期与安全策略

> **日期**：2026-05-21
> **前置**：Phase 4 — 集成适配与 RSS Worker

## 1. Session 生命周期管理

### 实现
- Session 创建：`POST /api/chat/sessions` → 生成 session_id，记录 created_at
- 消息追踪：每发送消息记录 message_id，更新 last_msg_at
- TTL 清理：30 分钟无活动自动清理（每 10 分钟扫描）
- 消息历史：`GET /api/chat/sessions/:id/messages` 返回此 session 所有 message_id

### SSE 断点续传（00 §9.3）
- 每个 SSE event 带 `id:` 行（递增序号）
- 客户端断开后重连时发 `Last-Event-ID` header
- Bridge 检测到 lastEventId > 0 时回复"会话恢复"（后续 W6+ 从 session store 回放事件）

## 2. 安全策略系统

### Skill 风险分级

| risk | 含义 | 行为 |
|------|------|------|
| low | 只读、无副作用 | 自动执行 |
| medium | 写本地数据 | 自动执行但记录 |
| high | 创建/销毁 VM、改网络配置 | **必须用户二次确认** |

### 预定义风险表
```
vm.create/destroy  → high
vm.start/stop      → medium
ha.toggle          → medium
feeds.*            → low
nas.*              → low
system.*           → low
network.*          → low
ui.*               → low
meta.*             → low
```

### 确认流程
1. 用户消息匹配 `!<skill> <args>` 模式
2. Bridge 检查 SKILL_RISKS 表
3. 如果 risk=high → 推送 `ui_action: confirm` 事件到前端
4. 前端弹确认框 → 用户确认 → `POST /api/ui/confirm` → Bridge 执行 skill
5. 如果 risk=low/medium → 直接继续调用 OpenClaw agent

## 3. 新增端点

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/chat/sessions/:id/messages` | 消息历史 |
| GET | `/api/me/preferences` | 获取用户偏好 |
| PATCH | `/api/me/preferences` | 更新用户偏好 |
| GET | `/api/ui/stream` | SSE 订阅 UI 事件流 |
| POST | `/api/ui/confirm` | 响应高危操作确认 |

## 4. Skills 覆盖

已完成 10 个 SKILL.md：

| 域 | Skills | 拥有者 |
|----|--------|--------|
| nas | list_recent, search | C |
| ha | list_devices, toggle | C |
| face | enroll | C |
| system | metrics_snapshot, list_training_jobs | C |
| vm | create, list, start, stop, destroy, upload | C |
| network | list_devices, device_detail | C |
| ui | navigate, render_card, toast, confirm | B |
| rss | add_feed, list_feeds, summarize | B |
| schedules | create, list | B |
| meta | recall_memory, update_preference | B |

## 5. 验证结果
- [x] Session 创建/追踪/TTL 清理
- [x] SSE 事件带 id 行（断点续传基础）
- [x] 高危操作 confirm 流程
- [x] 用户偏好 CRUD
- [x] Health 端点含统计信息
- [x] Arona 角色语音一致性（"老师好，收到！有什么需要阿洛娜帮忙的吗？"）

## 6. 下一步
Phase 6：LLM 评测黄金集 + 性能基线
