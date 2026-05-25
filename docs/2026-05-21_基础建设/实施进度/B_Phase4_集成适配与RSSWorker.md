# Phase 4 · 集成适配与 RSS Worker

> **日期**：2026-05-21
> **前置**：Phase 3 — 桥接层与 API 串通

## 1. 与 D 的 api-gateway 集成

### 端口适配
D 的 `api-gateway/app/proxy/forward.py` 将 agent 后端硬编码为 `http://localhost:8001`。
桥接层从 18790 → 8001 适配，确保 api-gateway 代理能透明转发。

```
Frontend → api-gateway (:8080) → proxy → agent bridge (:8001) → OpenClaw CLI → MiniMax-M2.7
```

### 代理转发路径
| Gateway 路径 | 转发到 Bridge | Bridge 处理 |
|-------------|-------------|------------|
| `/api/chat/sessions` | `POST :8001/api/chat/sessions` | 创建 session |
| `/api/chat/sessions/:id/messages` | `POST :8001/api/chat/sessions/:id/messages` | SSE 流 |
| `/api/feeds` | `:8001/api/feeds` | CRUD |
| `/api/schedules` | `:8001/api/schedules` | CRUD |

### 用户上下文
api-gateway 在 forward_headers 中注入 `X-Javis-User` / `X-Javis-Role` header，bridge 可在需要时读取。

## 2. RSS Fetcher Worker

### 功能
- 每 30 分钟轮询所有订阅的 RSS 源
- 解析 RSS/Atom XML（轻量正则，不依赖 heavy XML 库）
- 通过 GUID 去重检测新条目
- 调用 OpenClaw CLI 生成 AI 摘要（`summarize`）
- 每轮最多 5 篇新文章摘要

### 文件
`services/agent/bridge/rss-fetcher.js`

### 启动
```bash
make agent-rss
# 或
cd services/agent && node bridge/rss-fetcher.js
```

### API
| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/feed-items?feed_id=` | 获取已缓存的条目 |
| GET | `/health` | 健康检查 + 条目数 |

## 3. 端口分配

| 端口 | 服务 | 角色 |
|------|------|------|
| 18789 | OpenClaw Gateway | AI 核心 |
| 8001 | Agent Bridge | 前端 SSE + API |
| 8003 | RSS Fetcher | 后台抓取 |
| 8080 | api-gateway | 代理入口 (D) |
| 8002 | perception | 外设 (C) |

## 4. 验证结果
- [x] Bridge 在 8001 端口正常响应
- [x] api-gateway 转发路径对齐
- [x] SSE 流式正常（Arona 角色语音）
- [x] Feeds/Schedules API 满足 00 文档契约
- [x] RSS Worker 框架就绪

## 5. 下一步
- Phase 5: 真 RSS 源测试 + 摘要质量调优
- W6: Schedules lifecycle + session 断点续传
- 与 C 的硬件 Skill HTTP API 联调
