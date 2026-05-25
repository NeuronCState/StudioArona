# ADR 0004: OpenClaw 作为 Agent 底座

## Context

Studio Javis 的 Agent 层需要：接入 LLM、管理会话与记忆、调度 Skill、流式输出 SSE。

最初 02 规划书设计了 Python FastAPI + 自研 runtime + 自建 LLM provider 抽象层的方案。但在 W1-W2 实施过程中发现：

1. **OpenClaw（2026.5.18）已覆盖大部分需求**：内置 MiniMax provider、会话管理、记忆系统、Skills 框架、多通道 WebChat
2. **自研成本高**：LLM provider 抽象、流式 SSE、tool_call 解析、会话生命周期、workspace 人设管理等，每一层都需要从零写并测试
3. **OpenClaw 已有生产级质量**：GitHub 1.6k+ stars，Sponsors 含 OpenAI/NVIDIA/Vercel，活跃开发

经过实际验证（Phase 1-7），OpenClaw 基座方案可运行：MiniMax-M2.7 真模型连通、Arona 人设生效、SSE 桥接可用。

## Decision

**使用 OpenClaw 作为 Studio Javis 的 Agent 底座**，采用 npm 依赖方式引入，不 fork 源码。

### 架构

```
OpenClaw Gateway (:18789, Node.js)
    │
    ├── MiniMax-M2.7 Provider (内置)
    ├── Session / Memory (内置)
    ├── Workspace (SOUL.md etc.)
    │
    └── Bridge (:8001, Node.js)     ← B 自建
        ├── SSE 协议转换            ← 前端兼容
        ├── CRUD API (feeds/schedules)
        ├── 安全策略 (risk / injection)
        └── RSS Worker
```

### 4 个接受条件

| # | 条件 | 当前状态 | 验证方式 |
|---|------|---------|---------|
| AC1 | MiniMax-M2.7 流式对话正常 | ✅ 通过 | `openclaw agent --agent main --message "你好"` 返回中文回复 |
| AC2 | Arona 人设通过 SOUL.md 注入且生效 | ✅ 通过 | 回复自称"阿洛娜"，称呼用户"老师" |
| AC3 | 前端 SSE 协议兼容（00 §3.2） | ✅ 通过 | Bridge 提供 session_started / token / done 事件 |
| AC4 | TTFT p95 < 1500ms（W4 验收） | ⚠️ 待优化 | 子进程 spawn 有 2-3s 冷启动，需改为 WebSocket 长连接 |

### Skills 格式

Skills 使用 OpenClaw 原生 SKILL.md 格式（YAML frontmatter + markdown 指令），不再使用 Python handler.py。

C 的 Python handler 保留为 HTTP API 后端，OpenClaw 通过 curl 调用。

### 双语言共存

```
Node.js 域: OpenClaw Gateway + Bridge + Skills
Python 域: api-gateway (D) + perception (C)
```

通过 HTTP API 桥接，不共享内存。

## Consequences

### 正面
- 会话管理、记忆、LLM provider 维护成本归零（OpenClaw 上游承担）
- Skills 声明式编写，不需要 Python 运行时
- 内置 MiniMax provider，API key 管理标准化
- Workspace 文件（SOUL.md 等）自然支持人设迭代

### 负面
- 双语言（Node.js + Python）增加 CI 复杂度
- OpenClaw 上游 breaking change 风险（npm 锁版本缓解）
- 子进程 spawn 冷启动开销（→ WebSocket 长连接解决）
- OpenAI-compat HTTP 端点未启用，SSE 需桥接层

### 中性
- Skills 从 Python handler 迁移为 SKILL.md 声明式
- 自研的 injection guard、perf baseline 等工具仍保留
- Workspace 文件作为配置管理

## Alternatives considered

### A. 纯 Python 自研（原方案）
- 优点：单语言，完全可控
- 缺点：大量基础设施从零写（LLM provider、session、memory、SSE），W1-W2 已验证开发成本高
- 决定：放弃

### B. OpenClaw fork 深度定制
- 优点：可改源码
- 缺点：跟踪上游困难，维护成本高
- 决定：不采用，npm 依赖 + 桥接即可

### C. langchain/langgraph 等框架
- 优点：Python 生态，文档多
- 缺点：太重，多 agent 功能用不上，需要 LLM 无关的 session/channel 框架
- 决定：不采用，过度工程

## Refs
- [OpenClaw GitHub](https://github.com/openclaw/openclaw)
- [OpenClaw Docs](https://docs.openclaw.ai)
- 02 规划书（待对齐）
- `docs/03_AgentB_实施记录_Phase1-7/`
- `docs/03_AgentB_开发总览与完成度.md`
