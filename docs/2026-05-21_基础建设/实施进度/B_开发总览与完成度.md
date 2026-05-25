# 03 · Agent B 开发总览与完成度

> **角色**：B — Agent 工程师
> **基座**：OpenClaw 2026.5.18
> **LLM**：MiniMax-M2.7
> **最后更新**：2026-05-21

---

## 1. 架构总览

```
Studio Javis Agent 层
├── OpenClaw Gateway (:18789)     # AI 核心（Node.js）
│   ├── MiniMax-M2.7 Provider     # 真模型接入
│   ├── Session / Memory          # 内置会话与记忆
│   └── Workspace Files           # SOUL.md / IDENTITY.md 人设
│
├── Bridge (:8001)                # SSE 桥接（Node.js）
│   ├── /api/chat/sessions/*      # SSE 流式对话
│   ├── /api/feeds                # RSS 订阅 CRUD
│   ├── /api/schedules            # 日程 CRUD
│   ├── /api/me/preferences       # 用户偏好
│   ├── /api/ui/action            # UI 事件推送
│   └── /api/ui/stream            # UI 事件订阅
│
├── RSS Fetcher (:8003)           # 后台 RSS 抓取 + AI 摘要
│
├── Skills/                       # 10 个 SKILL.md
│   ├── nas/                      # NAS 文件查询
│   ├── rss/                      # RSS 订阅管理
│   ├── schedules/                # 日程管理
│   ├── system/                   # 系统监控
│   ├── vm/                       # 虚拟机管理
│   ├── network/                  # 网络设备
│   ├── ha/                       # HomeAssistant
│   ├── face/                     # 人脸录入
│   ├── ui/                       # 前端操作
│   └── meta/                     # 记忆与偏好
│
└── Workspace/
    ├── SOUL.md                   # 阿洛娜完整人设
    ├── IDENTITY.md               # 基本身份
    └── USER.md / TOOLS.md        # 用户与工具上下文
```

## 2. 角色设定：阿洛娜（Arona）

- **来源**：蔚蓝档案 · 什亭之匣 AI OS
- **性格**：元气、认真、偶尔冒失立刻补救
- **称呼**：叫用户"老师"
- **风格**：简体中文、克制简练、不用 emoji（除非老师先用了）
- **口头禅**：
  - 开始：`收到，阿洛娜来处理！`
  - 错误：`呜哇，出了点状况……正在修复！`
  - 完成：`搞定啦，老师！`

## 3. 按周完成度

| 周 | 规划要求 | 状态 | 交付物 |
|----|---------|------|--------|
| W1 | 服务骨架 + Mock LLM | ✅ | OpenClaw Gateway 启动，health check 200 |
| W2 | MiniMax 真接入 + Prompt 模板 | ✅ | minimax-portal/MiniMax-M2.7 连通，SOUL.md 人设生效 |
| W3 | Skill 注册 + ui.navigate/render_card | ⚠️ | 10 个 SKILL.md 就绪，ui skill 已定义，待 A 前端联调 |
| W4 | 记忆库 FTS5 + pgvector | ❌ | 阻塞：等待 D 的 PostgreSQL + pgvector 就绪 |
| W5 | feeds Skill + RSS Worker | ✅ | `bridge/rss-fetcher.js` 后台抓取 + AI 摘要 |
| W6 | schedules + session 生命周期 | ✅ | Session TTL 30min + SSE event-id 断点续传 |
| W7 | 安全策略 + Skill 沙箱 | ✅ | risk 分级表 + 注入防御 11/11 + confirm 流程 |
| W8 | 黄金集 + 注入防御 + 性能基线 | ✅ | 10 案例 eval + `perf-baseline.js` + `injection-guard.js` |
| W9 | 与 C 的 Skill 端到端联调 | ❌ | 阻塞：等待 C 的 perception 服务启动 |
| W10 | 文档 + Skill 编写指南 | ✅ | 7 份 Phase 文档 + `skill-authoring-guide.md` |

## 4. 文件清单

### 4.1 核心服务

```
services/agent/
├── openclaw.json                 # Gateway 配置
├── package.json                  # npm 依赖（openclaw）
├── bridge/
│   ├── server.js                 # HTTP + SSE 桥接（主服务）
│   ├── rss-fetcher.js            # RSS 后台抓取 Worker
│   ├── eval-runner.js            # LLM 评测运行器
│   ├── perf-baseline.js          # 性能基线采集
│   ├── injection-guard.js        # 注入防御扫描器
│   └── injection-test.js         # 注入防御测试
├── skills/                       # 10 个 SKILL.md
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
    ├── SOUL.md                   # 阿洛娜人设
    ├── IDENTITY.md               # 基本身份
    └── USER.md / TOOLS.md / AGENTS.md
```

### 4.2 测试

```
tests/B/
└── golden/
    └── agent_eval.jsonl          # 10 个 LLM 评测用例
```

### 4.3 文档

```
docs/
├── 03_AgentB_实施记录_Phase1_OpenClaw基座迁移.md
├── 03_AgentB_实施记录_Phase2_身份配置与真模型验证.md
├── 03_AgentB_实施记录_Phase3_桥接层与API串通.md
├── 03_AgentB_实施记录_Phase4_集成适配与RSSWorker.md
├── 03_AgentB_实施记录_Phase5_会话生命周期与安全策略.md
├── 03_AgentB_实施记录_Phase6_LLM评测黄金集.md
├── 03_AgentB_实施记录_Phase7_注入防御与性能基线.md
├── 03_AgentB_开发总览与完成度.md                         ← 本文档
└── runbook/
    └── skill-authoring-guide.md                          # Skill 编写指南
```

### 4.4 配置

```
.env.local                      # MiniMax API Key + 环境变量（不入 Git）
Makefile                        # agent / agent-bridge / agent-rss / agent-eval / agent-perf / agent-injection-test
pnpm-workspace.yaml             # services/* 加入工作区
pyproject.toml                  # Python 工作区排除 agent
```

## 5. 端口分配

| 端口 | 服务 | 角色 | 状态 |
|------|------|------|------|
| 18789 | OpenClaw Gateway | AI 核心 | ✅ |
| 8001 | Agent Bridge | 前端 SSE + API | ✅ |
| 8003 | RSS Fetcher | 后台抓取 | ✅ |
| 8080 | api-gateway | 代理入口（D） | ✅ |
| 8002 | perception | 外设（C） | - |

## 6. 启动命令

```bash
make agent              # 启动 OpenClaw Gateway (:18789)
make agent-bridge       # 启动 SSE 桥接层 (:8001)
make agent-rss          # 启动 RSS 抓取 (:8003)
make agent-eval         # 运行 LLM 评测
make agent-perf         # 运行性能基线
make agent-injection-test # 运行注入防御测试
```

## 7. 阻塞项

| ID | 阻塞 | 依赖方 | 影响 |
|----|------|--------|------|
| B-01 | PostgreSQL + pgvector 未就绪 | D | W4 记忆库无法落地 |
| B-02 | perception 服务未启动 | C | W9 端到端联调无法进行 |
| B-03 | 前端 SSE 未联调 | A | W3 ui_action 路径未验证 |
| B-04 | OpenAI-compat HTTP 端点未启用 | OpenClaw 配置 | 无法实现真正的 token 级流式 |

## 8. Linux 阶段待办

- llama.cpp 量化模型选型（DeepSeek-V4 / Qwen3.5 / GLM-5.1）
- Skill 沙箱升级到 nsjail / firejail
- pgvector 索引参数调优
- 真实 NAS / HA Skill 接入（C 主导）
- Skill 来源签名机制
