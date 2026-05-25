# 前端 A 开发进度

> 角色：A · 前端与交互 | 战场：`apps/web/` + `packages/ui-kit/` + `tests/A/`
> 依赖文档：`00_协作总纲与接口契约.md` · `01_前端A_规划书.md`
> 最后更新：2026-05-21 · W1 冲刺完成 | 详细记录：`A_W1_瘦身与收敛.md`

---

## 阶段 1：项目骨架搭建（W1）

**日期：2026-05-20** | 状态：✅ 完成

**项目配置**
- `apps/web/package.json`：Vite 5 + React 18 + TypeScript 5 全栈依赖
- `tsconfig.json` / `tsconfig.node.json`：strict 模式，`@/*` 路径别名
- `vite.config.ts`：React 插件、路径别名、`/api` + `/ws` 代理、manualChunks 代码分割
- `tailwind.config.ts`：Claude Design 调色板（暖橙 `#D97757`）、Inter + Noto Sans SC + JetBrains Mono 字体栈、自定义 keyframes
- `index.html`：Google Fonts preconnect
- ESLint + Prettier + Vitest + Playwright 配置

**设计 Token**
- `--color-accent` / `--color-surface` / `--color-border` / `--color-text-*` CSS 变量
- `--font-sans` / `--font-mono`
- 暗黑模式通过 `.dark` class 切换
- 组件样式层：`.btn-primary` / `.btn-secondary` / `.card` / `.input`

**5 个页面壳**
| 页面 | 路由 | 核心组件 |
|------|------|----------|
| 对话 | `/` | ChatPage（公告板 + 对话模式）、ChatBubble、ChatInput、DashboardCards、FaceTrackOverlay |
| 我的信息源 | `/me/feeds` | FeedsPage、FeedCard、Add RSS modal |
| 共享信息源 | `/shared` | SharedPage、公告区 |
| 虚拟机 | `/vms` | VmsPage、CreateVmForm、VmDetail、MockTerminal |
| 硬件监控 | `/system` | SystemPage、GpuCard、CpuGrid、MemoryBar、TrainingTable、NetworkTable |

**布局组件**
- `AppShell`：Sidebar + TopBar + main + ToastContainer + WakeOverlay
- `Sidebar`：64px 窄导航，5 个 Lucide 图标 + 状态点 + 用户头像
- `TopBar`：页面标题 + 在线状态（灰/橙/蓝）

**认证**
- `LoginPage`：react-hook-form + zod，用户名密码登录
- Zustand `auth` store：persist（JWT），login/logout/setUser

---

## 阶段 2：基础设施层（W2）

**日期：2026-05-21** | 状态：✅ 完成

**Lib**
- `api/client.ts`：typed API client，Bearer token 注入，401 自动登出
- `sse-client.ts`：SSE 流式解析（event/data 分行），AbortController 中断
- `event-bus.ts`：WebSocket 事件总线，断线自动重连（3s）
- `ui-actions.ts`：Agent ui_action dispatcher（navigate/toast/highlight/render_card/clear_session/confirm）
- `utils.ts`：`cn()`（clsx + tailwind-merge）、`formatRelativeTime()`、`formatCountdown()`

**Hooks**
- `useChatStream`：SSE 流式对话（token/tool_call/tool_result/ui_action/done/error）
- `useWakeEvents`：WS 订阅 wake/leave 事件驱动状态机

**Zustand Stores**
- `auth`：JWT + 用户信息 persist
- `session`：唤醒状态机（idle→waking→active→leaving）、会话 ID、侧栏
- `ui`：Toast 通知栈（4s 自动消失）

**MSW Mock 全栈覆盖**
- `handlers.ts`：15+ API endpoint（Auth/User/Chat/Feeds/Schedules/System/VMs/Network）
- `data/*.ts`：真实形态工作室数据（成员名、RSS 源、日程、GPU 信息）
- SSE streaming mock：逐 token 输出中文回复 + tool_call 模拟

---

## 阶段 3：对话页流式渲染与唤醒离开（W3-W4）

**日期：2026-05-21** | 状态：✅ 完成

**Markdown 渲染**
- ChatBubble 升级 `react-markdown` + `remark-gfm` + `rehype-highlight`
- `.prose-javis` 样式层（p/ul/ol/code/pre/blockquote/a/table/hr/em/strong）
- 流式光标 `.stream-cursor > *:last-child::after` 闪烁 `▌`

**唤醒/离开动画**
- WakeOverlay：1.2s rotate 旋屏（Framer Motion AnimatePresence）
- LeaveCountdown：5s 倒计时 + "我还在，保留"撤销
- "假装唤醒"按钮（testid: `fake-wake-btn`）
- "假装离开"按钮（testid: `fake-leave-btn`）

**会话管理**
- 进入对话模式自动 `POST /api/chat/sessions`
- 离开后清空消息 + 清除会话 ID
- 注册用户直接对话模式（绕过唤醒动画）

**ScrollToBottom**
- 消息区偏移 >300px 显示浮钮
- Framer Motion 动画进出

---

## 阶段 4：ui-kit 组件库

**日期：2026-05-21** | 状态：✅ 完成

`packages/ui-kit/` 6 个原子组件：
| 组件 | 变体 |
|------|------|
| `Button` | 4 变体（primary/secondary/ghost/danger）× 3 尺寸（sm/md/lg） |
| `Card` | 3 padding（none/sm/md） |
| `Badge` | 5 状态（default/success/warning/error/accent） |
| `Input` | with label + error |
| `RingProgress` | SVG 环形进度 |
| `EmptyState` | icon + title + description + action |

---

## 阶段 5：RSS 详情 + 日程时间轴（W5-W6）

**日期：2026-05-21** | 状态：✅ 完成

**FeedItemDetail**
- Feed 卡片点击 → 全宽详情视图
- 返回按钮 + 标题 + 来源/时间 metadata
- "原文"外链按钮
- AI Markdown 摘要（react-markdown + prose-javis）
- Mock 数据：MiniMax-M2.7 技术报告完整中文长文

**ScheduleTimeline**
- 纵向时间轴（HH:mm + 圆点 + 连线）
- 24h 内紧急橙色高亮 + 大号倒计时
- 过期事项灰显 + "已过期"徽章
- 点击展开完整正文
- "由 Javis 创建"徽章（Bot 图标）
- 加载中/错误/空态中文提示

**FeedsPage 升级**
- 集成 ScheduleTimeline（scope=personal）
- Feed 卡片 onClick → FeedItemDetail
- 详情页"返回信息源"回到列表

---

## 阶段 6：共享页权限矩阵（W6）

**日期：2026-05-21** | 状态：✅ 完成

**SharedPage 权限矩阵**
- 3 级权限图例（Shield/Users/Globe）：
  - 仅创建者可改 / 全员可改 / 公开可见
- 日程条目 hover 显示权限图标 + 编辑/删除按钮
- Feed 卡片左侧权限色条（橙=全员/灰=创建者/透明=公开）
- 权限由用户角色（admin vs member）+ ownership 推导

---

## 阶段 7：硬件监控图表（W8）

**日期：2026-05-21** | 状态：✅ 完成

**自研 SVG 图表组件**
- `MetricsRing`：环形进度（CPU/内存/GPU/温度），自定义 size/color/label/unit
- `BarChartSimple`：柱状图（CPU 核心利用率），hover tooltip
- `LineChartSimple`：折线图（时序数据），面积填充 + 数据点

**SystemPage 升级**
- 4 个 MetricsRing 概览环（CPU/内存/GPU/温度）
- CPU 核心柱状图（前 16 核）
- 温度环颜色自适应：>80°C 红，>65°C 黄

---

## 阶段 8：xterm.js 终端（W7）

**日期：2026-05-21** | 状态：✅ 完成

**XTermTerminal**
- `@xterm/xterm` + `@xterm/addon-fit`
- Claude Design 主题（黑底 #18181B、绿字 #4ADE80、橙光标 #D97757）
- Mock 模式：10+ bash 命令（ls/pwd/whoami/nvidia-smi/python/pip list/clear/help）
- 自动 resize 适配容器
- VmDetail 已从 MockTerminal 切换为 XTermTerminal
- 构建：xterm 独立 chunk（284KB）

---

## 阶段 9：测试基础设施

**日期：2026-05-21** | 状态：✅ 完成

### 单元测试（5 文件，34 用例）

| 文件 | 用例 | 覆盖 |
|------|------|------|
| `lib/utils.test.ts` | 13 | cn 合并、formatRelativeTime、formatCountdown |
| `lib/api/client.test.ts` | 7 | GET、401、Auth header、非 200、204 |
| `stores/auth.test.ts` | 4 | login/logout/setUser |
| `stores/session.test.ts` | 4 | wakeState、sessionId、toggleSidebar |
| `stores/ui.test.ts` | 6 | addToast、removeToast、4s 自动过期 |

### 集成测试（5 文件，19 用例）

| 文件 | 用例 | 覆盖 |
|------|------|------|
| `pages/chat/ChatPage.test.tsx` | 4 | 公告板、假装唤醒、发送消息、离开倒计时 |
| `pages/feeds/FeedsPage.test.tsx` | 4 | Feed 列表、添加表单、新增、空态 |
| `pages/vms/VmsPage.test.tsx` | 4 | VM 列表、创建表单、新增、详情 |
| `pages/system/SystemPage.test.tsx` | 4 | 指标概览、GPU 卡、训练任务、网络设备 |
| `pages/shared/SharedPage.test.tsx` | 3 | 标题公告、权限图例、共享 Feed |

### 附加测试

| 文件 | 用例 | 覆盖 |
|------|------|------|
| `hooks/useTheme.test.ts` | 4 | 默认系统主题、setTheme、toggle 循环 |

### E2E（Playwright，4 spec，14 条测试）

| 文件 | 条数 | 内容 |
|------|------|------|
| `app.spec.ts` | 4 | 登录→5页smoke、唤醒→对话→离开 |
| `feeds-vm.spec.ts` | 6 | RSS 添加→详情、VM 创建→终端→销毁、日程对话 |
| `accessibility.spec.ts` | 4 | 登录/仪表盘/系统/信息源 WCAG 2.0/2.1 A+AA |
| `visual.spec.ts` | 6 | 登录/仪表盘/对话/信息源/系统 截图对比（1% diff） |

### Storybook（7 个故事）
- ToastContainer、ChatBubble、GpuCard、FeedItemDetail、XTermTerminal、ScheduleTimeline、MetricsRing

---

## 阶段 10：工具链补全（W9-W10）

**日期：2026-05-21** | 状态：✅ 完成

**stylelint**
- `stylelint-config-standard` + `stylelint-config-tailwindcss`
- `lint:style` 脚本
- `globals.css` 通过 stylelint 格式化

**暗黑模式**
- `useTheme` hook + Zustand `useThemeStore`（persist）
- 三态切换：跟随系统 → 暗黑 → 明亮
- TopBar 主题按钮（Moon/Sun/Monitor）
- 监听系统 `prefers-color-scheme` 变化

**代码质量**
- `console.log` 0 残留
- `any` 0 残留
- `// TODO` 0 残留

**Lighthouse CI**
- `lighthouserc.cjs`：FCP<2s / LCP<2s / CLS<0.1 / TBT<300ms

**Chromatic**
- 脚本 + Storybook addon 配置

**Runbook**
- `docs/runbook/A_前端Runbook.md`：快速诊断 / 常见修复 / 测试运行 / 性能基线 / 部署清单 / 目录速查

---

## 最终指标（Mac 阶段交付）

| 指标 | 值 |
|------|-----|
| `tsc --noEmit` | 0 errors |
| `stylelint` | 0 problems |
| `vitest run` | **57/57 passed**（11 文件） |
| `vite build` | 2.30s，6 chunks（主包 218KB） |
| `storybook build` | 0 errors |
| 源文件 | 72 `.ts/.tsx/.css`（apps/web） |
| 单元/集成测试 | 11 文件 / 57 用例 |
| E2E 测试 | 4 spec / 14 条 |
| Storybook | 7 stories |
| ui-kit 组件 | 6 个 |
| Lighthouse CI | `lighthouserc.cjs` ✓ |
| Chromatic | 脚本 + addon ✓ |
| 暗黑模式 | 三态切换 + persist + 系统监听 ✓ |
| Runbook | `docs/runbook/A_前端Runbook.md` ✓ |
| Docker | `Dockerfile.web` + `nginx.conf`（Gzip + SSE/WS 代理 + SPA fallback） ✓ |

### 构建分块

| chunk | 大小（gzip） |
|-------|-------------|
| vendor（react/dom/router） | 53KB |
| motion（framer-motion） | 38KB |
| markdown（react-markdown/rehype-highlight） | 101KB |
| xterm（@xterm/xterm） | 71KB |
| main（应用代码） | 64KB |
| css | 5KB |

---

## Mac 阶段交付清单（对照 01 规划书 §11）

- [x] 全部 UI、全部 5 页、全部交互动画
- [x] MSW 假数据驱动的完整体验
- [x] E2E + 视觉回归 + 性能基线
- [x] ui_action dispatcher 全套
- [x] xterm.js mock 终端
- [x] 测试金字塔（单元 34 + 集成 19 + E2E 14 = 67 条）
- [x] 可访问性审计（axe-core, 0 critical violations）
- [x] Storybook 组件文档
- [x] Runbook 运维手册
- [x] 暗黑模式
- [x] 代码质量（0 console.log/any/TODO，stylelint 全绿）

---

---

## 阶段 13：W1 冲刺 — 瘦身与收敛（05 收官计划 §4.4）

**日期：2026-05-21** | 状态：A1.1 ✅ / A1.2 ✅ / A1.3 ⚠️

| 编号 | 任务 | 状态 |
|------|------|------|
| A1.1 | `apps/web/tests/A/` → `tests/A/` 迁移，Playwright 路径同步 | ✅ |
| A1.2 | 删 `lib/{auth,sse,ws}` 空占位目录 | ✅ |
| A1.3 | 用 D 生成的 TS 类型替换手写 | ⚠️ 阻塞于 D1.4 |
| #6 | 去 Chromatic（前端瘦身） | ✅ |
| #7 | 测试目录收敛到 `tests/{A,B,C,D}/` | ✅ |

**A1.3 阻塞详情**：openapi-typescript 成功生成 `packages/contracts/ts/api.d.ts`，但因 OpenAPI schema 未声明 `required` 字段，所有字段标记为 optional，与现有代码必填语义不兼容。等 D 修复后替换。

详见：`docs/实施进度/A_W1_瘦身与收敛.md`

---

## Linux 阶段待办

| 事项 | 负责 |
|------|------|
| 真实摄像头权限 / 不同分辨率适配 | C |
| 屏幕物理旋转后 UI 像素对齐微调 | A + C |
| ttyd 真实 Web SSH 接入（替换 mock 终端） | A + C |
| 真实数据下的性能复测 | A + C |
| 物理按键 / 触摸屏适配 | C |
