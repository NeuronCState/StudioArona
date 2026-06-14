# 多用户 Hermes 架构

> 状态：2026-06-10 实现落地。LLM Gateway v2.0.0 起，所有用户上下文都按用户隔离。

## 目标

每个登录用户拥有：
- 独立的 `hermes gateway` 守护进程（独立 PGID，独立 HERMES_HOME 树）
- 独立的 `USER.md` / `MEMORY.md` / `skills/` / `cron/` / `state.db`
- 独立的 LLM 会话上下文（USER.md + 记忆 + 技能 + 实时环境自动注入 system prompt）
- 30 分钟空闲自动回收（避免内存堆积）
- 后端崩溃（`run.sh` Ctrl+C）时全量清理

## 架构图

```
                            ┌──────────────────────────┐
   Web (React)              │  api-gateway (:8080)     │
   apps/web  ───────────────┤  /api/* 反代到下游        │
                            └──────────┬───────────────┘
                                       │
       ┌───────────────┬───────────────┼───────────────┐
       │               │               │               │
       ▼               ▼               ▼               ▼
   ┌────────┐    ┌──────────┐    ┌─────────┐    ┌────────────────┐
   │ agent  │    │perception│    │memory/..│    │ llm_gateway    │
   │  :18790│    │   :8002  │    │ /api/.. │    │    :18789      │
   └────────┘    └──────────┘    └─────────┘    └───────┬────────┘
                                                        │
                                                        │ (lazy spawn)
                                                        │  X-User-Id
                                                        ▼
                                                ┌───────────────────┐
                                                │  hermes gateway   │
                                                │  --profile <user> │
                                                │  PGID 独立        │
                                                └────────┬──────────┘
                                                         │
                              ┌──────────────────────────┼──────────────────────────┐
                              ▼                          ▼                          ▼
                       ~/.hermes/profiles/         ~/.hermes/profiles/         ~/.hermes/profiles/
                          <user_a>/                    <user_b>/                    <user_c>/
                         ├─ USER.md                   ├─ USER.md                   ├─ USER.md
                         ├─ MEMORY.md                 ├─ MEMORY.md                 ├─ MEMORY.md
                         ├─ skills/                   ├─ skills/                   ├─ skills/
                         ├─ cron/                     ├─ cron/                     ├─ cron/
                         ├─ state.db                  ├─ state.db                  ├─ state.db
                         └─ hermes.log                └─ hermes.log                └─ hermes.log
```

## 配置

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `HERMES_BASE_HOME` | `~/.hermes` | 所有用户 profile 的根目录 |
| `LLM_GATEWAY_HOST` | `127.0.0.1` | LLM Gateway 监听 |
| `LLM_GATEWAY_PORT` | `18789` | LLM Gateway 端口 |
| `LLM_GATEWAY_URL` | `http://127.0.0.1:18789/v1/chat/completions` | Node bridge 调用入口 |
| `LLM_GATEWAY_SERVICE_URL` | `http://localhost:18789` | api-gateway 反代上游 |
| `LLM_GATEWAY_IDLE_TIMEOUT` | `1800`（30 分钟） | 空闲秒数，超时 kill |
| `LLM_GATEWAY_WARMUP_DAYS` | `15` | 启动时预热 last_login_at 在 N 天内的用户 |
| `MINIMAX_CN_API_KEY` | — | 上游 LLM API key |
| `MINIMAX_CN_BASE_URL` | `https://api.minimaxi.com/v1` | 上游 LLM base |

### 跨平台 hermes 路径

`run.sh` / `run.bat` / `infra/scripts/install_deps.py` 在 `hermes` step 检测：
- macOS: `~/.local/bin/hermes`（用 pipx 或 pip --user 装）
- Linux: 同上
- Windows: `%LOCALAPPDATA%\Programs\Python\hermes.exe`（pip --user）

## LLM Gateway 内部实现

### 进程模型

`UserSessionManager` 维护 `user_id → UserSession` 字典：

```python
class UserSession:
    user_id: str
    pid: Optional[int]         # hermes CLI 进程 PID
    pgid: Optional[int]        # 独立进程组
    last_active: float         # last request timestamp
    started_at: float
    spawn_lock: asyncio.Lock   # 防并发 spawn
```

**关键不变量：**
- 每个用户 **最多一个** hermes 进程（singleton）
- `Popen(..., start_new_session=True)` → PGID 独立 → kill 不影响其他用户
- spawn 时 await `asyncio.create_subprocess_exec` 的 lock → 同一用户并发请求只 spawn 一次
- last_active 在每次 `/v1/chat/completions` 命中更新

### Spawn 触发时机

1. **冷启动 warmup**（gateway 启动后 5 秒）：SQL 查 `users.last_login_at >= now - 15d` 的活跃用户，并行 spawn。
2. **Lazy spawn**（首个 `/v1/chat/completions` 请求带 `X-User-Id`）：用户登录或首问触发。
3. **API 触发**：`POST /v1/users/{user_id}/sessions/refresh` 手动预热。

### Kill 触发时机

1. **Idle cleanup**（每 60 秒跑一次）：`now - last_active > 30 min` → SIGTERM → 3s grace → SIGKILL
2. **Gateway shutdown**（SIGINT/SIGTERM）：`kill_all()` 同步杀所有 PGID
3. **API 触发**：`POST /v1/users/{user_id}/sessions/refresh?action=kill`

### 上下文注入（system prompt 增强）

每次 `/v1/chat/completions` 处理时，`inject_user_context()` 在原 `messages[0].content` 前追加 `[Hermes 用户专属上下文 — <user_id>]` 块：

```
[Hermes 用户专属上下文 — alice]

### USER.md
（用户自描述 + 偏好）

### MEMORY.md 摘要
（最近 N 条关键记忆）

### 已注册技能
- summarize-arona-conversation  （用户编写）
- daily-standup-report          （Hermes 自动生成）
- ...

### 实时环境
- CPU 温度: 52°C
- 本机时间: 周一 14:32
- 今日日程 (3):
  - 14:00-15:00 团队周会
  - 16:30-17:00 设计评审
- 活跃 VM (2):
  - devbox (192.168.1.42)
  - staging (192.168.1.51)
- 天气: 22°C 多云 (上海)
```

子获取（CPU/日程/VM/天气）并行 `asyncio.gather`，1 秒超时，失败 silent skip。

## API 端点

| Method | Path | 用途 |
|--------|------|------|
| `GET`  | `/health` | 健康检查（无 auth） |
| `GET`  | `/v1/models` | 列出可用模型（OpenAI 兼容） |
| `POST` | `/v1/chat/completions` | OpenAI 兼容聊天（带 thinking 过滤） |
| `GET`  | `/v1/users/{user_id}/skills` | 列出用户技能（user + hermes 双源） |
| `GET`  | `/v1/users/{user_id}/memory` | 读 USER.md / MEMORY.md |
| `POST` | `/v1/users/{user_id}/sessions/refresh` | 手动预热（`?action=kill` 强制杀掉） |

### 反代路由

`api-gateway/app/proxy/routes.py` 新增：

```python
@router.api_route('/api/v1/chat/{path:path}', methods=['POST'])
async def proxy_v1_chat(path: str, request: Request):
    return await forward_to('llm_gateway', f'v1/chat/{path}', request)

@router.api_route('/api/v1/models', methods=['GET'])
async def proxy_v1_models(request: Request):
    return await forward_to('llm_gateway', 'v1/models', request)

@router.api_route('/api/v1/users/{path:path}', methods=['GET','POST','PATCH','DELETE'])
async def proxy_v1_users(path: str, request: Request, user: User = _CurrentUser):
    _set_user_state(request, user)
    return await forward_to('llm_gateway', f'v1/users/{path}', request)
```

> 注：`/v1/chat/completions` 不走 auth（Node bridge 用 `X-User-Id` 直接传）。`/v1/users/*` 走 auth。

## 前端页面

`apps/web/src/pages/skills/SkillsPage.tsx` — 仿 MemoryPage 风格，展示当前用户的技能库，按 user/hermes 双 tab 分类。侧边栏入口：`/skills`（图标 Sparkles）。

## 测试

`scripts/test_multi_user_isolation.py`（3 个集成测试）：

```
✓ test_isolated_user_context         # alice/bob 各自的 USER.md 互不污染
✓ test_skills_dual_origin            # skills 列表正确分类 user vs hermes
✓ test_spawn_and_idle_kill           # spawn → 3 秒后 idle → kill → 验证 PID 死
✅ all tests passed
```

跑：`./run.sh pytest scripts/test_multi_user_isolation.py`

## 性能基线

`scripts/benchmark_hermes.py`（4 轮对话，SSE TTFT + 工具调用）：

- 平均 TTFT: **0.78s**（P50 ~0.6s）
- 平均总耗时: **6.24s** / 轮
- 工具调用成功率: **100%**
- 并发隔离: alice 进程崩溃不影响 bob（独立 PGID）

跑：`./run.sh python scripts/benchmark_hermes.py`

## 已知约束

1. **macOS 上 hermes 不响应 SIGTERM** → `_kill()` 用 SIGTERM (3s grace) → SIGKILL 升级。
2. **PID 退出后变成 zombie**（父进程已 detach）→ 测试用 `ps -o state=` 检测 zombie 而不是 `kill -0`。
3. **warmup 失败不致命**：psycopg2 连不上（用户没装 docker）→ 跳过 warmup，懒加载照常工作。
4. **每个用户进程 ~90 MB RSS**（实测 macOS 14.5）：1000 活跃用户 = 90 GB 内存 → 实际不会满载，靠 idle cleanup 控制在 ~30 分钟窗口内。
5. **Windows 上 Popen 进程组隔离**：`start_new_session=True` 在 Windows 上映射到 CREATE_NEW_PROCESS_GROUP，效果一致。

## 跨平台路径速查

| 平台 | HERMES_BASE_HOME 默认 | hermes CLI 安装 |
|------|------------------------|----------------|
| macOS | `~/.hermes` | `pipx install hermes-agent` / `pip install --user hermes-agent` |
| Linux | `~/.hermes` | 同上 |
| Windows | `%USERPROFILE%\.hermes` | `pip install --user hermes-agent`（加到 PATH） |
