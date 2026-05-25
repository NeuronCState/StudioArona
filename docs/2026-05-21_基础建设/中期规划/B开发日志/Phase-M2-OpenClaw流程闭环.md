# B 开发日志 — Phase M2 OpenClaw 流程闭环

**日期**: 2026-05-21
**分支**: `b/phase-m2-openclaw-flow`
**状态**: 完成

---

## Checklist 逐项记录

### 1. embedder.py (mock hash)

- 文件: `services/api-gateway/app/memory/embedder.py`
- SHA-256 hash → 384-dim float vector, L2 normalized
- `cosine_similarity(a, b)` 计算余弦相似度
- 确定性: 相同输入始终产生相同向量
- 7 unit tests
- commit: `9d551c5`

### 2. recall.py

- 文件: `services/api-gateway/app/memory/recall.py`
- 流程: embed(query) → 对所有 entries 计算 cosine similarity
- 加权: `sim × (importance/100) × (1 + hits/10) × recency_factor`
- recency_factor: 30 天半衰期
- 不存在的用户返回空列表
- 6 unit tests
- commit: `9d551c5`

### 3. summarizer.py + SUMMARIZER.md

- `services/agent/workspace/SUMMARIZER.md`: prompt 模板
- `services/api-gateway/app/memory/summarizer.py`: 纯函数 summarize()
  - LLM_PROVIDER=mock: 启发式提取（叫/喜欢/在 等关键词）
  - 真实 LLM: 预留 NotImplementedError
- 6 unit tests
- commit: `b6c7985`

### 4. Internal memory API

- `services/api-gateway/app/internal/memory_api.py`:
  - `POST /internal/memory/summarize` — 对话 → 记忆条目
  - `POST /internal/memory/entries/batch` — 批量 upsert
  - `GET /internal/memory/recall` — 向量召回
  - `GET /internal/memory/entries` — 列表查询
- 注册在 `services/api-gateway/app/main.py`
- commit: `1bb9ad8`

### 5. summarizer-pipeline.js

- `services/agent/bridge/summarizer-pipeline.js`:
  - 取 session 全部消息 → POST /internal/memory/summarize
  - → POST /internal/memory/entries/batch → markSessionSummarized
  - 全程 async，不阻塞用户
- commit: `1bb9ad8`

### 6. prompt-builder.js

- `services/agent/bridge/prompt-builder.js`:
  - 7 层分层: Identity → Soul → Tools → Runtime → Memory → History → Message
  - Memory 层: 调 /internal/memory/recall 注入 top-K 条目
  - History 层: 从 PG 取最近 10 条消息
- commit: `1bb9ad8`

### 7. meta skill handlers

- `packages/skills/meta/recall_memory/handler.py`:
  - mock: 返回 2 条预置条目，按 query 过滤
  - live: 调 /internal/memory/recall
  - 4 tests
- `packages/skills/meta/update_preference/handler.py`:
  - mock: 返回 ok + stored key/value
  - live: 写 /internal/memory/entries
  - 3 tests
- commit: `4f0536e`

### 8. UI skill handlers (5)

- navigate: route 必须以 / 开头，emit ui_action.navigate
- render_card: component + props，emit ui_action.render_card
- highlight: selector/target，emit ui_action.highlight
- clear_session: 无参，emit ui_action.clear_session
- toast: message + level (info/success/warning/error)，emit ui_action.toast
- 均支持 mock mode
- 8 tests
- commit: `ff6409b`

### 9. 会话结束三种触发条件

- 条件 1: `POST /api/chat/sessions/:id/end` → pipeline + summary_pending
- 条件 2: 最后消息距今 15 min（idle timeout）
- 条件 3: session 总时长 30 min（TTL timeout）
- 全部异步执行 pipeline，不阻塞用户
- commit: `d223bb2`

### 10. smoke.sh 更新

- 新增: seed memory entry + recall 验证
- commit: `f9f5ac9`

---

## 测试结果

| 测试范围 | 用例数 | 结果 |
|----------|--------|------|
| memory 测试 (embedder/recall/repository/summarizer) | 44 | 全部通过 |
| meta skills | 7 | 全部通过 |
| UI skills | 8 | 全部通过 |
| **合计** | **59** | **全部通过** |

---

## 新增 skill 列表

| Skill | mock 行为 |
|-------|----------|
| `meta/recall_memory` | 返回 2 条预置记忆条目，按 query 过滤 |
| `meta/update_preference` | 返回 ok，记录 key=value |
| `ui/navigate` | 返回 ui_action.navigate payload |
| `ui/render_card` | 返回 ui_action.render_card payload |
| `ui/highlight` | 返回 ui_action.highlight payload |
| `ui/clear_session` | 返回 ui_action.clear_session payload |
| `ui/toast` | 返回 ui_action.toast payload |
