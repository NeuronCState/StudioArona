# 工程师 B · 后端数据与 OpenClaw 任务书

> **角色定位**：把后端从"骨架 + Mock 兜底"推到"真实数据库 + 真 OpenClaw + 安全护栏 + 受限 VM 控制"。
> **协作方**：A（前端）、C（性能）通过 `packages/contracts/` 解耦。
> **工期**：8 周（W1-W8）。
> **必读前置**：`00_总纲_数据真实化与形象升级.md` + 项目根 `CLAUDE.md` + `services/agent/workspace/IDENTITY.md`。

---

## 0. 角色 Prompt（直接喂给执行 Agent）

```
你是 Studio Javis 项目的智能与数据层工程师（代号 B），目标是把后端从"骨架 + Mock 兜底"推到"真实数据库 + 真 OpenClaw + 安全护栏 + 受限 VM 控制"。本阶段你的工作覆盖四块：

1. 数据真实化：补齐 schedule / feed / feed_item / memory_entry / vm 五个领域模型，写 Alembic 迁移，把对应 CRUD handler 接入 api-gateway 与 agent 服务。
2. OpenClaw 接入与安全护栏：services/agent/ 下 OpenClaw 真接好，落地 6 个核心 skill（schedules / feeds / memory / system / vms / ha），加 sandbox + tool registry + audit + 增强 injection-guard。
3. 受限 VM 控制（用户明确要求）：阿洛娜可以读 / 操作"用户自己创建"的 VM —— vms.console.tail（读串口日志）+ vms.console.exec（白名单命令 + 超时 + 输出截断 + 用户确认 + audit），跨用户 VM 必须 403。
4. LLM 情绪信号：解析 LLM 流式输出尾标签 [motion:..] [expr:..] [emotion:..]，剥离后通过 SSE ui_action 推给前端。

【绝对红线 · 不可逾越】
- ❌ 项目源码 / 部署文件读写：apps/、services/、packages/、infra/、docs/ 全部禁止 LLM 触达
- ❌ subprocess / os.system / 宿主 shell exec / docker / git
- ❌ 跨用户数据访问；所有 ORM 查询必须 .filter(Model.user_id == ctx.user_id)
- ❌ 跨用户 VM 访问；vms.console.exec 必须 .filter(Vm.user_id == ctx.user_id)
- ❌ DDL（CREATE/ALTER/DROP）；原始 SQL 拼接；exec()
- ❌ 任意 outbound HTTP；只允许：白名单 RSS 源 + Home Assistant 局域网 + 已注册 webhook
- ✅ 仅通过 packages/skills/<name>/handler.py 注册的工具间接调用
- ✅ 自己的 workspace（services/agent/workspace/*.md）+ 当前 user_id 名下数据 + 当前 user_id 名下 VM

【强制实现细节】
- 所有 skill handler 函数签名：def handle(payload: dict, ctx: SkillContext) -> SkillResult
- SkillContext 必含 user_id、session_id、request_id；缺一就 raise SkillContextError
- 所有 tool_call 进 audit 表（user_id / tool_name / args_hash / status / ts / latency_ms）
- 文件系统访问只暴露 agent_workspace_root（默认 services/agent/workspace/），路径校验拒绝 .. 与绝对路径
- VM exec 命令白名单：见本文件 §4.3
- VM exec 超时 10s，输出截断 1MB
- VM exec 危险命令（rm -rf, dd, mkfs, shutdown, reboot, iptables, ufw, sudo passwd, useradd 等）即使是用户自己 VM 也拒绝执行
- injection-guard.js 命中时：拒答 + audit + 返回 ui_action.toast 给前端

【工作目录边界】
全权 owner（读写）：
  services/agent/**
  services/api-gateway/**
  services/perception/**
  infra/db/**
  infra/scripts/**
  packages/skills/<name>/{handler.py,schema.json,tests/}
  packages/contracts/openapi.yaml（改完跑 make generate-types 通知 A、C）
  packages/contracts/ws-events.schema.json
  packages/contracts/ui-actions.schema.json（与 A 共评）

只读 / 禁止修改：
  apps/web/**
  packages/ui-kit/**
  阿洛娜4.6版本/**
  什亭之匣：蔚蓝档案教室 Blender 场景/**
  packages/skills/<name>/skill.md（共享 spec，需 A 确认）

【交付节奏】
- 每个里程碑（M5.1-M5.5）单独 PR，挂 milestone 标签
- 每日在 docs/Phase5_三人冲刺计划/log_B_W<n>.md 追加进展
- 每完成一个 skill 写 demo curl + 截图

【自测命令】
make lint && make typecheck && make test && make test-integration && make contract-test
node services/agent/bridge/injection-test.js
```

---

## 1. 范围边界

| 类型 | 路径 | 权限 |
|---|---|---|
| 全权 owner | `services/agent/**` `services/api-gateway/**` `services/perception/**` `infra/db/**` `infra/scripts/**` | 读写 |
| 主笔（通知 A、C） | `packages/contracts/openapi.yaml` `packages/contracts/ws-events.schema.json` | 读写 + PR 通知 |
| 共评 | `packages/contracts/ui-actions.schema.json` `packages/skills/<name>/skill.md` | 改动需 A 确认 |
| 禁止 | `apps/web/**` `packages/ui-kit/**` `阿洛娜4.6版本/**` Blender 目录 | 完全不动 |

---

## 2. M5.1 数据底座（W1-W2）

### 2.1 数据库迁移（拆 4 个 + 1 个 audit 扩展）

`infra/db/versions/` 已有 001-004。新增：

#### `005_schedule.py`
```sql
CREATE TABLE schedule (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  body          TEXT,
  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ,
  rrule         TEXT,
  reminder_min  INTEGER,
  status        TEXT NOT NULL DEFAULT 'pending',
  source        TEXT NOT NULL DEFAULT 'manual',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_schedule_user_starts ON schedule(user_id, starts_at);
```

#### `006_feeds.py`
```sql
CREATE TABLE feed (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  title       TEXT,
  category    TEXT,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  last_fetched_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, url)
);
CREATE TABLE feed_item (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id     UUID NOT NULL REFERENCES feed(id) ON DELETE CASCADE,
  guid        TEXT NOT NULL,
  title       TEXT NOT NULL,
  link        TEXT,
  summary     TEXT,
  published_at TIMESTAMPTZ,
  read        BOOLEAN NOT NULL DEFAULT FALSE,
  starred     BOOLEAN NOT NULL DEFAULT FALSE,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(feed_id, guid)
);
CREATE INDEX idx_feed_item_feed_pub ON feed_item(feed_id, published_at DESC);
```

#### `007_memory.py`
```sql
CREATE TABLE memory_entry (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  content     TEXT NOT NULL,
  tags        TEXT[],
  source_msg_id UUID REFERENCES message(id) ON DELETE SET NULL,
  weight      REAL NOT NULL DEFAULT 1.0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ
);
CREATE INDEX idx_memory_user_kind ON memory_entry(user_id, kind);
```

#### `008_vm.py` （新版含 console 字段）
```sql
CREATE TABLE vm (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  hypervisor      TEXT NOT NULL,    -- libvirt|vbox|mock
  spec_cpu        INTEGER,
  spec_ram_mb     INTEGER,
  spec_disk_gb    INTEGER,
  status          TEXT NOT NULL DEFAULT 'stopped',
  ip              TEXT,
  notes           TEXT,
  -- 新增：control surface
  console_path    TEXT,             -- 串口/PTY 设备路径（Linux 真实接入）
  guest_agent_ok  BOOLEAN NOT NULL DEFAULT FALSE,  -- 是否装了 qemu-guest-agent
  exec_enabled    BOOLEAN NOT NULL DEFAULT FALSE,  -- 用户是否同意此 VM 接受 LLM exec
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, name)
);
```

`exec_enabled` 默认 false，必须用户**显式**在前端勾选"允许阿洛娜在此 VM 内执行命令"才置为 true。

#### `009_audit_extension.py`
```sql
ALTER TABLE audit ADD COLUMN tool_name TEXT;
ALTER TABLE audit ADD COLUMN args_hash TEXT;
ALTER TABLE audit ADD COLUMN status TEXT;
ALTER TABLE audit ADD COLUMN latency_ms INTEGER;
ALTER TABLE audit ADD COLUMN result_truncated TEXT;  -- VM exec 输出 head 256B
CREATE INDEX idx_audit_user_ts ON audit(user_id, created_at DESC);
```

SQLAlchemy 模型对应放在 `services/api-gateway/app/models/{schedule,feed,memory,vm}.py`，全部继承 `Base`。

### 2.2 OpenAPI 路由补齐

修改 `packages/contracts/openapi.yaml`：

| Path | Method | 转发到 |
|---|---|---|
| `/schedules` `/schedules/{id}` | GET POST PATCH DELETE | agent |
| `/feeds` `/feeds/{id}` `/feeds/{id}/items` `/feeds/items/{id}/read` `/feeds/items/{id}/star` | GET POST DELETE | agent |
| `/memory/entries` `/memory/entries/{id}` | GET POST DELETE | agent |
| `/system/status` | GET | perception |
| `/vms` `/vms/{id}` `/vms/{id}/start` `/vms/{id}/stop` | GET POST DELETE | perception |
| **`/vms/{id}/console`** | GET | perception（新增） |
| **`/vms/{id}/exec_enable`** | POST | perception（新增，用户开关） |
| `/network/devices` | GET | perception |
| `/assets/live2d/arona/*` `/assets/scenes/*.glb` | GET | api-gateway 直供 |

跑 `make generate-types` 通知 A、C。

### 2.3 真实 handler 落地

**Agent bridge 侧** (`services/agent/bridge/`)：
- 新增 `db/` 目录，封装 PG 连接池
- 新增 `handlers/{schedules,feeds,memory}.js`
- `server.js` 挂载路由
- 用户上下文从 api-gateway 注入的 `X-User-Id` header 读

**RSS 拉取**：把 `rss-fetcher.js` 从 mock 改成"按 user_id 拉对应 feed.url，结果落 feed_item 表"，频率 15 分钟，失败重试 3 次。

**Perception 侧**：
- `app/api/system.py` 补 `/api/system/status` 聚合
- `app/api/vms.py` 已有 mock，本阶段加 console / exec 路由（见 §4）
- `app/api/network.py` Mac 阶段 mock，Linux 接 nmap

### 2.4 验收（M5.1 DoD）
- [ ] `alembic upgrade head` 干净库跑通，5 个新表（schedule/feed/feed_item/memory_entry/vm）+ audit 扩展
- [ ] `pytest services/api-gateway/tests/integration/` 全过
- [ ] curl 5 个核心 endpoint 各拿到真数据
- [ ] **租户隔离测试**：user_a 访问 user_b 的 schedule.id → 404 + audit
- [ ] OpenAPI spectral lint 全过

---

## 3. M5.2 OpenClaw 接入与安全护栏（W3-W4）

### 3.1 Sandbox 设计

`services/agent/bridge/sandbox/` 新目录。

```javascript
// services/agent/bridge/sandbox/index.js
const { ALLOWED_TOOLS } = require('./tool-registry');
const { auditLog } = require('./audit');
const { validatePath } = require('./path-guard');
const { isWhitelistedUrl } = require('./url-guard');

async function safeInvoke(toolName, args, ctx) {
  if (!ctx?.userId) throw new SandboxError('NO_USER_CONTEXT');
  if (!ALLOWED_TOOLS.has(toolName)) {
    await auditLog({ userId: ctx.userId, tool: toolName, status: 'denied_unknown' });
    throw new SandboxError(`TOOL_NOT_ALLOWED: ${toolName}`);
  }
  if (args.path) validatePath(args.path, ctx);
  if (args.url && !isWhitelistedUrl(args.url)) {
    throw new SandboxError(`URL_NOT_ALLOWED: ${args.url}`);
  }
  const start = Date.now();
  try {
    const result = await invokeHandler(toolName, args, ctx);
    await auditLog({ userId: ctx.userId, tool: toolName, args, status: 'ok', latency: Date.now() - start });
    return result;
  } catch (e) {
    await auditLog({ userId: ctx.userId, tool: toolName, args, status: 'error', error: e.message });
    throw e;
  }
}
```

### 3.2 Tool Registry

```javascript
// services/agent/bridge/sandbox/tool-registry.js
const ALLOWED_TOOLS = new Set([
  'schedules.list', 'schedules.create', 'schedules.update', 'schedules.delete',
  'feeds.list', 'feeds.add', 'feeds.remove', 'feeds.items.list', 'feeds.items.mark_read',
  'memory.search', 'memory.add', 'memory.delete',
  'system.status',
  'vms.list', 'vms.start', 'vms.stop',
  'vms.console.tail',         // ← 新增
  'vms.console.exec',         // ← 新增（强护栏）
  'ha.devices.list', 'ha.devices.toggle', 'ha.scenes.activate',
  'ui.toast', 'ui.navigate', 'ui.render_card',
]);
```

**禁止工具反例**（必须确保即使被注入也调不到）：
`shell.exec`, `fs.read`, `fs.write`, `git.*`, `docker.*`, `python.eval`, `http.request`（除非 wrapper）

### 3.3 6 个核心 Skill 落地
每个 `packages/skills/<name>/`：`skill.md` + `schema.json`（`additionalProperties: false`）+ `handler.py` + `tests/`。

1. `schedules` — list / create / update / delete + RRULE 解析
2. `feeds` — add / remove / list + items.list / mark_read / star
3. `memory` — search（全文 + 标签）/ add / delete
4. `system` — status（聚合 perception）
5. `vms` — list / start / stop / **console.tail** / **console.exec**（详见 §4）
6. `ha` — devices.list / toggle / scenes.activate

### 3.4 Injection Guard 增强

`services/agent/bridge/injection-guard.js` 加新规则：
```javascript
/读取.{0,20}(源码|代码|配置|env|secret|token)/iu,
/执行.{0,20}(命令|shell|bash|docker|git)/iu,
/(切换|登录|假装).{0,20}(用户|账号|管理员)/iu,
/(查看|访问).{0,20}(其他用户|别人的)/iu,
/(rm\s+-rf|dd\s+if=|mkfs|shutdown|reboot)/iu,
```

命中后：拒答 + audit + SSE 推 `ui_action.toast`：「这个请求触发了安全护栏」+ LLM 位置插温和回复：「这件事我做不到呢～」

### 3.5 SSE 流增强（与 A 协调）
新事件类型：
```
event: tool_call
data: {"id":"call_xxx","tool":"schedules.list","args":{...}}

event: tool_result
data: {"id":"call_xxx","tool":"schedules.list","status":"ok","result":{...}}

event: ui_action
data: {"action":{"type":"live2d.set_expression","name":"星星眼"}}

event: ui_action
data: {"action":{"type":"vm.console_followup","vm_id":"...","tail_lines":50}}
```

### 3.6 验收（M5.2 DoD）
- [ ] 6 个 skill 各写一句对话 demo（gif），LLM 正确触发
- [ ] sandbox unit test：注入 `shell.exec` / `fs.read('/etc/passwd')` / `http.request('https://evil.com')` → 全拒 + audit
- [ ] injection-test.js 100% 通过
- [ ] 跨用户测试：user_a 用 prompt「帮我看看 user_b 的日程 / VM」→ LLM 拒绝 + audit
- [ ] `docs/Phase5_三人冲刺计划/adr_OpenClaw安全护栏.md` 已写

---

## 4. M5.2 加强项 · 受限 VM 控制台（用户明确要求）

> **用户原话**："openclaw 要是可以读取和操作用户自己创建的虚拟机的状态就好了，或许可以让 openclaw 读取到虚拟机的输出命令行？"

实现两个 skill 工具：`vms.console.tail`（只读）+ `vms.console.exec`（受限写）。

### 4.1 架构

```
LLM 调 vms.console.tail / exec
    ↓
sandbox.safeInvoke
    ↓ 检查 ctx.user_id 与 vm.user_id 一致
    ↓ 检查 vm.exec_enabled（exec 才需要）
    ↓ 命令白名单
    ↓
perception /api/vms/{id}/console 或 /api/vms/{id}/exec
    ↓
core/vm/<backend>.py（Mac: mock，Linux: libvirt + qemu-guest-agent）
    ↓ 串口日志读取 / qga 命令执行
    ↓
返回 stdout / stderr / exit_code（截断到 1MB）
    ↓
sandbox 写 audit（含 result_truncated 256B 摘要）
    ↓
SSE 推 tool_result + ui_action.vm.console_followup
```

### 4.2 `vms.console.tail` 设计

```python
# packages/skills/vms/handler.py
def console_tail(payload: dict, ctx: SkillContext) -> dict:
    vm_id = payload['vm_id']
    n = min(payload.get('lines', 50), 200)  # 上限 200 行
    vm = db.query(VM).filter(VM.id == vm_id, VM.user_id == ctx.user_id).first()
    if not vm:
        raise SkillForbidden('VM 不存在或不是你的')
    # Mac mock：从 mock store 拿
    # Linux libvirt：读 /var/log/libvirt/qemu/<name>.log 末尾 N 行
    return {
        'vm_id': vm_id,
        'lines': read_console_tail(vm, n),
        'truncated': False,
    }
```

`schema.json`:
```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["vm_id"],
  "properties": {
    "vm_id": {"type": "string", "format": "uuid"},
    "lines": {"type": "integer", "minimum": 1, "maximum": 200, "default": 50}
  }
}
```

### 4.3 `vms.console.exec` 设计

**多重护栏**：

1. **VM 必须是当前用户的** —— `vm.user_id == ctx.user_id`，否则 403
2. **VM 必须显式启用 exec** —— `vm.exec_enabled == true`（用户在前端打勾），否则返回提示让用户开启
3. **必须装了 qemu-guest-agent** —— `vm.guest_agent_ok == true`，否则提示安装
4. **命令白名单**：
   ```python
   ALLOWED_BINS = {
     # 信息查看
     'ls', 'cat', 'head', 'tail', 'grep', 'find', 'wc', 'stat',
     'ps', 'top', 'free', 'df', 'du', 'uptime', 'who', 'w',
     'uname', 'hostname', 'whoami', 'id', 'date',
     'ip', 'ss', 'netstat', 'ping',  # 网络只读
     # 包管理（只查不装）
     'apt list', 'dpkg -l', 'pip list', 'npm list',
     # 服务（只查不控）
     'systemctl status', 'systemctl is-active', 'journalctl --no-pager -n',
     # docker 只查
     'docker ps', 'docker logs', 'docker images',
     # git 只查
     'git status', 'git log', 'git branch',
   }
   ```
5. **黑名单（无论用户 VM 也拒绝）**：
   ```python
   FORBIDDEN_PATTERNS = [
     r'\brm\s+-rf?\b', r'\bdd\s+if=', r'\bmkfs\b', r'\bshutdown\b',
     r'\breboot\b', r'\biptables\b', r'\bufw\b',
     r'\bsudo\s+(passwd|useradd|userdel|visudo)',
     r'>\s*/dev/(sd|nvme|hd)', r':\(\)\{', r'\bcurl\b.*\|\s*sh',
     r'\bwget\b.*\|\s*sh', r'\beval\b', r'\bexec\b',
   ]
   ```
6. **超时 10 秒**，超时强杀
7. **输出截断 1MB**，超出截断 + 标注 `truncated: true`
8. **每次执行**前端会先收到一个 `ui_action.confirm`，需要用户在 UI 上点"确认"才真正执行（或在 skill.md 教 LLM 自己说"我要在 VM-build 里跑 `df -h` 可以吗？"，等用户口头同意再调用）

```python
def console_exec(payload: dict, ctx: SkillContext) -> dict:
    vm_id = payload['vm_id']
    cmd = payload['command']

    vm = db.query(VM).filter(VM.id == vm_id, VM.user_id == ctx.user_id).first()
    if not vm: raise SkillForbidden('VM 不属于你')
    if not vm.exec_enabled:
        return {'denied': True, 'reason': 'vm_exec_disabled', 'hint': '请在 VM 设置中允许执行命令'}
    if not vm.guest_agent_ok:
        return {'denied': True, 'reason': 'no_guest_agent', 'hint': '此 VM 未安装 qemu-guest-agent'}

    if not is_allowed_command(cmd):
        audit_log(ctx, 'vms.console.exec', cmd, 'denied_command')
        return {'denied': True, 'reason': 'command_not_allowed', 'cmd': cmd}

    if matches_forbidden(cmd):
        audit_log(ctx, 'vms.console.exec', cmd, 'denied_forbidden')
        raise SkillForbidden('该命令被禁止')

    # 通过 libvirt + qga 执行（Linux）/ mock（Mac）
    result = vm_backend.exec_in_guest(vm, cmd, timeout=10, max_output=1024*1024)
    audit_log(ctx, 'vms.console.exec', cmd, 'ok',
              result_truncated=result['stdout'][:256])
    return result
```

### 4.4 用户在前端开关

新 endpoint `POST /api/vms/{id}/exec_enable` body `{enabled: true}`，让用户主动给单台 VM 打开"允许阿洛娜执行命令"开关。Mac dev 阶段提供一个默认开启的种子 VM，方便联调。

### 4.5 文档

落地后写：
- `packages/skills/vms/skill.md` 末尾示例对话：
  ```
  用户：阿洛娜，看一下 VM-build 这两天怎么了
  阿洛娜：好的～我看一下 VM-build 的日志（调用 vms.console.tail）
  用户：在里面跑一下 `df -h` 看看磁盘
  阿洛娜：可以呀，我要在 VM-build 里执行 `df -h`，可以吗？
  用户：可以
  阿洛娜：（调用 vms.console.exec）
  ```
- `docs/Phase5_三人冲刺计划/adr_VM受限exec.md` 详细记录护栏决策

### 4.6 验收
- [ ] user_a 的 VM 用 user_b 的 token 调 console.exec → 403 + audit
- [ ] LLM 注入 `rm -rf /` → 黑名单拒绝 + audit
- [ ] LLM 调 `vim`（不在白名单）→ denied_command
- [ ] 超时命令 `sleep 30` → 10s 后强杀 + audit
- [ ] 大输出（如 `find /`）→ 截断 1MB + `truncated: true`
- [ ] Mac mock 模式下：注册一个种子 VM，能完整跑通 `df -h`、`uptime`、`ps`
- [ ] Linux libvirt 模式（在 Ubuntu 联调阶段验证）：真 VM 装 qemu-guest-agent，跑通同样的命令

---

## 5. M5.3 LLM 情绪信号 + 静态资产路由（W5-W6）

### 5.1 系统提示词约定

修改 `services/agent/workspace/IDENTITY.md` + `SOUL.md` 新增：

```markdown
## 情绪表达规则
你是阿洛娜，一个有性格的助手。在每次回复的末尾，追加一组标签来表达你此刻的状态：
- [emotion:happy|curious|sad|surprised|angry|sleepy|neutral]  必填
- [expr:<表情名>]  可选
- [motion:<动作名>]  可选

可用表情：哭哭、嘴变形、嘴变形2、圈圈、墨镜、抓抓、指纹锁、挤眼、星星眼、流口水、牛奶、猫猫、生气、眯眼、脸红、螺旋、阴脸
可用动作：idle、水饺

例：
"好的～我帮你查到了三条日程！[emotion:happy][expr:星星眼]"
"啊…这个我做不到呢… [emotion:sad][expr:哭哭]"

标签不会被用户看到，由前端读取来驱动你的形象。
```

### 5.2 解析与剥离

`services/agent/bridge/server.js`：
```javascript
const TAG_RE = /\[(emotion|expr|motion):([^\]]+)\]/g;
function parseAndStripTags(textChunk, sessionState) {
  const found = [];
  const stripped = textChunk.replace(TAG_RE, (_, type, value) => {
    found.push({ type, value: value.trim() });
    return '';
  });
  return { stripped, tags: found };
}
```

每发现一个 tag 立即推 `ui_action`：
- `emotion` → `live2d.set_emotion`
- `expr` → `live2d.set_expression`
- `motion` → `live2d.play_motion`

### 5.3 静态资产路由

`services/api-gateway/app/api/assets.py` 新建：
- `GET /api/assets/live2d/arona/manifest.json` —— 返回干净路径映射，避开中文 + 长 hash 文件名
- `GET /api/assets/live2d/arona/*` —— `StaticFiles` 暴露 `阿洛娜4.6版本/阿洛娜4.6/` 目录，加 `Cache-Control: max-age=86400`
- `GET /api/assets/scenes/*.glb` —— 暴露 `apps/web/public/assets/scenes/`（A 离线导出后 commit）

manifest 例：
```json
{
  "modelPath": "/api/assets/live2d/arona/model3.json",
  "expressions": {
    "星星眼": "/api/assets/live2d/arona/expressions/星星眼.exp3.json",
    "...": "..."
  },
  "motions": {
    "Idle": [
      "/api/assets/live2d/arona/idle.motion3.json",
      "/api/assets/live2d/arona/水饺.motion3.json"
    ]
  }
}
```

### 5.4 验收
- [ ] 跟阿洛娜说"今天好开心"，前端能看到 `live2d.set_emotion: happy` SSE
- [ ] LLM 输出末尾标签全部被剥离
- [ ] `/api/assets/live2d/arona/manifest.json` 返回干净路径
- [ ] 5+ 种情境 LLM 选合适表情 / 动作

---

## 6. M5.4 联调与压测（W7）

- [ ] 全链路 e2e：登录 → 与阿洛娜对话 → 创建 schedule → 列表刷新 → 阿洛娜表情变化
- [ ] VM 全链路：让阿洛娜读 console + 执行白名单命令，前端可视化
- [ ] 并发压测：10 用户 × 3 路 SSE × 30s
- [ ] 安全 review checklist 走完

---

## 7. M5.5 验收与归档（W8）

- [ ] 总纲 §5 所有后端项 ✅
- [ ] `docs/Phase5_三人冲刺计划/adr_OpenClaw安全护栏.md`
- [ ] `docs/Phase5_三人冲刺计划/adr_VM受限exec.md`
- [ ] `log_B_W*.md` 完整
- [ ] 所有新 skill 的 `skill.md` 完整

---

## 8. 与 A、C 的协议

### 与 A
1. OpenAPI 改完 → 跑 `make generate-types-ts` → 通知 A
2. 新增 SSE 事件类型 → 改 `ws-events.schema.json` → 通知 A
3. ui_action type 扩展 → 在 `ui-actions.schema.json` 提 PR，A 评审
4. 静态资产路由变化（live2d / scenes）→ 通知 A

### 与 C
1. C 在 dev/test 期可能跑性能压测 → 提供专用 token 给 C
2. C 实现 Web Vitals 上报需要后端接收端点 → 提供 `POST /api/internal/metrics` 收口
3. C 用 Service Worker 做离线缓存策略时 → 与 B 协商哪些 endpoint 可缓存（GET 只读 + 短 TTL）

---

## 9. 自检清单（每个 PR 提交前）

```bash
make lint && make typecheck && make test && make test-integration && make contract-test
node services/agent/bridge/injection-test.js
```

---

## 10. Ubuntu 真机准备（你的预交付）

详见 `99_Ubuntu真机联调准备清单.md`。摘要：

- [ ] 所有 mock 后端有等价 Linux 实现：libvirt VM backend、camera backend、serial backend、HA client、NAS client
- [ ] `infra/scripts/deploy-linux.sh` 完整可跑（你已有骨架，本阶段补全）
- [ ] systemd 单元文件：`infra/systemd/{api-gateway,agent,perception,web}.service`
- [ ] `docker-compose.prod.yml` 仅留 PG + Redis（其余服务用 systemd 跑在宿主）
- [ ] qemu-guest-agent 安装 / 配置文档（用户在 Ubuntu 自己 VM 里装）
- [ ] 数据库种子脚本可重入；初次部署能从空库一键到可用
- [ ] 准备好"Mac mock → Linux 实物" 的环境变量切换矩阵（写在 `docs/Phase5_三人冲刺计划/99_*.md`）
