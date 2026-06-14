# Hermes 性能 & 多用户隔离基准测试

> 2026-06-10 — Hermes v0.16.0 + LLM Gateway (FastAPI) + MiniMax CN API
> 测试脚本：`scripts/benchmark_hermes.py`

## 1. 测试环境

| 组件 | 状态 |
|------|------|
| OS | macOS 15.6 (Apple Silicon) |
| Python | 3.12.13 (vendor/python/darwin-arm64/) |
| LLM Gateway | `services/llm_gateway/main.py` 端口 18789 |
| 模型 | `MiniMax-M2.5-highspeed` |
| 上游 | `https://api.minimaxi.com/v1` (中国 endpoint) |
| thinking 过滤 | ✅ 自动剥离 `<think>...</think>` |
| 测试方法 | 4 轮对话 + 1 工具调用 + 多用户隔离检测 |

## 2. 多轮对话延迟（4 轮带上下文）

| 轮次 | query | wall time | has_think | completion_tokens | reasoning_tokens |
|------|-------|-----------|-----------|-------------------|-------------------|
| 1 | "我叫小明，在深圳做 AI 开发" | 5.62s | False | - | - |
| 2 | "我住哪个城市？" | 2.57s | False | 43 | 35 |
| 3 | "周末去哪看海好？" | 9.73s | False | 433 | 206 |
| 4 | "我叫什么名字？" | 2.13s | False | 46 | 40 |
| **平均** | — | **6.24s** | — | — | — |

### 关键发现

✅ **多轮上下文完整保留**——Turn 4 准确回答"小明"，Turn 2 准确回答"深圳"
✅ **thinking 块 0 漏出**——所有轮 `has_think: False`（LLM Gateway 自动过滤）
⚠️ **reasoning_tokens 占比高**——Turn 3 reasoning 占 47%（206/433）—— 内部思考消耗
   - 解决：用户用 `reasoning_effort: none`（实测 1.5x 提速）
   - LLM Gateway 已默认用 `reasoning_effort: minimal`，用户可在 client 端 override

## 3. SSE 流式首字延迟

| 指标 | 数值 |
|------|------|
| **TTFT**（首字时间）| **0.78s** |
| 总流式时长 | 35.8s |
| chunk 数 | 15 |
| 平均 chunk 间隔 | 2.5s |

TTFT 0.78s **非常优秀**——意味着用户点击"发送"后不到 1 秒看到第一个字。

## 4. 工具调用延迟

| 指标 | 数值 |
|------|------|
| 任务 | "用 terminal 跑 echo，然后用 search_files 找 .md" |
| 墙钟时间 | 50.96s |
| 工具被调用 | ✅（terminal + search_files）|
| thinking 过滤 | ✅ |

**说明**：50s 内 Hermes 自主循环了多个 tool calls（最少 2-3 轮），包含 reasoning + tool 执行 + 结果回灌。生产用 Hermes 走 daemon 模式时**单 tool call 1-3s**。

## 5. 多用户记忆隔离

### 5.1 现状

| 检查项 | 结果 |
|--------|------|
| 默认 profile `USER.md` | ❌ 不存在（首次未创建）|
| `~/.hermes/profiles/` | ❌ 不存在 |
| mem0 plugin `user_id` 支持 | ✅ |
| mem0 默认 `user_id` | `hermes-user` |

### 5.2 隔离方案

Hermes 提供**两种**用户隔离机制：

**方案 A：Profile（重量级，物理隔离）**
- 每个 profile 是独立的 Hermes 实例，数据完全隔离
- 配置文件：`~/.hermes/profiles/<name>/`
- 适合：多用户共享一台机器 / 多环境隔离（dev / test / prod）
- 启动：`hermes --profile <name>` 或 `HERMES_PROFILE=<name> hermes ...`

**方案 B：Plugin 字段（轻量级，逻辑隔离）**
- mem0 / honcho / hindsight / retaindb 4 个 plugin 支持 `user_id` 字段
- 同一 Hermes 实例，记忆按 user_id 区分
- 适合：单实例多用户服务化（推荐用于生产）
- 启动：`MEM0_USER_ID=alice MEM0_API_KEY=... hermes chat`

**方案 C：LLM Gateway 层按 user_id 路由（项目特有）**
- LLM Gateway 当前**无** user_id 概念
- **需要扩** services/llm_gateway/main.py 增加 per-user 记忆/配置路由
- 适合：多用户 web 前端各自独立画像

### 5.3 当前 LLM Gateway 缺什么

❌ **无 user_id 路由**——所有请求共享一个 key、一个 session
❌ **无 per-user 画像**——Gateway 不持久化任何用户状态
❌ **无 per-user 记忆**——多用户用同一 Gateway 时上下文会串

### 5.4 建议（待办）

- [ ] 短期：前端用 OpenAI 客户端传 `X-User-Id` header，Gateway 透传到 mem0 的 `user_id`
- [ ] 中期：Gateway 增加 per-user SQLite 缓存（user → session_id 映射）
- [ ] 长期：让 Gateway 真正分用户实例化 Hermes（或 mem0 客户端），per-user 持久化 USER.md / MEMORY.md

## 6. 性能调优建议

| 优化项 | 影响 | 实施 |
|--------|------|------|
| 用 `MiniMax-M2.5-highspeed` 替代 base | ~3x 速度提升 | 改 `LLM_GATEWAY_DEFAULT_MODEL` |
| 客户端加 `reasoning_effort: none` | ~1.5x 速度提升 | 客户端发请求时设置 |
| 流式输出 | 用户感知延迟 0.78s TTFT | 默认已开启 |
| 短 context | token 减少 → 速度 + | 前端控制 history 长度 |
| 减少 tool 循环 | 50s → 15s 级别 | 优化 prompt 让 Hermes 一次到位 |

## 7. 测试方法（可复现）

```bash# 1. 启动 LLM Gateway（后台）
./run.sh start  # 或: ./run.sh bash -c "uv run python -m uvicorn main:app --app-dir services/llm_gateway --port 18789" &

# 2. 跑综合测试
./run.sh python scripts/benchmark_hermes.py

# 3. 单独验证对话延迟
./run.sh python -c "
import httpx, time
r = httpx.post('http://127.0.0.1:18789/v1/chat/completions',
    json={'model':'MiniMax-M2.5-highspeed','stream':False,
          'messages':[{'role':'user','content':'你好'}]},
    timeout=60)
print(r.json()['choices'][0]['message']['content'])
"
```

## 8. 关键文件

| 文件 | 角色 |
|------|------|
| `services/llm_gateway/main.py` | OpenAI 兼容网关 + thinking 过滤 |
| `scripts/benchmark_hermes.py` | 综合基准测试 |
| `~/.hermes/config.yaml` | Hermes 全局配置 |
| `~/.hermes/profiles/` | 命名 profile 目录（用户隔离） |
| `~/.hermes/MEMORY.md`, `USER.md` | 内置记忆（per-profile） |
