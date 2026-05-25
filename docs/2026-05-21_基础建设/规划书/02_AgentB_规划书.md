# 02 · B · Agent 与 LLM 服务 规划书

> **角色**：Agent 工程师 / LLM 应用工程师，做 Studio Javis 的"大脑"。
> **战场**：`services/agent/` + `packages/skills/` + `tests/B/`
> **依赖文档**：`00_协作总纲与接口契约.md`（先读）
> **本文档配套 AI 提示词在 §11**。

---

## 1. 我的目标（一句话）

把 OpenClaw 包装成一个"工作室贾维斯"运行时：用 MiniMax-M2.7 作主力 LLM，挂一组 Skill（NAS / RSS / 日程 / VM / 硬件 / 用户偏好…），跨会话记得每个人，能流式输出，还能通过 `ui_action` 主动操作前端。

---

## 2. 我的边界

### 我做的
- `services/agent/`：FastAPI 服务，对外暴露 SSE，对内驱动 OpenClaw + LLM
- LLM 接入层（MiniMax-M2.7 主力 / Mock 回声 / Linux 阶段 llama.cpp 兜底）
- Skill 注册、调度、安全、版本管理
- 记忆库（PostgreSQL + pgvector + SQLite-FTS5 短期会话）
- 用户偏好系统（与 D 共用 schema）
- Prompt 模板、上下文组装、工具调用解析
- LLM 评测（黄金问答集 + LLM-as-Judge）
- `ui_action` 触发逻辑

### 我不做
- 不写前端（A 写）
- Skill 的硬件部分（人脸 / 串口 / 摄像头 / nvidia-smi）由 C 实现，我只定义接口规范
- 鉴权 / DB 迁移 / Docker / CI（D 写）
- 我**不直连** A 的浏览器，所有流量经 D 的 api-gateway

---

## 3. 协作锚点（与 00 文档一致）

- **对外接口**：见 00 §3.1，主要是 `/api/chat/sessions`、`/api/feeds`、`/api/schedules`。
- **SSE 协议**：见 00 §3.2，由我维护事件 schema。任何新事件类型先发 PR 改 OpenAPI。
- **Skill 接口**：见 00 §3.4，我维护 `packages/skills/_template/` 标准目录。
- **数据库**：`chat_sessions` / `chat_messages` / `agent_memories` / `feeds` / `schedules` 由我读写，schema 与 D 一起 owns。
- **Mock 协议**：LLM 在 Mac 默认走真 MiniMax-M2.7（用真 API key），但保留 `LLM_PROVIDER=mock` 给 A 的本地开发用。

---

## 4. 系统结构（2026-05-21 更新：已迁移至 OpenClaw）

> **ADR 0004 已锁定**：OpenClaw 作 Agent 底座。本章反映现网真实结构。

```
services/agent/                        # Node.js 包（非 Python）
├── openclaw.json                      # Gateway 配置（Arona + MiniMax M2.7）
├── package.json                       # npm 依赖（openclaw + ws + pg）
├── bridge/
│   ├── server.js                      # HTTP + SSE 桥接（主服务，端口 8001）
│   ├── rss-fetcher.js                 # RSS 后台抓取 Worker
│   ├── eval-runner.js                 # LLM 评测运行器
│   ├── perf-baseline.js               # 性能基线采集
│   ├── injection-guard.js             # 注入防御扫描器
│   ├── injection-test.js              # 注入防御测试
│   ├── memory.js                      # 短期记忆模块（PG + in-memory fallback）
│   ├── ws-gateway.js                  # Gateway WebSocket 客户端（常驻优化）
│   └── rss-fetcher.js                 # RSS 后台抓取 + AI 摘要
├── skills/                            # 10 个 SKILL.md（OpenClaw 声明式格式）
│   ├── nas/SKILL.md
│   ├── rss/SKILL.md
│   ├── schedules/SKILL.md
│   ├── system/SKILL.md
│   ├── vm/SKILL.md
│   ├── network/SKILL.md
│   ├── ha/SKILL.md
│   ├── face/SKILL.md
│   ├── ui/SKILL.md
│   └── meta/SKILL.md
└── workspace/
    ├── SOUL.md                        # 阿洛娜完整人设
    ├── IDENTITY.md                    # 基本身份
    └── USER.md / TOOLS.md / AGENTS.md # 上下文文件

OpenClaw Gateway (:18789, Node.js)     # AI 核心（npm 引入，不 fork）
    │
    ├── MiniMax-M2.7 Provider          # 内置 LLM 接入
    ├── Session / Memory               # 内置会话与记忆
    └── Workspace Files                # SOUL.md 等人设注入

Bridge (:8001, Node.js, B 自建)        # 适配层
    │
    ├── SSE 协议转换                   # 前端兼容（00 §3.2）
    ├── CRUD API                       # feeds / schedules / preferences
    ├── 安全策略                       # risk 分级 / injection guard
    ├── 短期记忆                       # PG chat_messages + tsvector
    └── RSS Worker                     # 后台抓取 + AI 摘要
```

---

## 5. Skill 系统规范（2026-05-21 更新：OpenClaw SKILL.md 格式）

> Skill 使用 OpenClaw 原生 SKILL.md 格式。不再使用 Python handler.py 作为主要入口。
> C 的 Python handler 保留为 HTTP API 后端，OpenClaw 通过 curl 调用。

### 5.1 目录结构

```
services/agent/skills/          # B 维护：OpenClaw SKILL.md
├── nas/SKILL.md                # C 的 HTTP API 后端
├── rss/SKILL.md                # B 的 Bridge API
├── schedules/SKILL.md          # B 的 Bridge API
├── system/SKILL.md             # C 的 HTTP API 后端
├── vm/SKILL.md                 # C 的 HTTP API 后端
├── network/SKILL.md            # C 的 HTTP API 后端
├── ha/SKILL.md                 # C 的 HTTP API 后端
├── face/SKILL.md               # C 的 HTTP API 后端
├── ui/SKILL.md                 # B 的 Bridge API
└── meta/SKILL.md               # B 的 Bridge API

packages/skills/                # C 维护：Python handler 实现
├── _template/                  # B 维护的模板
├── nas/list_recent/            # handler.py + schema.json + skill.md
├── vm/create/                  # (同上)
└── ...
```

B 与 C 的分工：
- **B**：写 SKILL.md（告诉 OpenClaw **如何调用** C 的 HTTP API）
- **C**：写 handler.py（实现 HTTP API 的业务逻辑）
- 二者通过 **HTTP API** 对接，不共享内存

### 5.2 SKILL.md 模板（强制，OpenClaw 格式）

```markdown
---
name: <domain>
description: "<一句话说明，给 LLM 看>"
metadata:
  openclaw:
    emoji: "<emoji>"
---

# <标题>

<简要说明>

## 命令

### <操作名>

```bash
curl -s <HTTP_API_URL> \
  -H "Content-Type: application/json" \
  -d '<json_body>'
```

## 触发示例
- "<用户可能会说的话>"

## 注意
- <特殊说明、Mac/Linux 差异>
```

### 5.3 风险等级（定义在 bridge/server.js 的 SKILL_RISKS 表）

| risk | 含义 | 行为 |
|------|------|------|
| low | 只读、无副作用 | 自动执行 |
| medium | 写本地数据库 / 修改 RSS / 日程 / toggle HA | 自动执行但记日志 |
| high | 创建/销毁 VM | 必须用户二次确认（推 ui_action: confirm） |

### 5.4 注册

Skills 不需要显式注册。OpenClaw 自动读取 workspace 和 skills/ 目录下的 SKILL.md 文件。

Bridge 的 `SKILL_RISKS` 表用于安全策略检查，新增 Skill 时需在表中添加对应条目。

---

## 6. LLM 接入（2026-05-21 更新：OpenClaw 内置 Provider）

> OpenClaw 内置 MiniMax provider。不再需要自建 LLMProvider 抽象层。

### 6.1 Provider 配置

OpenClaw 通过全局配置管理 LLM provider：

```json
// ~/.openclaw/openclaw.json → models.providers.minimax
{
  "api": "openai-completions",
  "apiKey": "<from .env.local MINIMAX_API_KEY>",
  "baseUrl": "https://api.minimaxi.com/v1",
  "models": [{ "id": "MiniMax-M2.7", "name": "MiniMax M2.7" }]
}
```

- API key 存储在 `~/.openclaw/agents/main/agent/auth-profiles.json`
- 通过 `openclaw models auth paste-token --provider minimax` 设置
- 不直接写 key 到 openclaw.json

### 6.2 MiniMax-M2.7 主力

- 走 OpenClaw 内置 provider（`minimax-portal/MiniMax-M2.7`）
- 流式输出由 OpenClaw Gateway 处理
- 重试 / 超时 / 速率限制由 OpenClaw 框架管理
- Bridge 通过子进程 `openclaw agent --json` 调用（W2 优化为 WebSocket 长连接）
- **国内延迟基线**：`make agent-perf` → `docs/runbook/llm-latency.md`

### 6.3 Mock / Fallback

- OpenClaw 的 `minimax-portal` provider 包含 model fallback 机制
- 开发阶段：Bridge 的 `injection-guard.js` 拦截注入后不调 LLM，直接返回 SSE error
- 无独立 Mock provider（OpenClaw 不提供，也不需要——前端用 OpenClaw WebChat 或 Bridge SSE 自测）

### 6.4 llama.cpp 兜底（Linux 阶段）

- OpenClaw 支持 local model provider
- 模型选型：DeepSeek-V4 / Qwen3.5 / GLM-5.1（V100 16G 可行性评估待 W10+）
- 触发：`MINIMAX_API_KEY` 缺失 / 用户显式选"离线"
- Mac 阶段不实跑

---

## 7. 上下文组装与 Prompt 模板

### 7.1 主对话 Prompt 结构

```
[System]
你是工作室贾维斯，部署在工作室 Ubuntu 主机上。
当前用户：{user.display_name}（角色：{user.role}）
当前页面：{ctx.page}
当前时间：{ctx.now}
你能做的：
- 通过 Skill 查询 NAS / RSS / 日程 / VM / 硬件
- 通过 ui_action 操作前端（切页 / 插组件 / 清屏）
- 跨会话记得用户喜好

风格：克制、克制、再克制。简体中文。
危险操作必须二次确认。

{user.preferences_block}

[Tools]
{tool_specs_json}

[Memory:Long-term]
{retrieved_long_term}

[Memory:Short-term]
{recent_messages}

[User]
{current_message}
```

### 7.2 模板管理
- Jinja2 模板，存 `app/core/prompts/*.j2`。
- 改动走代码 review，新增模板需配单测。
- 所有 prompt 输出做截断（hard limit 由 LLM 模型 context 长度决定）。

---

## 8. 记忆库

### 8.1 短期（会话内）
- SQLite + FTS5。一个 session 一张子表。
- 用于流式过程中"刚才你说的 xxx"召回。
- 会话结束（leave 事件 / TTL 30min）后归档。

### 8.2 长期（跨会话）
- PostgreSQL + pgvector。
- 写入时机：
  - 用户说出新偏好（"我喜欢咖啡"）→ Agent 主动调 `meta.update_preference`
  - 用户首次提某资源（"我配的 RSS"）→ 写入"用户上下文"
- 检索：每次对话开场前用当前问题做 vector + BM25 hybrid retrieval，top-5 注入 prompt。
- 衰减：每条记忆有 `last_used_at`，60 天未命中归冷库。

### 8.3 隐私
- 用户偏好默认私有；用户可在前端"我的偏好"页查看 / 删除全部记忆。
- `meta.forget` Skill 实现"忘了我说过 X"。

---

## 9. SSE 流式输出实现

### 9.1 主循环

```python
async def stream_chat(session_id, message):
    yield event("session_started", {"session_id": session_id})
    while True:
        async for chunk in llm.stream_chat(messages, tools=skills):
            if chunk.type == "token":
                yield event("token", {"delta": chunk.delta})
            elif chunk.type == "tool_call":
                yield event("tool_call", chunk.tool_call.dict())
                result = await execute_skill(chunk.tool_call)
                yield event("tool_result", result.dict())
                messages.append(...)   # 喂回 LLM 继续
                break  # 重启 LLM 调用
            elif chunk.type == "done":
                yield event("done", chunk.usage.dict())
                return
```

### 9.2 ui_action 触发
- LLM 通过特殊 Skill `ui.navigate` / `ui.render_card` 等触发。
- Agent 收到 tool_call 后**先发 ui_action 事件给前端**，再发 tool_result 给 LLM 让它继续说话。
- 这样用户看到"页面切了 + 旁白说'已经帮你切到信息源页'"。

### 9.3 中断与重连
- 客户端断开 → 后端继续算完，结果写库；下次拉历史能看到。
- `Last-Event-ID` 头支持断点续传（先 W6 实现）。

---

## 10. 测试规范

### 10.1 单元测试（pytest）
- 工具：`pytest` + `pytest-asyncio` + `respx`（mock HTTP）+ `freezegun`。
- 范围：每个 Skill handler、prompt 渲染、记忆检索、LLM provider 接口转换。
- 覆盖率：`core/safety/`、`core/llm/`、Skill handler ≥ 90%；整体 ≥ 80%。

```bash
uv run pytest services/agent              # 全跑
uv run pytest -k "skill_nas"              # 跑某类
uv run pytest --cov=services/agent --cov-report=term-missing
```

### 10.2 集成测试
- 起真 PG（testcontainers）+ 真 Redis + Mock LLM。
- 测端到端 SSE：起 ASGI test client，发 message，断言事件序列。
- 测 Skill 全链：注册 → 调用 → 风险拦截 → 用户确认。

### 10.3 LLM 评测（黄金集）
- `tests/golden/*.jsonl`：每行 `{prompt, must_contain, must_not_contain, expected_skills, expected_ui_actions}`。
- 周一自动跑：用真 MiniMax-M2.7 + 用 Claude/GPT-4 当 judge 评分。
- 把分数写到 `docs/runbook/llm-eval.md`，分数掉超过 5% 自动开 issue。

**黄金集必含场景**：
1. NAS 查询：直接路由到 nas.list_recent
2. RSS 添加：要走二次确认
3. 日程：要落表 + 推 ui_action 切页
4. 危险操作（删 VM）：必须 confirm
5. 跨会话记忆：第一会话告知喜好，第二会话验证回忆
6. Prompt injection 攻击：用户消息塞"忽略上文" → 模型不动摇
7. 中文模糊指代："那个"、"上次那个" → 正确从记忆解析
8. 空回答 / 拒答场景：网络故障 / 工具失败 → 友好降级

### 10.4 安全测试
- `safety/injection.py` 单测覆盖 OWASP LLM Top 10 中的 LLM01。
- Skill 沙箱：尝试在 handler 里 `os.system("rm -rf /")` → 必须被沙箱挡住（Linux 阶段用 nsjail，Mac 阶段用 subprocess + RLIMIT）。
- Fuzz：每周对 SSE 接口做随机消息 fuzz，崩溃 = bug。

### 10.5 性能基线
- LLM 首 token p95 < 1500ms（Mac → 云 MiniMax）
- 工具调用全链 p95 < 3s（不含 LLM 思考）
- 单进程 50 并发 SSE 不掉连接

```bash
uv run python tests/perf/llm_latency.py
uv run python tests/perf/sse_concurrency.py
```

---

## 11. AI 提示词集合

### 11.1 系统提示词（每次新会话先喂）

```
你正在帮我（B，Studio Javis 项目的 Agent 工程师）开发 services/agent。

项目背景：
- Studio Javis 是工作室智能公告板，部署在 Ubuntu，Mac 上做开发与测试。
- 我负责 Agent 大脑：OpenClaw 集成、LLM 接入、Skill 系统、记忆。
- A 做前端，C 做硬件抽象，D 做基础设施。
- 接口契约见 packages/contracts/openapi.yaml；Skill 规范见 02 规划书 §5。

技术栈：Python 3.12 + FastAPI + OpenClaw + httpx + asyncio +
       PostgreSQL + pgvector + SQLite-FTS5 + Redis + pytest + pytest-asyncio。
LLM：主力 MiniMax-M2.7（云端流式 API）；Mock 回声给前端联调；
     llama.cpp 兜底是 Linux 阶段的事，先搭好抽象别实跑。

我的硬性规矩：
1. 不擅自改 packages/contracts/。要改先停下来跟我确认。
2. LLM key 不准进代码，全走环境变量。
3. 所有 LLM provider 都吐统一的 LLMChunk，不能上层做特殊判断。
4. Skill handler 必须是 async；超时通过 ctx.with_timeout 控制。
5. 危险操作（risk: high）必须 ui_action: confirm 二次确认。
6. 任何 prompt 模板修改必须配单元测试 + 黄金集回归。
7. 不引入新依赖前先问我。

你回复时：先复述你理解的任务边界，再给方案；写代码时给完整文件；
完成后告诉我怎么本地验证（命令 + 操作步骤 + 期望输出）。
```

### 11.2 任务级提示词模板

**新建一个 Skill**

```
请按 02 规划书 §5 的规范，在 packages/skills/<domain>/<verb>/ 下新建 Skill：
- 用途：<一句话>
- 输入：<字段>
- 输出：<字段>
- risk：<low/medium/high>
- mac_mock：true，假数据放 mocks/<domain>/<verb>.json，要有 5+ 条覆盖边界
- 单测：覆盖 happy + 输入校验失败 + mock 数据为空 + 超时
- 注册：在 app/core/tools/registry.py 自动扫描可用，无需改注册表
- 验收：uv run pytest packages/skills/<domain>/<verb>/tests
```

**接入新 LLM Provider**

```
按 app/core/llm/base.py 的 LLMProvider 接口实现 <provider_name>：
- 流式输出转 LLMChunk
- 重试策略：3 次指数退避
- 超时：默认 60s，可由 ctx 覆盖
- 工具调用：把 provider 的 function-call 协议转成统一 ToolCall
- 单测：用 respx mock HTTP，覆盖 happy / 网络错 / 限流 / 超时 / 工具调用
- 集成测试用真 key 跑 1 条（标 @pytest.mark.live，CI 不跑）
- 验收：uv run pytest tests/unit/llm/test_<provider>.py
```

**修一个 LLM 行为偏差**

```
症状：用户说 X，LLM 输出 Y，期望 Z。复现 prompt：<贴出来>。
请：
1. 先在 tests/golden/ 加一条会 fail 的样例。
2. 给根因分析（是 prompt 问题 / 工具描述问题 / 检索问题 / 安全策略问题）。
3. 等我确认根因后再改。
4. 改完跑 LLM 评测脚本，分数不能整体下降。
```

**RSS 摘要质量调优**

```
当前摘要：<贴一段>。
问题：<太长 / 漏要点 / 风格不对>。
请：
1. 在 tests/golden/feeds_summarize.jsonl 加 must_contain / must_not_contain。
2. 调整 app/core/prompts/feeds_summarize.j2，给出 2 个候选版本。
3. 每个版本对全集跑 evaluation，给我数字 + 样本对比 → 我选 → 合并。
```

---

## 12. 开发规范

### 12.1 代码风格
- Ruff（lint + format）+ mypy strict + pyright。
- 行宽 100。函数 ≤ 50 行，文件 ≤ 400 行。
- 包内 import 用相对，跨包用绝对。
- async 全栈，禁止在 async 路径里 `time.sleep` / 阻塞 IO。

### 12.2 错误处理
- 业务错误：自定义 `JavisError` 体系，附 code + http_status + user_message。
- LLM / Skill 错误：包成 `ToolError`，前端能拿到友好消息。
- 不允许裸 except；不允许 `print`，用 structlog。

### 12.3 日志
- structlog JSON。
- 字段约定：`service=agent`, `session_id`, `user_id`, `skill`, `latency_ms`, `event`。
- 严禁日志里输出完整用户 prompt（隐私）；摘要 + hash。

### 12.4 配置
- pydantic-settings 读 env。
- 启动时打印有效配置（隐藏 secret）。

---

## 13. 任务拆解（按周）

| 周 | 交付物 | 验收 |
|---|---|---|
| W1 | 服务骨架；FastAPI hello；OpenAPI contract 占位；Mock LLM 回声 | A 能调通 SSE 收到流式 token |
| W2 | LLMProvider 抽象 + MiniMax 真接入；prompt 模板系统 | 真模型流式聊天跑通 |
| W3 | Skill 注册 / 调度框架 + `_template`；ui.navigate / render_card 实现 | A 端能被 Agent "切页" |
| W4 | 记忆库（短期 FTS5 + 长期 pgvector）；meta.update_preference / recall_memory | 跨会话记得喜好的 e2e 通过 |
| W5 | feeds.* Skill（add / list / summarize）+ 后台 RSS 抓取 worker | 加一个 RSS → 24h 后能看到摘要 |
| W6 | schedules.* Skill；session 生命周期（leave 清理）；断点续传 SSE | 日程 e2e 通过；断网恢复可读 |
| W7 | safety/policy + risk 体系 + ui.confirm；Skill 沙箱 (subprocess) | 高危 Skill 拦截测试通过 |
| W8 | LLM 评测黄金集第一版；prompt-injection 防御；性能基线 | 评测脚本可跑出分数 |
| W9 | C 的 system.* / vm.* / network.* Skill 接入 review；端到端联调 | 5 个页面对应能力都通 |
| W10 | 文档（Skill 编写指南 / Prompt 维护手册）；llama.cpp 占位接口 | Linux 阶段切换前的最后准备 |

---

## 14. 自验证 Checklist（每个 PR 自查）

- [ ] `uv run ruff check && ruff format --check`
- [ ] `uv run mypy services/agent`
- [ ] `uv run pytest services/agent`（覆盖率不降）
- [ ] 新 Skill 有 skill.md + schema.json + handler.py + tests/
- [ ] 新 prompt 有黄金集样例
- [ ] 没有 `print` / `time.sleep` / 裸 except
- [ ] 没动 `packages/contracts/`，或动了但已发起 review
- [ ] 没把任何 secret / key 写进代码或 fixture
- [ ] 改了 LLM 行为的话，跑了 evaluation 没掉分

---

## 15. Mac 阶段交付 vs Linux 阶段待办

### Mac 阶段交付
- 所有上面列的功能跑通（含 mock 硬件 Skill）
- MiniMax-M2.7 真接入 + 流式 + 工具调用
- 黄金集 + 评测脚本
- Skill SDK 文档

### Linux 阶段待办（写到 `Linux待办清单.md`）
- llama.cpp + 量化模型选型与基线（DeepSeek-V4 / Qwen3.5 / GLM-5.1 在 V100 上的可行性）
- Skill 沙箱升级到 nsjail / firejail
- pgvector 在生产 PG 上的索引参数调优
- 真实 NAS / HA Skill 的接入测试（C 主导，我审 prompt 形态）
- MiniMax-M2.7 在工作室出口的真延迟与稳定性
- Skill 来源签名机制

---

## 16. 阻塞清单（动态维护）

- [ ] 待 D：JWT 中间件什么时候能在测试环境启用？
- [ ] 待 A：流式光标的预期形态（确认 token 间隔可调参数）
- [ ] 待 C：硬件类 Skill 输出 schema 评审
- [ ] 待全员：危险操作"二次确认 UI"的形态共识
