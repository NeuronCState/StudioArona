# 工程师 B · 智能与数据层任务书

> **角色定位**：负责 OpenClaw 的定制、Skill 落地、用户主库与 per-user memory 文件、Agent 流程编排、感知接入。
> **协作模式**：与工程师 A 通过 `packages/contracts/` 解耦，互不阻塞。
> **工期**：8 周，对应 Phase M1 - M4。

---

## 0. 角色 Prompt（直接喂给执行 Agent）

```
你是 Studio Javis 项目的智能与数据层工程师。
你的目标：把后端从"内存兜底 + 空 skill"推进到"持久化 + 真实 OpenClaw 流程跑通"。

技术栈：
  - api-gateway: FastAPI + SQLAlchemy + Alembic
  - agent: Node.js + OpenClaw (基于其能力定制 skill 与流程)
  - perception: FastAPI
  - 数据：PostgreSQL（主库 / 账号信息）+ SQLite per-user（memory 文件）

核心理念：
  能用 OpenClaw 现成机制就不要重写。Skill 走 packages/skills/<name>/ 标准结构，
  Workspace prompt 走 services/agent/workspace/*.md 分层注入。

工作目录限定：
  services/agent/**
  services/api-gateway/**
  services/perception/**
  infra/db/**
  infra/scripts/**
  packages/skills/<name>/{handler.py,schema.json}

只读、不修改：
  apps/web/**
  packages/ui-kit/**
  packages/contracts/openapi.yaml （改动需走 PR + 通知 A）
  packages/contracts/ui-actions.schema.json
  packages/contracts/ws-events.schema.json
  packages/skills/<name>/skill.md  （技能定义是共享 spec）

任何契约层修改必须发 issue 与工程师 A 协商。
```

---

## 1. 范围边界

| 类型 | 路径 | 权限 |
|---|---|---|
| 全权 owner | `services/agent/**` | 读写 |
| 全权 owner | `services/api-gateway/**` | 读写 |
| 全权 owner | `services/perception/**` | 读写 |
| 全权 owner | `infra/db/**` `infra/scripts/**` | 读写 |
| 部分 owner | `packages/skills/<name>/{handler.py,schema.json,tests/}` | 读写 |
| 共享契约 | `packages/contracts/**` | 协商修改 |
| 禁止触碰 | `apps/web/**` `packages/ui-kit/**` | 完全不动 |

**与 A 的接口契约（你定义、她消费）**
- HTTP / SSE 路由：`openapi.yaml` 中的 chat / memory / users / system / vms 全部由你实现并保证 schema 一致
- WS 事件：你 push、她订阅；事件类型必须出现在 `ws-events.schema.json` 中
- ui_action：agent 在 SSE 流中发出，schema 中已有 6 种动作（`navigate / highlight / render_card / clear_session / toast / confirm`），需要新增动作必须先改 schema 并通知 A

---

## 2. 数据层（先做，所有 agent 流程的地基）

### 2.1 主库 schema 扩展（`infra/db/versions/002_user_profile_extension.py`）

给 users 表加弹性扩展字段：

```python
def upgrade():
    op.add_column("users", sa.Column("avatar_url", sa.String(512), nullable=True))
    op.add_column("users", sa.Column("profile_json", sa.Text, nullable=False, server_default="{}"))
    op.add_column("users", sa.Column("settings_json", sa.Text, nullable=False, server_default="{}"))
    op.add_column("users", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("memory_db_path", sa.String(512), nullable=True))
```

`profile_json` 装：bio、生日、爱好、关系标签等可选字段
`settings_json` 装：主题、TTS 音色、唤醒灵敏度、通知偏好等
`memory_db_path` 装：该用户专属 SQLite 文件的绝对路径（注册时分配）

### 2.2 chat 持久化（`infra/db/versions/003_chat_persistence.py`）

把 agent bridge 已经在用的 `chat_sessions / chat_messages` 表正式建出来。停止内存兜底。

```python
op.create_table(
    "chat_sessions",
    sa.Column("id", sa.UUID(as_uuid=False), primary_key=True),
    sa.Column("user_id", sa.UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
    sa.Column("title", sa.String(256), nullable=True),
    sa.Column("mode", sa.String(16), nullable=False, server_default="text"),  # text / voice
    sa.Column("created_at", ...), sa.Column("updated_at", ...),
    sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("summarized", sa.Boolean, nullable=False, server_default="false"),
)

op.create_table(
    "chat_messages",
    sa.Column("id", sa.UUID(as_uuid=False), primary_key=True),
    sa.Column("session_id", sa.UUID(as_uuid=False), sa.ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False, index=True),
    sa.Column("role", sa.String(16), nullable=False),  # user / assistant / tool / system
    sa.Column("content", sa.Text, nullable=False),
    sa.Column("tool_call_json", sa.Text, nullable=True),
    sa.Column("created_at", ..., index=True),
)

# 建 GIN 索引方便后续全文检索
op.execute("CREATE INDEX idx_chat_messages_content_gin ON chat_messages USING gin(to_tsvector('simple', content))")
```

### 2.3 Per-user Memory SQLite（`services/api-gateway/app/memory/`）

#### 文件布局

```
~/javis-data/users/<user_id>/
  ├── memory.sqlite        # 该用户的全部记忆
  ├── avatar.{png,jpg}     # 头像（也可放 S3 / 本地静态目录）
  └── attachments/         # 该用户上传的文件
```

路径根目录用环境变量 `JAVIS_USER_DATA_DIR`，默认 `~/javis-data`。

#### memory.sqlite schema（每库都建相同结构，幂等）

```sql
-- raw_messages：与会话同步追加，调试与申诉用
CREATE TABLE IF NOT EXISTS raw_messages (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL,
  role          TEXT NOT NULL,
  content       TEXT NOT NULL,
  tool_call     TEXT,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_raw_session ON raw_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_raw_created ON raw_messages(created_at);

-- memory_entries：LLM 总结后的结构化记忆
CREATE TABLE IF NOT EXISTS memory_entries (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL,    -- fact / preference / event / relation / todo / emotion
  summary       TEXT NOT NULL,
  detail        TEXT,
  source_session TEXT,
  importance    INTEGER DEFAULT 50,  -- 0-100
  hits          INTEGER DEFAULT 0,
  last_hit_at   TEXT,
  disabled      INTEGER DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_entries_type ON memory_entries(type);
CREATE INDEX IF NOT EXISTS idx_entries_importance ON memory_entries(importance DESC);

-- memory_embeddings：向量召回（用 sqlite-vec）
CREATE VIRTUAL TABLE IF NOT EXISTS memory_embeddings USING vec0(
  entry_id TEXT PRIMARY KEY,
  embedding FLOAT[384]
);

-- decay 与 user metadata
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

#### 模块文件

```
services/api-gateway/app/memory/
  ├── __init__.py
  ├── paths.py          # get_user_memory_path / ensure_user_dir
  ├── provisioner.py    # 注册时分配 + 初始化 schema（幂等）
  ├── repository.py     # CRUD 三层数据
  ├── summarizer.py     # 调 LLM 把 raw → entries（纯函数，无 IO 副作用）
  ├── embedder.py       # 文本 → 向量（先 mock，后接真模型）
  ├── recall.py         # 召回：向量 top-K + importance 加权 + decay 衰减
  └── tests/
```

#### 关键函数签名

```python
# provisioner.py
def ensure_user_memory_db(user_id: str) -> Path: ...
def reset_user_memory_db(user_id: str) -> None: ...  # 仅 admin

# repository.py
class MemoryRepo:
    def __init__(self, user_id: str): ...
    def append_raw(self, session_id, role, content, tool_call=None): ...
    def list_raw(self, session_id, limit=100): ...
    def upsert_entry(self, entry: MemoryEntry): ...
    def list_entries(self, type=None, q=None, include_disabled=False): ...
    def update_entry(self, id, patch: dict): ...
    def delete_entry(self, id): ...
    def increment_hit(self, ids: list[str]): ...

# recall.py
def recall(user_id, query, k=5) -> list[MemoryEntry]:
    """召回逻辑：
    1. embed(query) → 向量相似 top-2k
    2. 按 importance × recency × hits 加权重排
    3. 过滤 disabled
    4. 取前 k 条，调 increment_hit
    """
```

### 2.4 注册副作用

`services/api-gateway/app/api/auth.py` 注册流程在事务最后：
1. 写 users 行
2. `path = ensure_user_memory_db(user.id)`
3. UPDATE users SET memory_db_path = path
4. 同 commit 提交

注册失败时 cleanup 该用户目录。

---

## 3. OpenClaw 定制

### 3.1 Workspace Prompt 分层（`services/agent/workspace/`）

不要再用单个巨型 prompt。改为运行时按段拼接：

```
[Core Identity]      # IDENTITY.md（固定）
[Soul]               # SOUL.md（固定，性格描述）
[Tool Context]       # 当前会话可用的 skill 列表（动态）
[Runtime Context]    # 当前页面、设备、presence 状态（动态）
[Memory Context]     # recall(user_id, last_user_msg) 注入的 top-K 条目（动态）
[Recent History]     # 当前 session 的最近 N 轮（动态）
[User Message]
```

实现：`services/agent/bridge/prompt-builder.js`，导出 `buildPrompt({userId, sessionId, userMessage, currentRoute, presence})`，内部读 workspace 静态文件 + 调 recall API + 拼装。

### 3.2 自定义 Skills（在 `packages/skills/` 下落地 handler）

复用工程师 A 已经在 `packages/skills/ui/` 建好的 skill.md，由你写 handler.py：

| Skill | 触发场景 | 输出动作 |
|---|---|---|
| `ui/navigate` | "打开 RSS 页" | emit `ui_action: navigate` |
| `ui/render_card` | "把今天的天气放出来" | emit `ui_action: render_card` |
| `ui/highlight` | "高亮第二个 VM" | emit `ui_action: highlight` |
| `ui/clear_session` | "清屏" | emit `ui_action: clear_session` |
| `ui/toast` | 任意需要轻提示 | emit `ui_action: toast` |
| `meta/recall_memory` | 内部召回（LLM 自己调） | 返回相关 memory entries |
| `meta/update_preference` | "以后叫我老张" | 写 memory_entries(type=preference) |
| `face/identify` | wake 流程触发 | 返回识别到的 user_id |
| `rss/list` `rss/fetch` | "今天有什么新闻" | 返回文章 + 触发 render_card |
| `system/metrics` | "电脑现在状态" | 返回 metrics + 触发 render_card |
| `vm/list` `vm/start` `vm/stop` | "启动训练 VM" | 操作 + 返回 |
| `schedules/today` `schedules/add` | 日程相关 | 返回 + 触发 render_card |
| `ha/toggle` | "关灯" | Mac 阶段 mock |
| `nas/status` | "NAS 还有多少空间" | Mac 阶段 mock |

每个 handler 必须：
- 通过 `ctx.is_mock` 走 mock 分支（Mac 阶段）
- 失败返回结构化 `Result(ok=False, error=...)`
- 写 `tests/test_<skill>.py`

### 3.3 ui_action 在 SSE 中的发出（`services/agent/bridge/server.js`）

当 LLM 决定调用 `ui/*` skill 时，handler 返回的 `data` 直接作为 ui_action payload，bridge 把它包成 SSE event：

```
event: ui_action
data: {"type":"navigate","to":"/feeds"}
```

紧接着原 LLM 文本流继续 `event: token`。

---

## 4. 双入口流程

### 4.1 入口 A：机械臂语音唤醒（无登录态）

```
[Camera] 检测到人脸接近
   → perception 服务 publish ws event: presence.near
   → face/identify skill 异步跑：
       命中已知 user → bind session.user_id
       未命中 → 创建临时 guest user_id，标记 needs_register
   → publish ws event: voice_mode_start { user_id, mode: "voice" }
   → 前端跳 /voice，开始录音
   → ASR → LLM → TTS 闭环
   → presence.away + 15min 静默 → end_session
```

实现拆解：
- `services/perception/app/presence.py`：实时算 presence（near / engaged / away），按 1Hz 推 ws
- `services/agent/bridge/voice-flow.js`：消费 wake 信号，调 face/identify，启动 voice session
- 临时 guest 不分配 memory.sqlite，对话只存到 raw_messages 但不 summarize；引导注册成正式用户后可"领养"这段历史

### 4.2 入口 B：登录后默认对话页（文本模式）

```
POST /api/auth/login → JWT cookie
前端跳 /chat
POST /api/chat/sessions → 拿到 session_id（mode=text）
后续对话走 SSE
点击麦克风 → 同 session_id，mode 切到 voice，触发 voice_mode_start
```

### 4.3 会话结束 → 自动总结（OpenClaw 风格）

触发条件（任一满足即算结束）：
- 显式 `POST /api/chat/sessions/:id/end`
- 该用户 presence=away 持续 ≥ 5 分钟
- 最后一条消息距今 ≥ 15 分钟

结束动作（`services/agent/bridge/summarizer-pipeline.js`）：
1. 拉取 session 全部 raw_messages
2. 调 LLM 用固定 prompt 模板抽取记忆（参见 §4.4）
3. 写入 memory_entries（去重：similarity > 0.92 的合并 importance）
4. 异步生成 embedding 写 memory_embeddings
5. UPDATE chat_sessions SET summarized=true, ended_at=now()

整个流程异步队列执行，绝不阻塞用户下一轮对话。

### 4.4 Summarizer Prompt（`services/agent/workspace/SUMMARIZER.md`）

```
你是 Studio Javis 的记忆抽取器。给定一段对话，请抽取所有值得长期记住的信息。

输出 JSON 数组，每条形如：
{
  "type": "fact|preference|event|relation|todo|emotion",
  "summary": "一句话概括（< 60 字）",
  "detail": "可选的更多细节",
  "importance": 0-100
}

抽取原则：
- fact：用户的客观信息（住址、生日、职业、家人姓名等）
- preference：用户偏好（喜欢的颜色、习惯的称呼、不爱听的音色等）
- event：发生过的事件（参加了什么、完成了什么）
- relation：人物关系（同事、家人、宠物的名字与关系）
- todo：用户提到的待办（不要瞎补，只抽用户明确提到的）
- emotion：明显的情绪倾向（极少抽，仅当用户明确表达）

只抽确定的信息，不要推测。如果一段对话没有可抽内容，返回空数组。

对话：
<<<
{conversation}
>>>
```

---

## 5. WS 事件契约（你 publish）

需要确保以下事件在 `ws-events.schema.json` 中存在，缺的找 A 协商加：

| 事件 | payload | 说明 |
|---|---|---|
| `presence.near` | `{distance,user_id?}` | 有人接近 |
| `presence.engaged` | `{user_id}` | 注视交互中 |
| `presence.away` | `{user_id?}` | 离开 |
| `voice_mode_start` | `{user_id,session_id}` | 进入语音模式 |
| `voice_mode_end` | `{session_id}` | 退出语音模式 |
| `face.identified` | `{user_id,confidence}` | 识别到已知用户 |
| `metrics.tick` | `{cpu,mem,disk,gpu}` | 系统指标，1Hz |
| `memory.created` | `{user_id,entry_id,type}` | 新增记忆，前端 Memory 页可实时插入 |
| `session.ended` | `{session_id,summary_pending}` | 会话结束 |

---

## 6. Phase 拆分

### Phase M1（W1-W2）：数据底座
- [ ] `002_user_profile_extension.py` 迁移
- [ ] `003_chat_persistence.py` 迁移
- [ ] `app/memory/paths.py` `provisioner.py` `repository.py` 完成 + 单测
- [ ] register 路由副作用：建 SQLite、写 memory_db_path
- [ ] agent bridge 改造 `memory.js`：删除内存 fallback，强制走 PG（chat）+ SQLite（memory）
- [ ] perception/presence 骨架（先固定输出 mock 状态）

### Phase M1.5（W2 末，1-2 天）：M1 收尾必修 ⚠️ 阻塞 M2

> **背景**：M1 验收发现 `start.sh` 在 `alembic upgrade head` 阶段直接挂掉，整个后端起不来。M1 的代码虽然写完了、单元测试也跑通了，但**端到端验证为零**。M2 起手前必须把 stack 真的拉起来。

#### 1. 关键阻塞 — Python 版本固定（最高优先级）

**症状**：
```
ModuleNotFoundError: No module named 'sqlalchemy.sql._orm_types'
  at .venv/lib/python3.14/site-packages/sqlalchemy/orm/_typing.py
```

**根因**：当前 venv 用 Python 3.14.3 + SQLAlchemy 2.0.49。SQLAlchemy 2.0.x 还没适配 Python 3.14 的 typing 内部变更。`pyproject.toml` 写 `requires-python = ">=3.12"` 没有上界，uv 抓了系统最新的 3.14。

**修复步骤**：
- [ ] 在仓库根目录新建 `.python-version`，内容 `3.12`
- [ ] 改 `pyproject.toml` 的 `requires-python = ">=3.12,<3.13"`
- [ ] `uv python install 3.12`（如果系统没装）
- [ ] `rm -rf .venv && uv sync` 重建 venv
- [ ] 验证 `.venv/bin/python --version` 输出 3.12.x
- [ ] 跑 `.venv/bin/alembic -c alembic.ini upgrade head` 必须成功
- [ ] 跑 `./start.sh`，所有 5 个服务起来不报错

> 备选方案：如果未来 SQLAlchemy 出了支持 3.14 的版本（>= 2.0.40 之后关注 release notes），可以解锁上界。但不是 M1.5 阶段该做的事。

#### 2. mypy `Duplicate module "app"`

- [ ] 在 `pyproject.toml` 的 `[tool.mypy]` 加：
  ```toml
  explicit_package_bases = true
  mypy_path = "services/api-gateway:services/perception"
  namespace_packages = true
  ```
- [ ] 或者把两个 service 的 package 改名（`app` → `gateway_app` / `perception_app`）—— 但改名波及面大，先用 mypy_path 方案
- [ ] 跑 `make typecheck` 必须无 Duplicate 报错

#### 3. schemathesis certifi 损坏

- [ ] `.venv/bin/pip install --force-reinstall certifi`
- [ ] 验证 `.venv/bin/pytest --collect-only` 不再因 schemathesis 加载失败

#### 4. 端到端冒烟测试脚本（新增，永久守门）

- [ ] 新建 `infra/scripts/smoke.sh`：
  - 调 `./start.sh` 后台启动
  - 等待健康端点：`GET http://localhost:8080/health`、`:8002/health`、`:8001/health`、`:5173`
  - 调 `POST /api/auth/register` 创建测试用户
  - 校验 `~/javis-data/users/<uid>/memory.sqlite` 文件存在 + schema 正确
  - 调 `POST /api/chat/sessions` 创建会话、`POST /messages` 发一条消息
  - 校验 PG 中 `chat_messages` 行 + memory.sqlite 中 `raw_messages` 行
  - 清理：杀进程 + 删除测试用户的目录
- [ ] 该脚本进 CI，每次 B 改动 PR 必跑

#### 5. 启动脚本健壮性

- [ ] `start.sh` 第 202 行的 alembic 调用前加预检查：`.venv/bin/python -c "import sqlalchemy"` 失败时显式提示"venv 损坏，请先运行 uv sync"
- [ ] alembic 失败时 trap 捕获并提示日志位置，而不是 set -e 静默退出

### Phase M2（W3-W4）：OpenClaw 流程闭环

> **前置硬门槛**：M1.5 必须全部完成、`infra/scripts/smoke.sh` 必须 0 失败通过一次。否则 M2 不开。

- [ ] prompt-builder 分层组装
- [ ] `meta/recall_memory` `meta/update_preference` 两个 skill handler 落地
- [ ] `ui/*` 5 个 skill handler 落地，跑通 navigate / render_card / toast 三种端到端
- [ ] summarizer-pipeline.js + SUMMARIZER.md
- [ ] 会话结束三种触发条件全部接好
- [ ] embedder 先 mock（hash），recall 函数完整可用
- [ ] **每个 skill 落地后必须更新 smoke.sh，新增对应的端到端调用断言**

### Phase M3（W5-W6）：双入口与感知
- [ ] perception 真实接 Mac 摄像头（face/identify 走真模型，离线时降级 mock）
- [ ] voice-flow.js：wake → identify → voice_mode_start
- [ ] /api/chat/sessions 支持 mode=voice 切换
- [ ] `face/* rss/* system/* vm/* schedules/*` 所有 skill handler 至少 mock 跑通
- [ ] 临时 guest 用户领养已注册的逻辑

### Phase M4（W7-W8）：抛光
- [ ] sqlite-vec 真实接入（替换 mock embedding）
- [ ] memory decay 机制：30 天未命中且 importance<30 自动 disabled
- [ ] memory 去重合并（similarity > 0.92）
- [ ] 全链路 contract test：schemathesis 跑 openapi.yaml 0 violation
- [ ] 性能基线：recall P95 < 200ms，summarize 单 session < 8s
- [ ] runbook：备份/恢复 per-user SQLite 的脚本

---

## 7. 验收清单

每个 PR 必须通过：
- `make lint` `make typecheck`
- `make test` 全部通过
- `make test-integration`（涉及 DB 改动时）
- `make contract-test`（openapi.yaml 改动时）
- **`infra/scripts/smoke.sh` 0 失败通过**（M1.5 起强制）
- 手动验证：
  - 注册新用户 → 检查 `~/javis-data/users/<uid>/memory.sqlite` 存在且 schema 正确
  - 完成一段对话 → 5 分钟后看到 memory_entries 有新条目
  - 下次对话提到旧话题 → recall 命中且 hits 自增
  - 摄像头唤醒（mock）→ 前端收到 voice_mode_start

> **M1 验收复盘教训**：单元测试通过 ≠ 服务能跑起来。任何 PR 自查时 **先 `./start.sh`，看到所有服务健康再做功能验收**。Python 版本、依赖兼容、迁移、environment 任一断开整个 stack 就废，单测看不出来。

---

## 8. 给执行 Agent 的具体子 Prompt 模板

每个 Phase 开始前，把下面这段喂给执行 Agent：

```
你正在执行 Studio Javis 后端 Phase M{X} 的任务。

参考文档：docs/中期规划/工程师B_智能与数据层任务书.md §6 中的 Phase M{X} 清单。

约束：
1. 仅修改 services/** infra/** packages/skills/<name>/{handler.py,schema.json,tests/} 范围内的文件
2. 不动 apps/** 和 packages/contracts/**（如必须改契约，先发 issue 通知 A）
3. 每完成一个 checklist 项就提一个 commit，message 走 conventional commits
4. 每天结束前跑 make lint typecheck test，挂了就先修
5. 任何 LLM 调用必须支持 LLM_PROVIDER=mock 走确定性 echo
6. 所有 hardware/peripheral 接入默认 mock=true，可通过 .env.local 切换

完成后输出：
- 改动文件清单
- 新增/修改的迁移版本号
- 新增的 skill 列表（包含 mock 行为说明）
- 已知 issue 列表

开始前请先 git checkout -b b/phase-m{X}-<topic>，然后逐项推进。
```

---

## 9. 与工程师 A 的协调点

只有这几处需要双方对齐，其它各干各的：

1. **新增 ui_action 类型**：你先改 `ui-actions.schema.json` → 通知 A → A 在 component-registry / dispatchUIAction 里加分支
2. **新增 ws 事件**：你先改 `ws-events.schema.json` → 通知 A → A 在 event-bus 里订阅
3. **新增 HTTP 路由**：你先改 `openapi.yaml` → 跑 `make generate-types` → A 拉最新 types 后接入
4. **新增 render_card 的 component 名**：你定义 name 与 props 形状（写进 ui-actions schema 的 oneOf 分支或独立 cards.schema.json）→ 通知 A → A 实现该组件并注册

每个协调点 → 一个 GitHub issue，标签 `contract`，至少 3 人 review（按 CLAUDE.md 既有规则）。
