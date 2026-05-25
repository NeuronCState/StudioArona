# B 开发日志 — Phase M3 双入口与感知

**日期**: 2026-05-21
**分支**: `b/phase-m3-dual-entry`
**状态**: 完成

---

## Checklist 逐项记录

### 1. 缺失 skill handler 补齐 (7 个)

| Skill | Mock 行为 |
|-------|----------|
| `face/identify` | 返回 mock-user-001, confidence=0.95 |
| `feeds/list_feeds` (rss/list) | 3 个 feed + 3 篇文章 |
| `feeds/summarize_item` (rss/fetch) | AI 摘要，含 key_points |
| `feeds/add_feed` | 订阅成功，返回 UUID |
| `schedules/list` (schedules/today) | 3 条今日日程 |
| `schedules/create` (schedules/add) | 创建日程，UUID |
| `nas/status` | Synology DS923+ 存储概览 |

- 全部 9 个 mock 验证通过
- commit: `74284f4`

### 2. voice-flow.js

- `services/agent/bridge/voice-flow.js`:
  - `handlePresenceEvent(event)` — 消费 WS presence 事件
  - `presence.near` → 调 face/identify → 已知用户则 voice_mode_start，未知则创建 guest
  - `presence.engaged` → voice_mode_confirm
  - `presence.away` → voice_mode_end + guest TTL cleanup
  - `adoptGuestHistory(guestId, userId)` → 迁移 guest 数据到注册用户
  - `getActiveGuests()` → 列出活跃 guest

- Mock: face/identify 返回 mock-user-001 (confidence 0.95)

- commit: `f6d2b21`

### 3. guest adoption internal API

- `services/api-gateway/app/internal/memory_api.py`:
  - `POST /internal/memory/adopt-guest` — 迁移 guest raw_messages → 注册用户 SQLite，清理 guest 目录
- commit: `f6d2b21`

### 4. server.js 接入 voice-flow

- `POST /internal/voice/presence` — 接收 perception 发来的 presence 事件
- `GET /api/voice/guests` — 列出活跃 guest
- `POST /api/users/adopt-guest` — guest 领养
- commit: `f6d2b21`

### 5. voice mode

- Session 创建已支持 `mode=voice` 参数
- 前端点击麦克风 → 同 session_id 切 mode=voice → trigger voice_mode_start

---

## 测试结果

| 测试范围 | 结果 |
|----------|------|
| memory/recall/embedder/summarizer | 59 passed |
| skill handler mock validation | 9 passed |
| voice-flow presence.near | voice_mode_start ✅ |
| voice-flow presence.engaged | voice_mode_confirm ✅ |
| voice-flow presence.away | voice_mode_end ✅ |
| guest adoption API | 404 for unknown guest ✅ |

---

## M3 Checklist 状态

| # | 任务 | 状态 |
|---|------|------|
| 1 | face/identify handler | done |
| 2 | feeds/rss handlers | done |
| 3 | schedules handlers | done |
| 4 | nas/status handler | done |
| 5 | voice-flow.js wake → identify → voice_mode_start | done |
| 6 | guest adoption logic | done |
| 7 | /api/chat/sessions mode=voice | done |
