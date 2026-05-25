# B 开发日志 — Phase M1 数据底座

**日期**: 2026-05-21
**分支**: `b/phase-m1-data-foundation`
**状态**: 完成

---

## Checklist 逐项记录

### 1. 002_user_profile_extension.py 迁移

- 文件: `infra/db/versions/002_user_profile_extension.py`
- users 表新增 5 列: `avatar_url`, `profile_json`, `settings_json`, `last_login_at`, `memory_db_path`
- 同步更新 `services/api-gateway/app/models/user.py` User 模型
- commit: `c402816`

### 2. 003_chat_persistence.py 迁移

- 文件: `infra/db/versions/003_chat_persistence.py`
- 新建 `chat_sessions` 表 (id, user_id FK, title, mode, timestamps, ended_at, summarized)
- 新建 `chat_messages` 表 (id, session_id FK, role, content, tool_call_json, created_at)
- GIN 索引: `idx_chat_messages_content_gin` 用于全文检索
- 新建 `services/api-gateway/app/models/chat.py` (ChatSession / ChatMessage 模型)
- 更新 `infra/db/metadata.py` 注册新模型
- commit: `adc95f3`

### 3. app/memory/ 模块

- `paths.py`: get_user_data_dir / get_user_dir / get_user_memory_path / ensure_user_dir
  - 根目录: `$JAVIS_USER_DATA_DIR` 或 `~/javis-data`
  - 布局: `users/<user_id>/memory.sqlite` + `attachments/`
- `provisioner.py`: ensure_user_memory_db (幂等建库+schema) / reset_user_memory_db
  - Schema: raw_messages / memory_entries / meta 三表
  - memory_embeddings vec0 表留到 M4
- `repository.py`: MemoryRepo 类
  - `append_raw` / `list_raw` — 原始消息
  - `upsert_entry` / `list_entries` / `update_entry` / `delete_entry` / `increment_hit` — 记忆条目
  - `get_meta` / `set_meta` — 元数据
- 测试: 3 个文件 25 个用例全部通过
- commit: `7b1ba29`

### 4. 注册路由副作用

- `services/api-gateway/app/api/users.py` create_user:
  - user flush 后调用 `ensure_user_memory_db(user.id)`
  - 写入 `user.memory_db_path`
  - 失败时 rollback + cleanup 用户目录
- `services/api-gateway/app/api/auth.py` login:
  - 设置 `user.last_login_at = datetime.now(UTC)`
- commit: `8e822eb`

### 5. agent bridge memory.js 改造

- 删除 in-memory Map fallback，PG 不可用时直接 throw
- 新增 `ensureSession` / `endSession` / `markSessionSummarized`
- `buildMemoryContext`: PG 最近消息 + api-gateway memory entries HTTP 调用
- `server.js`: createSession 接受 userId/mode，session end endpoint，TTL cleanup 写入 PG
- commit: `a14ec0a`

### 6. perception/presence 骨架

- `services/perception/app/presence.py`: PresenceEngine
  - 状态机: unknown → near → engaged → near → away
  - Phase M1 mock 模式: 按固定序列循环 (每个状态保持 5 tick)
  - 1Hz tick，状态变化时发布 WS event
- `services/perception/app/api/presence_api.py`: GET /api/presence/status
- `services/perception/app/main.py`: lifespan 中初始化 EventPublisher + PresenceEngine
- commit: `48151bb`

---

## 测试结果

| 测试范围 | 结果 |
|----------|------|
| memory 模块单元测试 (25 用例) | 全部通过 |
| lint (ruff, 仅本次改动文件) | 全部通过 |
| typecheck (mypy) | 预已存在问题 |
| D 层已有测试 | 预已存在问题 |

---

## 遇到的问题

1. `.gitignore` 中 `models/` 规则误匹配 `app/models/` 目录 → 改为 `/models/`
2. `sqlite3.Row` 没有 `.get()` 方法 → 改用直接索引 + `is not None` 判断
3. `B904` 异常链 → `raise ... from exc`

---

## 已知预已存在问题 (非本次引入)

1. mypy: `Duplicate module named "app"` — api-gateway 和 perception 的 app 包名冲突
2. SQLAlchemy 与 Python 3.14 不兼容 — `sqlalchemy.sql._orm_types` 缺失
3. schemathesis pytest 插件 certifi 导入失败
