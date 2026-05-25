# Phase 9 · W1 冲刺总结（B1.1–B1.4）

> **日期**：2026-05-21
> **冲刺**：Mac 阶段收官冲刺计划 W1（5/21–5/27）
> **B 的 4 个任务**

## 任务完成情况

| # | 任务 | 状态 | 验收 |
|---|------|------|------|
| B1.1 | 写 ADR 0004（OpenClaw 锁定 + 4 个接受条件） | ✅ | `docs/adr/0004-openclaw-agent-base.md` |
| B1.2 | 改 02 规划书 §4-§6（删 Python，写 OpenClaw） | ✅ | §4 系统结构 / §5 Skill 规范 / §6 LLM 接入 全部重写 |
| B1.3 | spawn → 常驻 Gateway 复用 | ⚠️ | WS 认证层打通，RPC 被 device identity 拦截。架构就绪，W2 补 device identity |
| B1.4 | 短期记忆接 PG chat_messages | ✅ | `bridge/memory.js` PG + in-memory fallback，跨会话召回测试通过 |

## B1.1 — ADR 0004

- 4 个接受条件（AC1–AC4）
- 与 3 个替代方案对比（纯 Python / fork 深度定制 / langchain）
- 正面/负面/中性后果分析
- 已写入 `docs/adr/0004-openclaw-agent-base.md`

## B1.2 — 02 规划书重写

| 章节 | 变更 |
|------|------|
| §4 系统结构 | Python FastAPI 目录树 → Node.js OpenClaw + Bridge 架构图 |
| §5 Skill 系统 | Python handler.py + skill.md → OpenClaw SKILL.md + B/C 分工 |
| §6 LLM 接入 | 自建 LLMProvider 抽象 → OpenClaw 内置 minimax provider |

## B1.3 — WS 常驻改造

### 已完成
- 逆向 OpenClaw 2026.5.18 WebSocket 协议
- `ws-gateway.js` — GatewayClient class（auth / request / chat / auto-reconnect）
- connect 认证通过（token-based）
- 允许的 client ID 列表已穷举

### 阻塞
- 所有 client type 都需要 device identity（Ed25519 密钥对 + nonce 签名）
- W2 实现 device identity 后可立即启用

### 当前方案
- 子进程 spawn，接受 TTFT < 3000ms 作为 v0.1.0 临时门槛
- 见冲刺计划 R1 回退方案

## B1.4 — 短期记忆

### 实现
- `bridge/memory.js`：
  - `saveMessage(sessionId, userId, role, content)` — PG + memory fallback
  - `getSessionMessages(sessionId)` — 会话历史
  - `searchMessages(keyword)` — 跨会话搜索
  - `buildMemoryContext(userId)` — 最近 10 条注入 prompt
- 集成到 `bridge/server.js`：
  - 每条消息保存到记忆库
  - 用户消息前注入最近对话上下文
  - `GET /api/memory/search?q=xxx` 端点

### 测试
```
saveMessage("test-session", "user-1", "user", "我喜欢咖啡")
saveMessage("test-session", "user-1", "assistant", "已记住，老师喜欢咖啡")
searchMessages("咖啡") → 2 results ✅
buildMemoryContext("user-1") → 3 recent messages ✅
```

### 待 D2.3（W2）
- PG chat_messages 表 + tsvector + GIN 索引
- 届时 memory.js 自动切换到 PG（不需要改代码）

## 文件清单

```
新增:
├── docs/adr/0004-openclaw-agent-base.md           # B1.1
├── docs/03_AgentB_实施记录_Phase8_W1冲刺_B1.3_WS常驻改造.md  # B1.3
├── docs/03_AgentB_实施记录_Phase9_W1冲刺总结.md             # 本文档
├── services/agent/bridge/ws-gateway.js             # B1.3
├── services/agent/bridge/ws-gateway-test.js         # B1.3
├── services/agent/bridge/ws-probe.js                # B1.3
├── services/agent/bridge/ws-auth-test.js            # B1.3
├── services/agent/bridge/memory.js                  # B1.4

修改:
├── docs/规划书/02_AgentB_规划书.md (重写 §4-§6)      # B1.2
├── services/agent/bridge/server.js (集成记忆模块)    # B1.4
├── services/agent/package.json (新增 ws + pg 依赖)
```

## W1 剩余时间 (5/22–5/27)

- [ ] B1.3 补 device identity（W2 前完成）
- [ ] D2.3 PG tsvector 迁移 → B1.4 切 PG 真存储
- [ ] 与 A 联调 SSE 事件 schema
- [ ] 准备 5/30 联调日：至少 1 个 Skill 端到端通
