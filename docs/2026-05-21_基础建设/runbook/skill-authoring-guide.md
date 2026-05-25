# Skill 编写指南

> Studio Javis Agent Skill 开发规范
> 基于 OpenClaw SKILL.md 格式

## 1. Skill 是什么

Skill 是 Agent 的"工具使用说明书"。每个 Skill 对应一个 `SKILL.md` 文件，告诉 Agent（阿洛娜）如何调用某个工作室功能。

**不是** Python handler（那是旧架构），**而是**声明式的 markdown 指令文件。

## 2. 目录结构

```
services/agent/skills/<domain>/SKILL.md
```

每个域一个目录，一个 SKILL.md 文件：

```
skills/
├── nas/SKILL.md           # NAS 文件查询
├── rss/SKILL.md           # RSS 订阅管理
├── schedules/SKILL.md     # 日程管理
├── system/SKILL.md        # 系统监控
├── vm/SKILL.md            # 虚拟机管理
├── network/SKILL.md       # 网络设备
├── ha/SKILL.md            # HomeAssistant
├── face/SKILL.md          # 人脸录入
├── ui/SKILL.md            # 前端操作
└── meta/SKILL.md          # 记忆与偏好
```

## 3. SKILL.md 模板

```markdown
---
name: <domain>
description: "<一句话说明，给 LLM 看>"
metadata:
  openclaw:
    emoji: "<emoji>"
---

# <标题>

<简要说明这个 Skill 是做什么的>

## 命令

### <操作名>

```bash
curl -s <HTTP_API_URL> \
  -H "Content-Type: application/json" \
  -d '<json_body>'
```

## 触发示例
- "<用户可能会说什么>"

## 注意
- <特殊说明>
```

## 4. 风险等级

Skill 的风险等级在 `services/agent/bridge/server.js` 中的 `SKILL_RISKS` 表定义：

| risk | 含义 | 行为 |
|------|------|------|
| low | 只读、无副作用 | 自动执行 |
| medium | 写本地数据 | 自动执行，记录日志 |
| high | 创建/销毁 VM、改网络配置 | 必须用户二次确认 |

添加新 Skill 时，在 bridge 的 `SKILL_RISKS` 中添加对应条目。

## 5. 与 C 的 Python Skill 的关系

C 用 Python 实现 Skill 的实际逻辑（`packages/skills/<domain>/handler.py`）。

B 的 SKILL.md 告诉 Agent **如何调用** C 的服务（通过 HTTP API 或 CLI）。

二者通过以下方式对接：
- **SKILL.md 中的 curl 命令** → 指向 C 的 perception 服务 HTTP API
- **B 不实现业务逻辑**，只维护 SKILL.md 指令

## 6. 新增 Skill 流程

1. 在 `services/agent/skills/<domain>/SKILL.md` 创建文件
2. 按模板填写 frontmatter 和命令
3. 在 `services/agent/bridge/server.js` 的 `SKILL_RISKS` 中添加风险等级
4. 如果需要新 API 端点，在 bridge 中添加对应路由
5. 确保 C 的对应 handler.py 已实现（如果有 Python 逻辑）
6. 测试：通过 CLI 或 API 触发 Skill

## 7. 注意事项

- SKILL.md 中的 curl 命令**必须用 `${variable}` 语法**，LLM 会自动替换
- 不需要在 SKILL.md 中写 Python 代码 — 那是 C 的职责
- 保持 SKILL.md 简洁 — OpenClaw 已有基础能力，只写技能特异的部分
- emoji 用单个字符
