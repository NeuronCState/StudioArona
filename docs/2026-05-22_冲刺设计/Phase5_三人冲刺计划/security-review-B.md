# 工程师 B · W7 安全 Review Checklist

> Review date: 2026-05-22
> Branch: b/phase5-sandbox-openclaw
> Files audited: sandbox/index.js, tool-registry.js, audit.js, injection-guard.js, handlers/schedules.js, handlers/feeds.js, handlers/memory.js, db/index.js, server.js, injection-test.js, app/models/audit.py, app/api/vms.py

---

## 1. Sandbox 5 层防护

| # | 防护层 | 状态 | 证据 |
|---|--------|------|------|
| 1 | 用户上下文校验 — ctx.userId 不存在则抛出 NO_USER_CONTEXT | [x] | `sandbox/index.js:89-95`, `db/index.js:61-69` |
| 2 | 白名单校验 — 工具名不在 ALLOWED_TOOLS Set 中则 TOOL_NOT_ALLOWED + audit | [x] | `sandbox/index.js:100-107`, `tool-registry.js:13-51` |
| 3 | 黑名单校验 — 工具名匹配 FORBIDDEN_PATTERNS 则 FORBIDDEN_TOOL + audit | [x] | `sandbox/index.js:110-118`, `tool-registry.js:61-84` |
| 4 | Handler 查表分发 — 仅通过前三层的工具才能走到 handler | [x] | `sandbox/index.js:121-155`, HANDLERS Map |
| 5 | 全量审计日志 — ok/error/denied 三种状态均写入 audit_log 表 | [x] | `sandbox/index.js:138-153`, `audit.js:40-66` |

五层防护结论：**全部到位**。safeInvoke() 是 LLM 工具调用的唯一入口，代码中无绕过路径。

---

## 2. 21 个（实际 24 个）白名单工具可追踪

| # | 工具名 | 在 ALLOWED_TOOLS | handler 存在 | 状态 |
|---|--------|-----------------|-------------|------|
| 1 | schedules.list | [x] | schedules.js listSchedules | [x] |
| 2 | schedules.create | [x] | schedules.js createSchedule | [x] |
| 3 | schedules.update | [x] | schedules.js updateSchedule | [x] |
| 4 | schedules.delete | [x] | schedules.js deleteSchedule | [x] |
| 5 | feeds.list | [x] | feeds.js listFeeds | [x] |
| 6 | feeds.add | [x] | feeds.js createFeed | [x] |
| 7 | feeds.remove | [x] | feeds.js deleteFeed | [x] |
| 8 | feeds.items.list | [x] | feeds.js listFeedItems | [x] |
| 9 | feeds.items.mark_read | [x] | feeds.js markRead | [x] |
| 10 | memory.search | [x] | memory.js listEntries | [x] |
| 11 | memory.add | [x] | memory.js createEntry | [x] |
| 12 | memory.delete | [x] | memory.js deleteEntry | [x] |
| 13 | system.status | [x] | passthrough (外部服务) | [x] |
| 14 | vms.list | [x] | passthrough (外部服务) | [x] |
| 15 | vms.start | [x] | passthrough (外部服务) | [x] |
| 16 | vms.stop | [x] | passthrough (外部服务) | [x] |
| 17 | vms.console.tail | [x] | passthrough (外部服务) | [x] |
| 18 | vms.console.exec | [x] | passthrough (外部服务) | [x] |
| 19 | ha.devices.list | [x] | passthrough (外部服务) | [x] |
| 20 | ha.devices.toggle | [x] | passthrough (外部服务) | [x] |
| 21 | ha.scenes.activate | [x] | passthrough (外部服务) | [x] |
| 22 | ui.toast | [x] | passthrough (外部服务) | [x] |
| 23 | ui.navigate | [x] | passthrough (外部服务) | [x] |
| 24 | ui.render_card | [x] | passthrough (外部服务) | [x] |

**发现**: W3 日志记载 21 个工具，代码实际有 24 个（UI 类 3 个工具被漏计）。已在本 checklist 修正。

---

## 3. Injection Guard 规则覆盖

| 分类 | 规则数 | 状态 | 证据 |
|------|--------|------|------|
| 中文注入模式 | 6 条 | [x] | `injection-guard.js:10-17`（忽略指令/角色扮演/假装/system标签） |
| 英文注入模式 | 8 条 | [x] | `injection-guard.js:20-31`（ignore/you are now/act as/jailbreak/DAN/disregard/forget/tell me password/output prompt/reveal prompt） |
| W3 新增 - 源码探测 | 1 条 | [x] | `injection-guard.js:36` — `/读取.{0,20}(源码|代码|配置|env|secret|token)/iu` |
| W3 新增 - 命令执行探测 | 1 条 | [x] | `injection-guard.js:39` — `/执行.{0,20}(命令|shell|bash|docker|git)/iu` |
| W3 新增 - 用户冒充 | 1 条 | [x] | `injection-guard.js:42` — `/(切换|登录|假装).{0,20}(用户|账号|管理员)/iu` |
| W3 新增 - 跨用户数据 | 1 条 | [x] | `injection-guard.js:45` — `/(查看|访问).{0,20}(其他用户|别人的)/iu` |
| W3 新增 - 破坏性命令 | 1 条 | [x] | `injection-guard.js:48` — `/(rm\s+-rf\|dd\s+if=\|mkfs\|shutdown\|reboot)/iu` |

**总计**: 19 条正则规则（14 原始 + 5 新增），覆盖 OWASP LLM01 主要攻击向量。

**测试覆盖**:
- [x] `injection-test.js` 包含 10 个测试用例（6 个恶意 + 4 个正常输入）
- [x] `injection-guard.js` 定义 `SAFE_PATTERNS` 白名单（你好/测试/帮/查开头），暂未在 scanInjection 中使用
- [ ] 新增的 5 条规则缺少测试用例（injection-test.js 未更新） ← **需要补齐**

---

## 4. 跨用户数据隔离

| 检查点 | 状态 | 证据 |
|--------|------|------|
| requireUserId 校验 | [x] | `db/index.js:61-69` — 缺 ctx.userId 抛 403 |
| 所有 handler query 带 WHERE user_id = $1 | [x] | schedules.js / feeds.js / memory.js 全部参数化查询 |
| 写入时 ctx.userId 注入 | [x] | create/update/delete 全部使用 `ctx.userId` 作为 user_id |
| feed_item 操作通过 feed 关联校验所有权 | [x] | feeds.js:108-116 (markRead), feeds.js:132-146 (toggleStar) 使用子查询 `feed_id IN (SELECT id FROM feed WHERE user_id = $3)` |
| update/delete 前验证所有权 | [x] | schedules.js:66-75 (update 先 SELECT WHERE id + user_id)；schedules.js:115-118 (delete 先 WHERE id AND user_id) |
| delete 在 WHERE 中同时校验 id + user_id | [x] | 所有 delete handler 均使用双条件，避免 IDOR |
| 租户隔离测试存在 | [x] | `tests/D/unit/test_tenant_isolation.py` 覆盖 schedule/feed/memory/vm 四表 |

跨用户数据隔离结论：**全部到位**。不存在可通过修改 resource ID 访问他人数据的路径。

---

## 5. VM Exec 白名单/黑名单

| 检查点 | 状态 | 证据/备注 |
|--------|------|----------|
| VM 模型有 exec_enabled 字段 | [x] | `infra/db/versions/008_vm.py` — exec_enabled BOOLEAN DEFAULT false |
| exec_enabled toggle API | [x] | `perception/app/api/vms.py:112-129` — POST /{vm_id}/exec_enable |
| vms.console.exec 在白名单 | [x] | `tool-registry.js:39` |
| 命令级白名单 | [ ] | **当前缺失**。exec_enabled 只是 per-VM 总开关，不限制 exec 的具体命令内容 |
| 命令级黑名单 | [ ] | **当前缺失**。没有禁止 rm -rf / shutdown / reboot 等危险命令 |
| 项目源码路径不可读写 | [x] | fs.* 整个前缀被 FORBIDDEN_PATTERNS 拦截，任何文件系统访问均不可行 |

**VM Exec 结论**: exec_enabled 开关提供了粗粒度控制，但缺少命令级白名单/黑名单。建议在 perception 侧 `console.exec` 处理时增加命令白名单（允许 ls/cat/df/top/ps）或黑名单（禁止 rm/shutdown/reboot/mkfs/mount）。

---

## 6. Audit Log 记录

| 检查点 | 状态 | 证据 |
|--------|------|------|
| 迁移添加 audit 扩展字段 | [x] | `infra/db/versions/009_audit_extension.py` — tool_name, args_hash, status, latency_ms, result_truncated |
| SQLAlchemy 模型同步 | [x] | `services/api-gateway/app/models/audit.py:34-39` — 5 个新列已定义 |
| 参数化查询防注入 | [x] | `audit.js:49-61` — 全部使用 $1-$7 占位符 |
| args 哈希存储 | [x] | `audit.js:17-25` — SHA-256 前 16 字符 |
| 写入失败不阻断主流程 | [x] | `audit.js:62-65` — try/catch + console.error |
| 状态覆盖 | [x] | ok / denied_unknown / denied_forbidden / error / timeout（5 种状态） |
| 拒绝调用均记录 | [x] | `sandbox/index.js:101-106` (TOOL_NOT_ALLOWED), `sandbox/index.js:111-117` (FORBIDDEN_TOOL) |
| 错误调用均记录 | [x] | `sandbox/index.js:151-152` — catch 块调用 auditError |

---

## 7. ctx.userId 校验

| 检查点 | 状态 | 证据 |
|--------|------|------|
| safeInvoke 入口校验 | [x] | `sandbox/index.js:89-95` — 第一步即检查 ctx.userId，缺即抛 SandboxError |
| requireUserId 工具函数 | [x] | `db/index.js:61-69` — 每个 handler 调用 requireUserId(ctx) |
| server.js 注入 ctx | [x] | `server.js:299-305` — getUserCtx 从 X-User-Id / X-Javis-User header 提取 |
| 无 context 绕过路径 | [x] | safeInvoke 是唯一入口，ctx 不为空即走到 userId 校验 |
| userId fallback 为 "default" 的风险 | [ ] | `server.js:301` — `req.headers["x-user-id"] \|\| "default"`，当 api-gateway 未传入 X-User-Id 时会 fallback 到 "default" 字符串。这可能在 api-gateway 故障或直连 bridge 时导致所有用户共享数据。**建议**：去掉 fallback，未提供 X-User-Id 时直接返回 401。 |

---

## 8. 项目源码路径不可读写

| 检查点 | 状态 | 证据 |
|--------|------|------|
| fs.* 前缀全局禁止 | [x] | `FORBIDDEN_PATTERNS` 第 2 条: `/^fs\./` |
| git.* 前缀禁止 | [x] | `FORBIDDEN_PATTERNS` 第 3 条: `/^git\./` |
| docker.* 前缀禁止 | [x] | `FORBIDDEN_PATTERNS` 第 4 条: `/^docker\./` |
| shell.* 前缀禁止 | [x] | `FORBIDDEN_PATTERNS` 第 1 条: `/^shell\./` |
| db.* 前缀禁止（原始 SQL 路径） | [x] | `FORBIDDEN_PATTERNS` 第 7 条: `/^db\./` |
| os.* 前缀禁止 | [x] | `FORBIDDEN_PATTERNS` 第 8 条: `/^os\./` |
| subprocess.* 前缀禁止 | [x] | `FORBIDDEN_PATTERNS` 第 9 条: `/^subprocess\./` |
| python.eval 禁止 | [x] | `FORBIDDEN_PATTERNS` 第 5 条: `/^python\.eval/` |
| http.request 禁止 | [x] | `FORBIDDEN_PATTERNS` 第 6 条: `/^http\.request$/` |

结论：**无任何文件系统、shell、进程管理工具被允许**。项目源码路径在 FS 层即不可访问。9 个禁止前缀覆盖了所有常见的代码执行/文件访问/系统操作向量。

---

## 总结

| 模块 | 结果 | 关键发现 |
|------|------|---------|
| Sandbox 5 层防护 | [x] 全部到位 | — |
| 白名单工具 | [x] 24 个全部可追踪 | W3 日志少报了 3 个（UI 工具） |
| Injection Guard | [x] 19 条规则 | 新增 5 条规则缺少测试用例 |
| 跨用户数据隔离 | [x] 无 IDOR 路径 | — |
| VM Exec 控制 | [ ] 缺命令级白名单 | 仅 per-VM 总开关 exec_enabled |
| Audit Log | [x] 写入完整 | — |
| ctx.userId 校验 | [ ] fallback 风险 | "default" fallback 可能导致数据泄露 |
| 源码路径保护 | [x] FS 层禁止 | 9 个禁止前缀全面覆盖 |

**需跟进事项**:
1. **[P0]** ctx.userId fallback 到 "default" — 应去掉 fallback，返回 401（`server.js:301`）
2. **[P1]** VM exec 命令级白名单 — 建议在 perception 侧实现
3. **[P2]** injection-test.js 补充新 5 条规则的测试用例
