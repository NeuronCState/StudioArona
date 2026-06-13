# StudioArona v3 — 功能矩阵 (客户端 vs 服务端)

> **目的**: 明确每个功能由谁负责, 客户端 / 服务端各自能做什么, 连上服务端额外得到什么。
> **维护**: 任何新功能 / 改动都要更新这张表。

---

## 1. 设计原则

1. **客户端自包含** — 单独能用, 不依赖服务端
2. **服务端是协作增强层** — 加上后获得: 跨用户, 邮件推送, 外部资源(VM/NAS/HomeAssistant), 公开
3. **数据主权在客户端** — skill/memory 文件存在客户端本地, 客户端选同步什么
4. **服务端只存"客户端授权同步"的部分** — 不是所有数据都镜像到服务端

---

## 2. 功能总览

| 类别 | 客户端独立 | 服务端附加 |
|---|---|---|
| **个人 Agent** | ✅ 自己配 LLM provider, SOUL/IDENTITY, 工具调用, 多轮对话 | ❌ 不增功能 (agent 是个人的) |
| **Skill** | ✅ 本地管理, Markdown 扫描, 启用/禁用 | ✅ 公开共享的 skill 市场 (SkillsMP/GitHub 多源搜索, 自动翻译, 一键安装) |
| **Memory** | ✅ 本地 SQLite + 向量检索 | ✅ 跨设备同步 + 协作记忆 (团队共享) |
| **RSS** | ✅ 本地抓取, 阅读 | ✅ 服务端聚合 + 邮件推送 |
| **日程** | ✅ 本地日历 | ✅ 服务端同步 + 邮件提醒 + 跨用户可见性 |
| **VM** | ❌ | ✅ 工作室 VM 编排 (libvirt/vbox) |
| **NAS** | ❌ | ✅ 个人 NAS 空间 (中心给每个用户配额) |
| **Agent 跨服务** | ❌ | ✅ Agent 工具: 读 NAS, 控 VM, 调 HA |
| **协作** | ❌ | ✅ 在线状态, 跨用户通知, 群发公告 |
| **系统监控** | ✅ 本机资源 (CPU/内存/磁盘) | ✅ 中心所在机器资源 (admin only) |

---

## 3. 详细功能矩阵

### 3.1 客户端: Agent 私人助理

| 子功能 | 详情 |
|---|---|
| **LLM Provider 配置** | OpenAI / MiniMax / Anthropic / Ollama / 自定义 OpenAI 兼容端点; 多个 provider 可并存, 按 skill 路由; **首次注册后必须配置并测试连接**, 可跳过稍后在设置页配置 |
| **SOUL/IDENTITY** | Markdown 文件, UI 内可编辑; 多 persona (工作/生活/...) |
| **工具 (Tools)** | 内置: 文件读写, shell (受沙箱约束), web fetch, 计算, 时间; 用户可注册自己写的 tool (Rust crate 形式) |
| **多轮对话** | Session 持久化, 中断/恢复, 流式输出 (SSE) |
| **记忆** | 短期 (会话窗口) + 长期 (SQLite + 向量); agent 自动决定存什么 |
| **技能调用** | Markdown SKILL.md 描述, agent 根据上下文加载 |
| **任务规划** | Goal → Plan → Steps, 每步可中断/修改 |
| **定时任务** | Cron-like, "每天 9 点总结我的 RSS" |
| **语音输入** | v3 后期: whisper-rs 本地 ASR |
| **OCR 文档解析** | ✅ PaddleOCR-VL-1.6 (GGUF) + llama.cpp (Metal/CUDA 加速); 支持 PDF/图片 → Markdown/PDF 导出 |
| **多模态** | 直接走 OpenAI 兼容 vision API |
| **本地模型** | llama-rs / mistral-rs (Ollama 替代) |

**用户能配置什么**:
- Provider (API key, base URL, model)
- 工具白名单/黑名单
- SOUL/IDENTITY 内容
- 哪些 skill 启用
- 哪些记忆保留 / 清理
- agent loop 的 system prompt 模板

### 3.2 客户端: Skill 管理

| 子功能 | 详情 |
|---|---|
| **本地扫描** | `~/.hermes/profiles/<user>/skills/*/SKILL.md`, frontmatter 解析 |
| **UI 管理** | 启用/禁用, 编辑内容, 删除, 导入 (从 URL / 文件) |
| **分类标签** | 用户可打 tag, 搜索 |
| **来源标记** | user (用户自写) / hermes (内置) / community (社区下载) |
| **调试** | 在 agent 上下文中手动注入 skill 测试 |
| **技能市场** | 多源搜索 (SkillsMP 1.7M+ / GitHub), 分类浏览 (开发/设计/运维等), 自动中英文翻译, 一键安装到用户目录 |
| **安全扫描** | 自动检测恶意代码模式 (eval/subprocess/os.system 等) |

### 3.3 客户端: Memory 管理

| 子功能 | 详情 |
|---|---|
| **存储** | 在线: 中心 PG (主数据源); 离线: 本地 SQLite 草稿 + moka 缓存 |
| **向量检索** | 在线: 中心 pgvector; 离线: 本地 SQLite FTS (降级) |
| **类型** | fact / preference / todo / relation / emotion |
| **生命周期** | agent 自动存, 用户审/删, 衰减机制 (旧记忆降权) |
| **时间线视图** | 按时间排序, 可筛选/搜索 |
| **网格视图** | 卡片式, 按类型分组 |
| **导出/导入** | JSON, 跨设备迁移 |
| **离线模式** | 写本地 SQLite 草稿, 重连中心时同步 (last-write-wins) |

### 3.4 客户端: RSS (个人)

| 子功能 | 详情 |
|---|---|
| **订阅** | 添加 URL, 自动嗅探 RSS / Web |
| **抓取** | 后台 task, 5 min 周期 |
| **全文抽取** | Readability 移植, 渲染成 reading page |
| **阅读** | iframe 内嵌 + 原文链接 |
| **状态** | 错误重试, 失败通知 |

### 3.5 客户端: 日程 (个人)

| 子功能 | 详情 |
|---|---|
| **CRUD** | 标题/时间/地点/备注 |
| **视图** | 即将到来 / 全部, 按日期分组 |
| **提醒** | 本地弹通知 (可选) |

### 3.6 客户端: 系统监控 (本机)

| 子功能 | 详情 |
|---|---|
| **资源** | CPU/内存/磁盘/网络 |
| **进程** | Top 10 by RSS |
| **GPU** | nvidia-smi / Apple Metal (best-effort) |

### 3.7 客户端: 通用

| 子功能 | 详情 |
|---|---|
| **设置** | 主题, 语言, LLM provider, SMTP, 中心 URL, 通知策略 |
| **认证** | 本地账户 (offline) 或中心 JWT (online) |
| **主题** | 浅色/深色, Studio/Arona 模式 |
| **国际化** | 中/英 |

### 3.8 客户端: 本地模型推理

| 子功能 | 详情 |
|---|---|
| **运行时** | llama.cpp (vendor/llama.cpp/), 三平台预编译二进制 |
| **GPU 加速** | macOS: Metal (-ngl 99); Linux: CUDA; Windows: CUDA/CPU |
| **OCR 模型** | PaddleOCR-VL-1.6 (GGUF, ~1.8GB), 支持 PDF/图片解析 |
| **模型管理** | 首次使用自动下载, 设置页查看/删除模型 |
| **平台适配** | 自动检测 darwin-arm64/linux-x64/windows-x64, 选择对应二进制 |

---

## 4. 服务端: 协作与扩展

> 客户端连上服务端后, 以下功能**才可用**。每条都标注依赖。

### 4.1 服务端: RSS (协作)

| 子功能 | 依赖 | 详情 |
|---|---|---|
| **跨设备同步** | 客户端 | 桌面 A 订阅 → 桌面 B 自动有 |
| **邮件推送** | SMTP | 周期聚合, 推到用户邮箱 |
| **协作源** | 服务端 | admin 可加工作室公共源, 跨用户推送 |
| **优先级** | 服务端 | admin 标"重要"的源, 用更高频率 |

### 4.2 服务端: 日程 (协作)

| 子功能 | 依赖 | 详情 |
|---|---|---|
| **跨设备同步** | 客户端 | 同上 |
| **邮件提醒** | SMTP | 提前 15/30/60 min 发邮件 |
| **可见性** | 服务端 | private (自己) / team (工作室成员) / public |
| **会议室预订** | 中心 | 接入 HA / 会议室传感器 |

### 4.3 服务端: 虚拟机

| 子功能 | 依赖 | 详情 |
|---|---|---|
| **创建/删除** | libvirt/vbox API | 客户端选择规格 (CPU/RAM/磁盘/OS 镜像) |
| **状态查看** | 客户端 | running/stopped/error, 控制台, 资源使用 |
| **SSH 终端** | 客户端 | 浏览器 xterm.js, 中心 daemon 反向代理 |
| **快照** | 中心 | 保存/恢复 |
| **网络** | 中心 | 端口转发 / 防火墙规则 |
| **配额** | 服务端 | 每用户最多 N 台 |

### 4.4 服务端: NAS

| 子功能 | 依赖 | 详情 |
|---|---|---|
| **个人空间** | 中心 | 配额 (默认 50 GB), 路径 `/nas/<username>/` |
| **文件管理** | 客户端 UI | 浏览/上传/下载/重命名/删除 |
| **共享** | 服务端 | 公开链接, 密码, 过期时间 |
| **配额管理** | admin | 每用户配额, 总配额告警 |
| **SMB/NFS 挂载** | 中心 | 提供局域网挂载点 (smb://studio.lan/<username>) |
| **Agent 访问** | agent tool | 用户的 agent 可以读/写自己 NAS 下的文件 |

### 4.5 服务端: Agent 跨服务能力

| 工具 (Tool) | 调用形式 | 详情 |
|---|---|---|
| `nas.read(path)` | 读文件 | 限制在自己的 NAS 空间 |
| `nas.write(path, content)` | 写文件 | 同上 |
| `nas.list(dir)` | 列目录 | 同上 |
| `vm.list()` | 列出自己 VM | |
| `vm.start(id)` / `vm.stop(id)` | 启停 VM | |
| `ha.list_devices()` | 列出 HA 设备 (admin 授权范围) | 中心 daemon 调 HA API |
| `ha.call_service(domain, service, data)` | 触发 HA 自动化 | 同上 |
| `rss.fetch_latest(topic, count)` | 拉服务端最新 RSS | 用于"总结今天工作室 RSS" |
| `schedule.list_team(today)` | 看工作室同事今日日程 (可见性允许时) | |
| `users.list_online()` | 看工作室在线 | 简单状态 |

**所有 tool 都走中心鉴权** — 客户端 agent 想调, 必须先连上中心, 用 JWT 调中心 endpoint。中心**二次鉴权**: 这是用户 A 吗? 配额够吗? HA 设备是这个用户有权限的吗?

### 4.6 服务端: 协作

| 子功能 | 详情 |
|---|---|
| **在线状态** | 客户端心跳, 中心 5 min 没收到 → 离线 |
| **跨用户通知** | admin 群发, 或某人 @ 某人 |
| **公告板** | 工作室大事记, 客户端首页显示 |
| **跨用户消息** | 一对一 (admin 或成员), v3 仅简单 |
| **群组** | v3 不做, v4 |
| **权限角色** | owner / admin / member / guest |

### 4.7 服务端: 中心机器系统监控

| 子功能 | 详情 |
|---|---|
| **资源** | 中心 Linux 工作站的 CPU/内存/磁盘/网络 |
| **服务状态** | 所有服务 (PG, Redis, center daemon, HA bridge) 健康 |
| **admin only** | 普通成员看不到 |

### 4.8 服务端: 中心自维护

| 子功能 | 详情 |
|---|---|
| **备份** | PG 每日全量, 保留 7 天; 配置文件 git 化 |
| **升级** | 中心 daemon 自身有版本检查, 服务端 push 新版 |
| **日志** | 中心 daemon 写 `/var/log/studioarona/`, admin 可查 |

---

## 5. 离线 vs 在线 行为对照

| 场景 | 离线 (无中心) | 在线 (连中心) |
|---|---|---|
| 启动 | 直入主界面, 全本地功能可用 | 探测中心, 注册/重连, 加载中心能力, 进入主界面 |
| 新建日程 | 存本地 SQLite | 立即同步到中心 PG, 其他设备 1s 内可见 |
| 编辑记忆 | 存本地 | 立即同步, 协作记忆同步给团队 |
| RSS 新增 | 本地抓取 | 同步给中心, 邮件推送规则生效 |
| 创建 VM | 显示 "需要连接到工作室" | 中心接收请求, 创建 VM, 返回结果 |
| 访问 NAS | 显示 "需要连接到工作室" | 中心代理 S3 兼容协议, 文件读写 |
| agent 工具调用 | 只能用本地工具 (file/web/calc) | 加上 NAS / VM / HA / rss / schedule 工具 |
| 看谁在线 | 显示 "需要连接到工作室" | 列出工作室在线成员 |
| 关闭网络 | 无感, 仍可用 | 提示 "中心不可达, 切到离线模式" |

### 5.1 冲突解决策略

| 数据类型 | 冲突策略 | 理由 |
|---------|---------|------|
| Memory (个人) | Last-write-wins | 个人数据, 无协作冲突 |
| Skill | Last-write-wins | 同上 |
| RSS 订阅 | 合并 (去重) | 不同设备可能订阅不同源 |
| 日程 | 中心优先 | 协作数据, 中心是 source of truth |
| 记忆 (协作) | 中心优先 | 团队共享, 需要一致性 |
| SOUL/IDENTITY | 中心优先 | 配置数据, 以中心为准 |

---

## 6. 客户端 vs 服务端代码仓库

```
/Users/zhangxuanning/StudioArona/
├── apps/
│   ├── web/                    # 现有 React 前端 (桌面和中心共享, 或桌面专用)
│   └── desktop/                # Tauri 壳 (薄, 仅窗口/托盘/命令桥接)
│
├── services/
│   ├── desktop-core/           # ★ 客户端核心 (单 Rust 进程)
│   │   # 用户端所有功能: agent / skill / memory / rss / schedule
│   │   # 离线 cache + 离线草稿
│   │   # 中心客户端 (探测 + 反向 WebSocket)
│   │
│   └── center/                 # ★ 中心 daemon (Linux 工作站, 单 Rust 进程)
│       # 协作能力: nas / vm / ha / rss-aggregator / schedule-sync
│       # PG 接入 + 跨用户逻辑
│
├── packages/
│   ├── contracts/              # 现有 OpenAPI (前端 type 来源)
│   ├── ui-kit/                 # 现有 React 组件
│   └── protocol/               # 新: Rust 共享 crate (类型 + JWT + 中心 API 契约)
│
└── docs/
    ├── v3-rust-architecture.md # 整体架构 + 阶段计划
    └── v3-feature-matrix.md     # ★ 本文档, 功能对照表
```

**Cargo workspace 顶级**:
```toml
[workspace]
members = [
    "services/desktop-core",
    "services/center",
    "packages/protocol",
]
resolver = "2"
```

**关键**:
- `desktop-core` 和 `center` **互相不依赖** (只都依赖 `protocol`)
- `protocol` 是共享的类型 / JWT helper / 中心 API 契约
- 改 API 契约一处生效两边
- 各自独立 `cargo test`, 独立 `cargo build --release`

---

## 7. 实施映射

| 功能矩阵行 | 桌面 core 哪个模块 | 中心 daemon 哪个模块 | 协议包 |
|---|---|---|---|
| 客户端: Agent | `agent/` | — | `protocol::agent` (消息类型) |
| 客户端: Skill | `skills/` | — | `protocol::skill` |
| 客户端: Memory | `memory/` | — | `protocol::memory` |
| 客户端: RSS | `rss/` | — | `protocol::rss` |
| 客户端: 日程 | `schedule/` | — | `protocol::schedule` |
| 客户端: 系统监控 | `sysmon/` | — | — |
| 服务端: RSS 同步 + 邮件 | `center_client/rss.rs` | `rss_aggregator/`, `mailer/` | `protocol::sync` |
| 服务端: 日程同步 + 邮件 | `center_client/schedule.rs` | `schedule_sync/`, `mailer/` | `protocol::sync` |
| 服务端: VM | `center_client/vm.rs` | `vm_orchestrator/` | `protocol::vm` |
| 服务端: NAS | `center_client/nas.rs` | `nas/` (S3 兼容) | `protocol::nas` |
| 服务端: Agent 工具 | `agent/tools/{nas,vm,ha,etc}.rs` | `tools_proxy/` | `protocol::tools` |
| 服务端: 协作 | `center_client/presence.rs` | `presence/` | `protocol::presence` |
| 服务端: 系统监控 | — | `sysmon/` | — |
| 服务端: 自维护 | — | `backup/`, `upgrade/` | — |

---

## 8. 数据流示意 (用户输入到 agent 响应)

```
用户输入消息
   ↓
[桌面 app] SSE /api/chat
   ↓
[desktop-core] Agent.chat()
   ├── 1. 加载 SOUL/IDENTITY (本地 + 中心同步过来的)
   ├── 2. 加载相关 skill (本地扫描 + 中心公开的)
   ├── 3. 加载相关 memory (本地 + 中心同步的)
   ├── 4. 调 LLM (provider, 用户配)
    ├── 5. LLM 返 tool_calls? 
    │     ├── 是: 调本地 tool (file/web/...)
    │     │     └── 失败? → 返回错误给 LLM, 让它决定下一步
    │     └── 是: 调中心 tool (nas/vm/ha/...)
    │           ├── 中心不可达? → 返回 "离线模式, 该功能不可用"
    │           ├── 中心返回错误? → 追加到 LLM context, 重试或跳过
    │           └── 成功? → 中心返结果 → desktop-core 追加到 LLM context
    │          ↓
    │     回到第 4 步, 再次调 LLM
    ├── 6. LLM 返 final answer
    └── 7. SSE 流式推给前端
        (可选) 8. 触发记忆自动存
        (可选) 9. 触发技能自动调用
```

**关键**: **工具调用 (tool call) 是中心化的**。本地工具本地执行, 跨网络工具中心执行, agent loop 不感知。

---

## 9. 明确不做 (v3 范围外)

| 功能 | 状态 |
|---|---|
| 实时多用户协同编辑 (Google Docs 式) | ❌ v4 |
| 移动端 app (iOS/Android) | ❌ v4 (Tauri 2 mobile) |
| 视频通话 / WebRTC | ❌ v4 |
| 公网部署 | ❌ 仅局域网 |
| 完整群聊 | ❌ 仅 admin 群发 + 一对一 |
| 自定义 tool 的图形化编辑 | ❌ v3 tool 必须 Rust 源码 |

---

## 10. 检查清单 (Phase 1 完成时)

- [ ] 客户端独立能跑, 离线模式完整
- [ ] 客户端连中心后, 5.1-5.8 全部功能可见
- [ ] 中心 daemon 自包含, 一个进程跑所有
- [ ] agent 工具调用走统一接口
- [ ] 跨用户同步: 日程/记忆/RSS 1s 内可见
- [ ] 邮件推送: RSS 聚合 + 日程提醒跑通
- [ ] 中心 down 时客户端自动降级, 重连后自动恢复
- [ ] 跨平台打包: mac/win/linux 三平台
- [ ] admin 角色能管理所有用户/服务

---

## 11. 安全与鉴权

### 认证流程

```
首次启动
  ├─ 1. 检测中心 → 无中心? → 创建本地账户 → 进入离线模式
  │                                    ↓
  │                          提示配置 LLM Provider (可跳过)
  │                                    ↓
  │                              进入主界面
  │
  └─ 1. 检测中心 → 有中心? → 注册/登录 → 获取 JWT
                                           ↓
                                     提示配置 LLM Provider (可跳过)
                                           ↓
                                     进入主界面 (在线模式)
```

### LLM Provider 配置流程

| 时机 | 行为 |
|------|------|
| 首次注册后 | **必须配置**一个 LLM Provider 并测试连接 |
| 测试通过 | 保存配置, 进入主界面 |
| 测试失败 | 提示错误, 允许重试或跳过 |
| 跳过 | 进入主界面, 聊天功能不可用, 设置页显示未配置警告 |
| 随时修改 | 设置页 → LLM Provider → 编辑/测试/保存 |

### 权限模型

| 角色 | 本地 | 中心 |
|------|------|------|
| owner | 全部 | 全部 |
| admin | 全部 | 管理用户/服务 |
| member | 全部 | 个人数据 + 受限协作 |
| guest | 只读 | 无 |

### 数据隔离

- 每个用户的数据严格隔离 (NAS/VM/Memory/Skill)
- Agent 工具调用走中心二次鉴权
- 跨用户操作需要明确授权

---

## 12. 监控与可观测性

### 桌面 app

| 项目 | 详情 |
|------|------|
| 本地日志 | `~/.studioarona/logs/` (按日期轮转, 保留 7 天) |
| 性能指标 | 启动时间, LLM 延迟, 内存占用 |
| 崩溃报告 | 可选 Sentry 或本地 crash dump |
| 健康检查 | 托盘图标显示服务状态 (绿/黄/红) |

### 中心 daemon

| 项目 | 详情 |
|------|------|
| 健康检查 | `GET /health` endpoint |
| 指标 | Prometheus (请求数, 延迟, 错误率) |
| 日志 | structured logging (tracing crate) |
| 告警 | 服务异常, 磁盘满, PG 连接数 |
| 备份 | PG 每日全量, 保留 7 天; 配置文件 git 化 |

---

## 13. 从 v2 迁移到 v3

### 迁移路径

| 步骤 | 操作 | 备注 |
|------|------|------|
| 1. 数据导出 | v2 PG 数据 → JSON | `pg_dump` 或自定义脚本 |
| 2. 数据导入 | v3 center daemon 启动时检测 → 自动迁移 | 检测空表时触发 |
| 3. 配置迁移 | `.env.local` → v3 config 格式 | 自动转换 |
| 4. 技能迁移 | `~/.hermes/profiles/` → v3 skills 目录 | 保持目录结构 |
| 5. 记忆迁移 | v2 memory 表 → v3 memory 表 | schema 兼容, 直接导入 |

### 兼容性

- v2 和 v3 可并行运行 (不同端口)
- 迁移完成后可删除 v2 服务
- 回滚: 保留 v2 备份, �时可切回

---

## 14. 性能目标

| 指标 | 目标 | 测量方式 |
|------|------|----------|
| 冷启动时间 | < 3s | 从双击图标到主界面可交互 |
| 热启动时间 | < 1s | 从托盘恢复到主界面 |
| LLM 首 token 延迟 | < 500ms | 从发送消息到第一个 token |
| 内存占用 (空闲) | < 200MB | 主界面静止 1 分钟后 |
| 安装包大小 | < 100MB | 不含 ML 模型 |
| 跨设备同步延迟 | < 1s | 在线模式下 |
| RSS 抓取周期 | 5 min | 可配置 |
| 最大并发会话 | 10 | 每用户 |
