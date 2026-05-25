# Web Page Monitor — Design Document

## Overview

扩展现有 RSS 情报站，支持监控普通网页的内容变更。用户提交一个 URL + CSS 选择器，系统定时抓取并用 HTML 指纹比较差异，变更时通过前端通知用户。

## Architecture

```
前端 (FeedsPage) → POST /api/page-monitors → api-gateway → agent bridge
                                                              ↓
                                              page-monitor.js (新 handler)
                                                              ↓
                                              page_monitor 表 (PostgreSQL)
                                                              ↓
                                              web-watcher.js (新 后台轮询器)
                                                              ↓
                                              cheerio 提取 → hash → 变更检测
                                                              ↓
                                              WS/SSE 通知前端
```

## Database Schema

```sql
CREATE TABLE page_monitor (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES "user"(id),
  url          TEXT NOT NULL,
  label        TEXT NOT NULL,           -- 用户自定义名称
  css_selector TEXT DEFAULT 'body',     -- CSS 选择器，提取页面区域
  last_hash    TEXT,                     -- 上次内容的 SHA256
  last_checked_at TIMESTAMPTZ,
  last_changed_at TIMESTAMPTZ,
  check_interval_min INTEGER DEFAULT 60, -- 检查间隔（分钟）
  enabled      BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/page-monitors | 列出当前用户的监控列表 |
| POST | /api/page-monitors | 创建监控（url, label, css_selector） |
| PATCH | /api/page-monitors/:id | 更新监控配置 |
| DELETE | /api/page-monitors/:id | 删除监控 |

## 后台轮询器 (web-watcher.js)

- 每 `check_interval_min` 分钟 fetch 一次 URL
- 用 cheerio 加载 HTML，提取 `css_selector` 区域
- 对提取文本做 SHA256 hash
- 与 `last_hash` 比较，不同则：
  1. 更新 `last_hash` 和 `last_changed_at`
  2. 通过 WebSocket hub 推送变更事件到前端

## 前端

复用现有 FeedsPage 的 UI 模式：
- "添加网页监控"按钮 → 弹出表单（URL、名称、CSS 选择器）
- 监控列表展示，每项显示上次检查时间、是否有变更
- 与 RSS 订阅源分开展示（不同 tab 或不同卡片区域）

## 依赖

- `cheerio`：服务端 HTML 解析
- 无需 Playwright/Puppeteer（只做静态 HTML 抓取）

## Implementation Plan

1. 安装 cheerio 依赖
2. 创建 page_monitor 数据库迁移
3. 实现 page-monitor handler（CRUD）
4. 实现 web-watcher 后台轮询器
5. 在 agent bridge server 注册路由
6. 在 api-gateway proxy 添加路由
7. MSW mock handlers
8. 前端页面集成
