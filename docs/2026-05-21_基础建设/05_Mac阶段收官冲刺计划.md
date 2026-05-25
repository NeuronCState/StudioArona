# Mac 阶段收官冲刺计划（v0.1.0）

> **起草日**：2026-05-21
> **冻结目标**：2026-06-25（5 周后）打 `v0.1.0` tag，进入 Linux 阶段
> **输入**：四份验收审计输出（A 90% / B 60% / C 70% / D 80%）+ OpenClaw 底座决策
> **本计划是从"现在的真实状态"出发的前向计划，不是回头改规划书**

---

## 0. 起点快照（截至 2026-05-21）

### 各人完成度

| 人 | 完成度 | 关键已完成 | 关键未完成 |
|----|--------|-----------|-----------|
| **A** 前端 | 90% | 5 页面 + Mock + Storybook + 单测/E2E 框架 | tests 目录分裂、Lighthouse 未跑、上传组件、FaceTime Mock |
| **B** Agent | 60% | OpenClaw 跑通 + 真模型 + 10 SKILL.md + RSS Worker + 注入防御 | **架构 ADR 缺失**、记忆库零实现、handler.py 全空、子进程 spawn 慢 |
| **C** 系统外设 | 70% | 6 抽象层 + 人脸闭环 + 13 Skill + 串口协议冻结 | WS 没真连 D、Face FPS 没实测、模型回归集空 |
| **D** 基础设施 | 80% | Gateway + JWT + Alembic + Docker + Husky + Runbook | TS 类型生成缺、SSE keepalive 是 TODO、schemathesis 没接 CI、SSRF 没做 |

### 跨人联调状态

| 联调对 | 状态 |
|--------|------|
| A ↔ D（HTTP + SSE 中转） | ⚠️ 接口在但未真跑端到端 |
| A ↔ C（WS 事件） | ❌ C 的 WS publisher 是"only logged"，没真推 |
| B ↔ D（Skill 调真接口） | ❌ packages/skills 下 handler 全空 |
| B ↔ A（SSE 事件 schema） | ⚠️ schema 对齐了但没跑过完整流 |

**最大风险**：跨人联调一次都没真跑过。这是 v0.1.0 能否冻结的命门。

---

## 1. 终点定义（v0.1.0 验收门槛）

只有以下全部为绿才能打 tag：

### 功能门槛（5 条端到端旅程，全在 Mac 上跑通）

1. **登录 → 5 页面 smoke**：管理员登录 → 切到每一页都能正常加载，无 console error
2. **流式对话**：对话页发"你好" → 收到 MiniMax-M2.7 的真实流式回复 → 渲染正常
3. **Agent 主动操作前端**：说"打开信息源页" → Agent 通过 `ui_action: navigate` → 前端真切页
4. **RSS 配置闭环**：对话说"加一个 RSS：xxx" → Agent 调 feeds.add_feed Skill → DB 写入 → 切信息源页能看到 → AI 摘要在 30min 内生成
5. **唤醒 → 对话 → 离开**：摄像头识别人脸 → C 推 wake → A 旋屏进对话 → 对话一段 → C 推 leave → A 倒计时清空

### 性能门槛

| 指标 | 目标 | 责任人 |
|------|------|--------|
| LLM 首 token 延迟 p95 | < 1500ms | B |
| API p95（非 LLM） | < 200ms | D |
| WS 事件端到端延迟 | < 100ms | C+D |
| Web 首屏 LCP | < 2s | A |
| Face 检测 fps（Mac） | ≥ 15 | C |
| 50 并发 SSE 不掉连接 | 通过 | D |

### 质量门槛

- [ ] 单元测试覆盖率 ≥ 70%（核心模块 ≥ 90%）
- [ ] CI（lint + typecheck + 单元 + 契约 + E2E）全绿，无 `|| true` 吞错
- [ ] Skill 注入测试 11/11 通过
- [ ] OpenAPI ↔ 实现一致（schemathesis 0 fail）
- [ ] 无 high 级安全告警（pip-audit + pnpm audit + Trivy）

### 文档门槛

- [ ] ADR 0004（OpenClaw 锁定）+ 0005（存储瘦身）+ 0006（前端瘦身） 已合并
- [ ] 02 + 01 规划书与 ADR 对齐
- [ ] Runbook（部署 / 回滚 / 故障排查 / 凭据轮换）完整
- [ ] `Linux待办清单.md` 已锁定

---

## 2. 不变量（已决定，不再讨论）

| # | 决定 | 理由 |
|---|------|------|
| 1 | **OpenClaw 作 Agent 底座** | B 已实施 60%，调研文档背书，撤回成本太高 |
| 2 | **双语言**（Python + Node 共存） | OpenClaw = Node，C/D = Python，被迫双栈但不重写 |
| 3 | **3 个后端服务**（gateway/agent/perception） | 职责正交，硬件直通需要独立部署 |
| 4 | **MiniMax-M2.7 主力** | 调研文档背书，B 已联调 |
| 5 | **存储统一 PostgreSQL**（去 SQLite-FTS5） | 见 ADR 0005 |
| 6 | **前端瘦身**（去 shadcn/ui、visx、Chromatic） | 见 ADR 0006，认可现状 |
| 7 | **测试目录收敛到 tests/{A,B,C,D}/** | 老 services/*/tests/、apps/web/tests/ 统一删 |

---

## 3. 5 周冲刺时间表

### 整体节奏

```
W1 (5/21–5/27)  瘦身 + 补窟窿启动
W2 (5/28–6/03)  联调 round 1：双向打通
W3 (6/04–6/10)  联调 round 2：5 条端到端旅程
W4 (6/11–6/17)  性能 + 安全审计 + 质量闸门
W5 (6/18–6/24)  冻结 + Linux 待办整理 + 打 tag
       6/25     v0.1.0 demo
```

### 关键里程碑

| 日期 | 里程碑 | 验收 |
|------|--------|------|
| **5/22 周四** | 3 份 ADR 合并 | PR review 通过 |
| **5/25 周日** | 测试目录收敛完成 | 单一 tests/{A,B,C,D}/，CI 全绿 |
| **5/30 周五** | 双向联调日（A↔D, A↔C, B↔D 各跑通一次） | 演示视频 |
| **6/06 周五** | 5 条端到端旅程 demo | 录屏 5 段 |
| **6/13 周五** | 性能基线达标 | 数据写入 runbook |
| **6/20 周五** | 安全审计 + 黄金集回归 | 报告写入 runbook |
| **6/24 周三** | 代码冻结，进入 release/v0.1.0 分支 | 仅修 bug |
| **6/25 周四** | v0.1.0 tag + demo | 全员到场 |

---

## 4. 各人详细任务（按周）

### 4.1 D · 基础设施（10 任务，~10 人天）

> **D 是地基，先跑。其他三人很多任务依赖 D 的产出。**

#### W1（5/21–5/27）— 瘦身 + 补窟窿

| # | 任务 | 验收 | 人天 |
|---|------|------|------|
| D1.1 | 写 ADR 0005（存储瘦身：去 SQLite-FTS5，PG tsvector 替代） | PR 合并 | 0.3 |
| D1.2 | 写 ADR 0006（前端瘦身：authoritative 现状） | PR 合并 | 0.2 |
| D1.3 | 删 services/*/tests/ 旧目录，CI 重新指向 tests/{A,B,C,D}/ | `make test` 全绿 | 0.5 |
| D1.4 | 实现 `make generate-types-ts`（openapi-typescript） | `packages/contracts/ts/api.d.ts` 自动生成 | 0.5 |
| D1.5 | SSE keepalive 心跳真注入（每 15s 一次 `: keepalive\n\n`） | 单测 + 长连接保活 60min | 0.5 |

#### W2（5/28–6/03）— 联调启用

| # | 任务 | 验收 | 人天 |
|---|------|------|------|
| D2.1 | schemathesis 真接 PR pipeline（去 placeholder） | PR CI 跑契约 fuzz | 0.5 |
| D2.2 | CI 所有 `|| true` 全删 | 真失败可见 | 0.3 |
| D2.3 | 加 PG `tsvector + GIN` 索引迁移（B 的短期记忆替代 SQLite-FTS5） | alembic up/down 通 | 0.5 |
| D2.4 | RSS 抓取 endpoint 加 SSRF 防护（拦 169.254 / 127.x / RFC1918） | 安全测试 5 条全过 | 0.5 |

#### W3（6/04–6/10）— 联调

| # | 任务 | 验收 | 人天 |
|---|------|------|------|
| D3.1 | api-gateway WS hub 联调 C 真推送，端到端测 wake/leave | tests/D/integration/ws_e2e.py 通 | 0.5 |
| D3.2 | 上传 endpoint python-magic 内容嗅探补完 | 5 个恶意文件 fuzz 全拦 | 0.3 |

#### W4（6/11–6/17）— 性能 + 安全

| # | 任务 | 验收 | 人天 |
|---|------|------|------|
| D4.1 | 50 并发 SSE 压测脚本 + 跑基线 | 写入 docs/runbook/perf-baseline.md | 0.5 |
| D4.2 | pip-audit + pnpm audit + Trivy 扫一轮，修高危 | 0 high CVE | 0.5 |
| D4.3 | Skill 沙箱基础版（subprocess + RLIMIT_AS / RLIMIT_CPU） | 恶意 handler 跑挂被杀 | 1.0 |

#### W5（6/18–6/24）— 冻结

| # | 任务 | 验收 | 人天 |
|---|------|------|------|
| D5.1 | Linux 部署演练（在 Mac 上 buildx + 模拟 SSH 流程） | deploy-linux.sh 全过 | 0.5 |
| D5.2 | 备份脚本 + 恢复演练 | restore 验证通过 | 0.3 |
| D5.3 | 整理 `Linux待办清单.md` 第一版（与全员对账） | PR review | 0.3 |
| D5.4 | 打 v0.1.0 tag + CHANGELOG（git-cliff 自动） | tag 在 main 上 | 0.2 |

---

### 4.2 B · Agent（4 个窟窿 + 联调，~12 人天）

> **B 是最重的工作量。4 个窟窿不补完无法 v0.1.0。**

#### W1（5/21–5/27）— ADR + 改规划书 + 启动记忆库

| # | 任务 | 验收 | 人天 |
|---|------|------|------|
| B1.1 | **写 ADR 0004**（OpenClaw 锁定 + 4 个接受条件） | PR 合并 | 0.5 |
| B1.2 | **改 02 规划书**：删 Python/FastAPI 章节，按 OpenClaw + Bridge 重写 §4-§6 | PR review 全员通过 | 1.0 |
| B1.3 | OpenClaw 子进程 spawn 改**常驻 Gateway 复用** | TTFT p95 < 1500ms 实测 | 1.5 |
| B1.4 | 短期记忆模块接 PG `chat_messages` + `tsvector` | 跨会话能召回上一句 | 1.0 |

#### W2（5/28–6/03）— Skill 实现层（最重要）

> **handler.py 必须真调 C/D 的 HTTP API。声明式 SKILL.md 只给 LLM 看，handler 才是干活的。**

| # | 任务 | 验收 | 人天 |
|---|------|------|------|
| B2.1 | feeds 三个 Skill（add_feed/list_feeds/summarize_item）的 handler 真调 D 的 `/api/feeds` | E2E 旅程 4 通 | 1.0 |
| B2.2 | schedules 两个 Skill（create/list） handler 真调 D | 旅程：对话建日程 → 切日程页能看到 | 0.5 |
| B2.3 | meta 两个 Skill（recall_memory/update_preference）handler 接 PG | 跨会话记得喜好 | 0.5 |
| B2.4 | ui 五个 Skill（navigate/render_card/clear_session/toast/confirm）handler 推 SSE `ui_action` | A 端真切页 | 0.5 |

#### W3（6/04–6/10）— 长期记忆 + 黄金集真跑

| # | 任务 | 验收 | 人天 |
|---|------|------|------|
| B3.1 | 长期记忆 pgvector 嵌入 + 检索 hook 进 prompt | 黄金集 cross-session 用例 pass | 1.0 |
| B3.2 | LLM 评测黄金集真跑一轮（10 例 + LLM-as-Judge） | 分数写 docs/runbook/llm-eval.md | 0.5 |
| B3.3 | 性能基线真跑：TTFT / token 间隔 / 并发 | 数据写 docs/runbook/llm-latency.md | 0.5 |

#### W4（6/11–6/17）— Skill 沙箱（与 D 协作）

| # | 任务 | 验收 | 人天 |
|---|------|------|------|
| B4.1 | 接入 D 的 Skill 沙箱 wrapper（risk: high 走二次确认） | 10 类高危场景测试 | 0.5 |
| B4.2 | 注入防御回归 + 加 5 条新攻击样本 | 11+5 = 16/16 通过 | 0.5 |
| B4.3 | 自验证 §14 checklist 全过 | check 全绿 | 0.3 |

#### W5（6/18–6/24）— 冻结

| # | 任务 | 验收 | 人天 |
|---|------|------|------|
| B5.1 | 修联调 bug | 旅程 1-5 稳定 | 1.5 |
| B5.2 | Linux 待办登记（llama.cpp 兜底、model 选型） | 写 Linux 待办清单 | 0.3 |

---

### 4.3 C · 系统外设（7 任务，~7 人天）

#### W1（5/21–5/27）— 收敛 + 联调启动

| # | 任务 | 验收 | 人天 |
|---|------|------|------|
| C1.1 | 删 services/perception/tests/ 旧目录，迁移到 tests/C/ | 测试用例全跑通 | 0.5 |
| C1.2 | CRC16 从 face_loop.py 抽到 serial/protocol.py | 单测覆盖 | 0.3 |
| C1.3 | 清理 packages/skills/vm/upload/（与 upload_archive 重复） | 删除 + grep 无引用 | 0.1 |
| C1.4 | WS publisher 真连 D 的 `/internal/events/publish` | A 端能收到 wake/leave/face_track | 1.0 |

#### W2（5/28–6/03）— 性能基线

| # | 任务 | 验收 | 人天 |
|---|------|------|------|
| C2.1 | Mac 上跑 face_fps.py 拿到真实数据，达不到 15fps 优化 | docs/runbook/perception-perf.md | 1.0 |
| C2.2 | 摄像头小窗对接 A 的 FaceTrackOverlay 真验证 | 视频联调录屏 | 0.5 |

#### W3（6/04–6/10）— 模型回归 + 端到端联调

| # | 任务 | 验收 | 人天 |
|---|------|------|------|
| C3.1 | 录入 10+ 张工作室成员脸 + 50+ 互联网干扰脸到 tests/C/model_regression/ | 识别率 ≥ 95% / 误识 ≤ 1% | 1.0 |
| C3.2 | face_walkin.mp4 集成测试（wake → leave → wake） | tests/C/integration/ 通 | 0.5 |
| C3.3 | system.metrics_snapshot 真推 metrics_update WS 给前端硬件页 | A 硬件页实时刷 | 0.5 |

#### W4（6/11–6/17）— 收尾 + Linux 待办

| # | 任务 | 验收 | 人天 |
|---|------|------|------|
| C4.1 | 测试覆盖率达标（core ≥ 85% / 整体 ≥ 75%） | --cov 报告 | 1.0 |
| C4.2 | 写 Linux 待办段（CUDA/V4L2/真串口/真 VBox/SNMP） | docs/Linux待办清单.md C 段 | 0.5 |

#### W5（6/18–6/24）— 冻结

| # | 任务 | 验收 | 人天 |
|---|------|------|------|
| C5.1 | 修联调 bug | 旅程 5（唤醒流）稳定 | 1.0 |

---

### 4.4 A · 前端（5 任务，~6 人天）

> **A 完成度最高，主要是收口 + 联调验证 + 跑性能基线。**

#### W1（5/21–5/27）— 瘦身 + 收敛

| # | 任务 | 验收 | 人天 |
|---|------|------|------|
| A1.1 | apps/web/tests/A/ 全部迁移到 tests/A/，CI 路径同步 | E2E 跑通 | 0.5 |
| A1.2 | 删 lib/{auth,sse,ws} 空占位目录 | grep 无引用 | 0.1 |
| A1.3 | 用 D 自动生成的 `packages/contracts/ts/` 类型替换手写 | tsc --noEmit 通过 | 0.5 |

#### W2（5/28–6/03）— 补 W4/W6/W7 漏项

| # | 任务 | 验收 | 人天 |
|---|------|------|------|
| A2.1 | VM 详情页：上传压缩包拖拽组件 + 进度条 mock | E2E 旅程"VM 申请"覆盖上传 | 0.5 |
| A2.2 | 共享信息源页：工作室公告置顶区 | UI 实装 + story | 0.3 |
| A2.3 | FaceTrackOverlay 接真 FaceTime 流（Mac 阶段） | 演示视频 | 0.5 |

#### W3（6/04–6/10）— 端到端 E2E

| # | 任务 | 验收 | 人天 |
|---|------|------|------|
| A3.1 | 5 条端到端旅程的 Playwright spec 全部覆盖（含日程对话流单独 spec） | E2E 全绿 | 1.0 |
| A3.2 | 跨人联调验证：A↔B SSE / A↔C WS / Agent ui_action 真切页 | 录屏 3 段 | 0.5 |

#### W4（6/11–6/17）— 性能 + 视觉回归

| # | 任务 | 验收 | 人天 |
|---|------|------|------|
| A4.1 | Lighthouse CI 真跑一次，LCP < 2s 验证 | docs/runbook/web-perf.md | 0.5 |
| A4.2 | Playwright `toHaveScreenshot()` 视觉回归基线建立 + 接 CI | 5 个关键页面快照入库 | 0.5 |
| A4.3 | axe-core 接 Playwright，0 critical | E2E 中跑 | 0.3 |

#### W5（6/18–6/24）— 冻结

| # | 任务 | 验收 | 人天 |
|---|------|------|------|
| A5.1 | UI bug 修 + 暗黑模式自测 + 1280×720 / 960×540 自测 | 自验证 §11 全绿 | 0.5 |
| A5.2 | demo 录制 + Linux 待办段（真摄像头分辨率适配等） | docs/Linux待办清单.md A 段 | 0.3 |

---

## 5. 阻塞依赖图

```
D1.4 generate-types-ts ──→ A1.3 用类型
D1.5 SSE keepalive ────→ B1.3 OpenClaw 常驻
D2.3 PG tsvector ──→ B1.4 短期记忆
D2.1 schemathesis CI ──→ B/C 后续 PR

B1.4 短期记忆 ──→ B2.x Skill handler
B2.1-2.4 Skill handler ──→ A3.1 E2E 旅程 4
B3.1 长期记忆 ──→ E2E 旅程"跨会话喜好"

C1.4 WS 真连 ──→ A3.2 联调验证
                ──→ E2E 旅程 5（唤醒流）
C2.1 Face FPS ──→ E2E 旅程 5

D4.3 Skill 沙箱 ──→ B4.1 接入
```

**关键路径**（任何一环慢都会拖整体）：
1. D1.4 → A1.3（W1 内必须做完）
2. D2.3 → B1.4 → B2.x → A3.1（横跨 W2-W3）
3. C1.4 → A3.2 → E2E 旅程 5（W2 末-W3 中）

---

## 6. 联调日（强制全员到场）

> 联调不是"自己跑通就行"，必须四人坐在一起跑。

| 日期 | 联调主题 | 准入 | 退出 |
|------|---------|------|------|
| **5/30 周五 14:00** | 双向打通日 | A1.3 / D1.4 / C1.4 / B1.3 已完成 | A↔D SSE 通；A↔C WS 通；B↔D 至少 1 个 Skill 通 |
| **6/06 周五 14:00** | 端到端旅程日 | B2.x / C2.x / A2.x 已完成 | 5 条旅程各跑通 1 次（可有小问题，记 issue） |
| **6/13 周五 14:00** | 性能 + 安全日 | 性能脚本就绪 | 5 条旅程稳定 + 性能基线写入 runbook |
| **6/20 周五 14:00** | 冻结预演日 | 全员任务完成 | demo 流程能从头跑到尾，无 P0 bug |

每次联调日产出：录屏 + 问题清单 + 责任分配。

---

## 7. 风险清单与回退方案

| ID | 风险 | 概率 | 影响 | 回退 |
|----|------|------|------|------|
| R1 | B 的 OpenClaw 常驻改造失败，TTFT 仍 > 1500ms | 中 | 高 | 接受 < 3000ms 作为 v0.1.0 临时门槛，写 issue 在 v0.1.x 修 |
| R2 | C 的 Face FPS Mac 上达不到 15 | 中 | 中 | 降到 10fps 接受，标注 Linux 阶段必跑到 30fps |
| R3 | MiniMax-M2.7 国内出口延迟波动大 | 中 | 高 | 加重试 + 兜底文案；记入 R-01，Linux 阶段切本地模型 |
| R4 | 跨人联调日发现协议不一致 | 高 | 高 | 立即开 ADR，3 人 review；接受推迟 1 天 |
| R5 | B 的 Skill 沙箱来不及做 | 中 | 中 | risk: high 默认 deny + 显示"Linux 阶段开放"，不做 subprocess 沙箱 |
| R6 | 模型回归集（C）来不及攒 100 张图 | 中 | 低 | 收敛到 30 张，写入 Linux 待办继续补 |
| R7 | 视觉回归基线漂移（A） | 低 | 低 | 关键页面手动 review，不卡 CI |

**硬退路**：如果 6/24 仍未冻结，**砍范围而不是砍时间**：
- 砍 P2：HomeAssistant Skill、Skill 沙箱、Linux 待办精装
- 不砍：5 条 E2E、安全审计、TTFT 基线

---

## 8. 每日 / 每周节奏

### 每日（30 分钟内）
- 09:30 站会：昨天 / 今天 / 阻塞（每人 ≤ 3 分钟）
- 站会结束时若有跨人阻塞，**当场指定解决人 + deadline**

### 每周
- **周一 10:00**（45 分钟）：契约审查会（OpenAPI / Skill / 风险登记册）
- **周三 16:00**（30 分钟）：进度对账（按本计划任务表打勾）
- **周五 14:00**（1 小时）：联调日（见 §6）
- **周五 17:00**（30 分钟）：周 demo（每人 5 分钟成果）

### Git
- 个人分支按 `{a,b,c,d}/<topic>` 命名
- PR 必走 review（自模块 1 人 / 跨模块 2 人 / contracts 3 人）
- 严禁直接 push main

---

## 9. v0.1.0 Demo 脚本（6/25）

> demo 不是表演，是验收。如果 demo 中任何环节挂掉 = 没冻结。

```
1. 给观众展示横屏公告板模式（首日工作室概览）       [A]
2. 走到摄像头前 → 屏幕旋屏 → 进入对话              [C+A]
3. 对 Agent 说"最近 NAS 存了啥"                    [B+D]
   → 期望：流式回复"最近存了 X 个文件，最大 Y GB..."
4. 说"帮我加 RSS：xxx"                              [B+D]
   → Agent 反问确认 → 用户确认 → 切信息源页 → 见新源
5. 说"明天 10 点提醒我开会"                         [B+D]
   → Agent 落日程 → 切日程页 → 见倒计时
6. 说"显示 Ubuntu 现在多忙"                         [B+C]
   → Agent ui_action 切硬件页 → 实时数据（Mac 上是 mock GPU）
7. 走开 → 倒计时 → 旋回横屏 → 清空                  [C+A]
8. 第二个用户进来 → 识别为另一身份                  [C]
   → 对话"我喜欢咖啡" → Agent 落记忆
9. 该用户离开后再回来 → 说"你记得我喜欢什么吗"      [B]
   → Agent 跨会话召回"咖啡"
```

任何一步失败，demo 不算通过。

---

## 10. 第一天就要干的事（5/21 今天）

| 谁 | 干啥 |
|----|------|
| **B** | 写 ADR 0004 草稿（OpenClaw 锁定 + 4 个接受条件），晚上 21:00 前发 PR |
| **D** | 写 ADR 0005（存储瘦身）+ ADR 0006（前端瘦身）草稿，晚上 21:00 前发 PR |
| **A** | 列出 apps/web/tests/A/ → tests/A/ 迁移所有动到的文件清单，明早站会同步 |
| **C** | 调研 D 的 `/internal/events/publish` 接口现状，列阻塞项 |
| **全员** | 23:00 前在群里 +1 表示已读本计划，提疑义就改 |

---

## 11. 修订记录

| 日期 | 修订 | 谁 |
|------|------|-----|
| 2026-05-21 | 初稿 | 全员审 |

---

**这份计划只在两种情况下修改**：
1. 联调日发现重大问题 → 当场修订
2. 风险清单中触发硬退路 → 砍范围

**其余时间按计划执行，不开会讨论"要不要改计划"。**
