# Front 重构方案：Arona 阿洛娜前端体验层

> 目标：将 Studio Javis 前端品牌与体验从 “Javis 智能公告板” 重塑为 **Blue Archive / 蔚蓝档案启发的 Arona 阿洛娜智能中枢**。本方案用于指导后续 Claude Code 或前端工程师进行分阶段实现。

## 1. 重构目标

### 1.1 品牌目标

将产品人格从机械感的 Javis 转为更明确的 **Arona / 阿洛娜**：

- 更温柔、明亮、陪伴感强；
- 更像“屏幕中的 AI 学生会秘书 / 工作室助手”；
- 保留系统控制台能力，但弱化冷冰冰的运维后台气质；
- 首页必须像阿洛娜的“主界面”，而不是普通 dashboard。

### 1.2 产品目标

首页成为完整的 Arona Command Center：

1. 一进首页即可开始对话；
2. 对话按钮与输入框放在第一页的核心视觉区域；
3. 语音入口、系统状态、记忆、RSS、VM、日程等功能都能从首页快速进入；
4. 每个功能页保留生产级完整状态：loading / empty / error / disabled / active / streaming；
5. 动画丰富但不廉价，体现“轻盈、清澈、蓝白、漂浮 UI、校园终端”的氛围。

### 1.3 工程目标

- 重构 AppShell 与首页优先，不一次性推翻所有页面；
- 建立可复用设计 tokens、motion tokens、primitive components；
- 页面只负责组合，业务逻辑下沉到 features；
- 动效集中管理，支持 `prefers-reduced-motion`；
- 不破坏现有 API / SSE / WebSocket / Zustand store；
- 先做 v0 可视化方向，再逐步替换功能页。

---

## 2. 设计方向

## 2.1 关键词

```txt
Arona
蔚蓝档案
清澈蓝白
校园终端
AI 秘书
漂浮玻璃卡片
柔和高光
圆润但有秩序
轻量科幻
可爱但不幼稚
系统中枢但不赛博
```

## 2.2 避免方向

```txt
不要 GitHub dark cyberpunk
不要紫粉蓝 AI SaaS 渐变
不要厚重玻璃拟态
不要满屏霓虹
不要廉价二次元贴图堆砌
不要 emoji 当图标
不要把阿洛娜做成纯装饰，必须服务功能
```

## 2.3 视觉温度

- Claude-inspired 的结构克制 + Arona-inspired 的明亮蓝白；
- 信息架构理性，视觉表达温柔；
- 大面积浅色背景，局部蓝色高光；
- 让系统状态看起来像“阿洛娜正在帮你照看工作室”。

---

## 3. Design Decisions

## 3.1 Color palette

建议使用基于 Arona 印象的蓝白系统，但不要直接依赖未经授权的官方素材。颜色作为启发，品牌资产后续应由用户提供或替换。

```txt
Canvas:
- arona-sky-0: #F6FBFF       页面背景
- arona-sky-1: #EAF6FF       二级背景
- arona-sky-2: #D8EEFF       大面积浅蓝 panel

Surface:
- surface-white: #FFFFFF
- surface-glass: rgba(255, 255, 255, 0.72)
- surface-blue-glass: rgba(226, 244, 255, 0.68)

Text:
- ink-primary: #172033
- ink-secondary: #536178
- ink-muted: #8A9AB2

Accent:
- arona-blue: #4BA3FF        主按钮 / focus / active
- arona-cyan: #67D7FF        orb 高光 / speaking
- arona-deep: #2F6FDB        重要状态
- arona-lavender: #A8B8FF    少量辅助高光

State:
- success: #64BFA4
- warning: #F0B85A
- danger: #EF7B8A
- info: #4BA3FF
```

使用规则：

- 首页背景以 `arona-sky-0` 为主；
- 主操作按钮使用 `arona-blue`；
- 语音 / orb 使用 `arona-cyan`；
- error 使用粉红红，但低饱和；
- 不允许随手新增紫粉渐变或高饱和霓虹色。

## 3.2 Typography

```txt
Display:
- 偏圆润、清晰、带一点游戏 UI 感的 sans
- 可先使用系统字体栈，后续接入品牌字体或自托管字体

Body:
- system-ui / -apple-system / BlinkMacSystemFont

Mono:
- ui-monospace / SFMono-Regular，用于 metrics、事件流、技术状态
```

排版原则：

- 首页主标题大，但不要营销页式夸张；
- 功能卡片标题短；
- 状态文本像“阿洛娜提示”，语气温柔清晰；
- 技术日志仍保持可扫描性。

## 3.3 Spacing system

采用 8pt grid：

```txt
4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96
```

页面层级：

- AppShell padding: 24–32px；
- 卡片内部 padding: 16–24px；
- 首页 hero 区域 padding: 32–48px；
- 移动端最小边距 16px。

## 3.4 Radius strategy

```txt
Control: 12px
Input / button group: 18px
Cards: 24px
Hero / command dock: 32px
Orb / avatar: 999px
```

## 3.5 Shadow hierarchy

```txt
Elevation 0: border only
Elevation 1: 0 8px 24px rgba(47, 111, 219, 0.08)
Elevation 2: 0 18px 48px rgba(47, 111, 219, 0.13)
Elevation 3: 0 28px 72px rgba(47, 111, 219, 0.18)
Glow: 0 0 32px rgba(103, 215, 255, 0.38)
```

阴影必须轻，不能做厚重黑影。

## 3.6 Motion style

```txt
Easing:
- --ease-arona: cubic-bezier(0.22, 1, 0.36, 1)
- --ease-bounce-soft: cubic-bezier(0.34, 1.56, 0.64, 1)

Duration:
- micro: 120–180ms
- component: 240–360ms
- page: 420–640ms
- ambient: 8–20s loop
```

动效特点：

- 卡片像轻轻漂浮；
- orb 有呼吸感；
- 页面切换像蓝白界面淡入；
- 按钮反馈清脆；
- 数据更新柔和滚动；
- 减少强烈弹跳，避免低龄化。

---

## 4. 新信息架构

```txt
/
├── Home / Arona Command Center
├── Chat / 对话工作台
├── Voice / 沉浸语音模式
├── Memory / 记忆库
├── Feeds / RSS 情报站
├── System / 工作室状态
├── VMs / VM 控制台
├── Schedule / 日程计划
└── Shared / 共享区，后续扩展
```

首页从 ChatPage 拆出，新增 `HomeCommandPage`。Chat 保留为深度对话页。

---

## 5. 首页 Arona Command Center

## 5.1 首页布局

```txt
┌──────────────────────────────────────────────────────────────┐
│ GlobalTopBar                                                  │
│ Arona 阿洛娜 · online     memory synced     system stable     │
├──────────────────────────────────────────────────────────────┤
│ SideRail │                                                     │
│          │  ┌──────────────────────────┐ ┌─────────────────┐ │
│ Home     │  │ AronaStage               │ │ ContextPanel    │ │
│ Chat     │  │                          │ │ - 当前用户       │ │
│ Voice    │  │ “老师，需要我帮忙吗？”      │ │ - 最近记忆       │ │
│ Memory   │  │                          │ │ - 今日日程       │ │
│ Feeds    │  │  [输入框 Ask Arona...]     │ │ - 系统摘要       │ │
│ System   │  │  [开始对话] [语音模式]     │ └─────────────────┘ │
│ VMs      │  │                          │                     │
│ Schedule │  │  Arona Orb / halo         │                     │
│          │  └──────────────────────────┘                     │
│          │                                                     │
│          │  Quick Actions                                      │
│          │  [Memory] [Feeds] [System] [VMs] [Schedule]         │
│          │                                                     │
│          │  Event Timeline                                     │
│          │  20:41 memory.summarized · 20:38 rss.updated        │
└──────────────────────────────────────────────────────────────┘
```

## 5.2 首页模块

### AronaStage

首页视觉中心。

包含：

- 阿洛娜式 AI orb / halo；
- 主欢迎语；
- 对话输入框；
- 开始对话按钮；
- 语音模式按钮；
- 建议 prompt；
- 当前连接状态。

状态：

```txt
idle:      orb 慢速呼吸，halo 轻微旋转
focused:   输入框展开，suggestion 浮现
thinking:  orb 粒子向中心聚合
speaking:  cyan pulse，transcript 高亮
error:     低饱和粉红闪烁一次，展示恢复按钮
offline:   蓝色降低饱和，按钮 disabled
```

### ConversationEntry

首页必须有的核心功能。

交互：

- 输入文字后点击“开始对话”创建/进入 session；
- 空输入点击按钮时显示建议，而不是无反馈；
- `Enter` 发送，`Shift+Enter` 换行；
- 语音按钮进入 `/voice`；
- 支持 `Cmd+K` 打开全局命令面板；
- 支持 loading / disabled / error / retry。

### QuickActionsRail

功能入口：

```txt
Memory: 查看阿洛娜记住了什么
Feeds: 查看 RSS 与摘要
System: 检查工作室状态
VMs: 管理虚拟机
Schedule: 安排今日计划
Voice: 切换语音模式
```

每个卡片：

- title；
- 一句描述；
- 小状态 badge；
- hover reveal 二级操作；
- keyboard focus ring。

### ContextPanel

右侧上下文：

- 当前用户 / presence；
- 最近 3 条记忆；
- 最近 session；
- 今日 schedule；
- system pulse；
- RSS unread。

### EventTimeline

底部事件流：

```txt
20:41 memory.summarized
20:38 rss.updated
20:31 presence.near
20:29 vm.snapshot.created
```

视觉上像清爽的系统终端，不做黑底 hacker 风。

---

## 6. AppShell 重构

建议：

```txt
AppShell
├── GlobalTopBar
├── SideRail
├── MainStage
├── CommandDock
└── ToastViewport
```

### GlobalTopBar

显示：

- Arona / 阿洛娜；
- 当前页面；
- 在线状态；
- 用户；
- Command shortcut；
- voice shortcut。

### SideRail

窄 rail：

```txt
Home
Chat
Voice
Memory
Feeds
System
VMs
Schedule
```

桌面：左侧 rail，hover 展开。  
移动端：底部 navigation。

### CommandDock

全局可唤起：

- ask Arona；
- search memory；
- navigate；
- run skill；
- open page；
- recent actions。

---

## 7. 页面重构细案

## 7.1 ChatPage / 对话工作台

```txt
ChatPage
├── ChatHeader
├── SessionSidebar
├── ConversationStream
├── ToolActivityRail
├── MemoryContextDrawer
└── ComposerDock
```

必须状态：

- session creating；
- streaming；
- tool_call；
- tool_result；
- ui_action；
- reconnecting；
- empty；
- error；
- disabled/offline。

视觉：

- 消息气泡轻盈；
- assistant 消息可带 Arona 小标识，但不要依赖未经授权图片；
- tool_call 卡片像“阿洛娜执行任务”；
- Memory drawer 用蓝白半透明 panel。

## 7.2 VoicePage / 沉浸语音

```txt
VoicePage
├── VoiceOrbStage
├── TranscriptRibbon
├── PresenceIdentityCard
├── VoiceControls
└── WakeEventOverlay
```

状态：

```txt
idle
wake-detected
identifying
listening
thinking
speaking
handoff-to-chat
error
```

## 7.3 MemoryPage / 记忆库

```txt
MemoryPage
├── MemorySearchCommand
├── MemoryTimeline
├── MemoryGraphToggle
├── MemoryEntryInspector
├── PreferenceShelf
└── MaintenancePanel
```

## 7.4 FeedsPage / RSS 情报站

```txt
FeedsPage
├── SourceSidebar
├── ArticleRiver
├── ReadingPane
├── AronaSummaryDock
└── FeedHealthPanel
```

## 7.5 SystemPage / 工作室状态

```txt
SystemPage
├── SystemHeroPulse
├── MetricsGrid
├── HardwareTimeline
├── NetworkDevices
├── EventLog
└── DiagnosticsDrawer
```

## 7.6 VmsPage / VM 控制台

```txt
VmsPage
├── VmFleetHeader
├── VmCardGrid
├── VmDetailDrawer
├── TerminalPanel
└── DangerousActionConfirm
```

## 7.7 SchedulePage / 日程计划

```txt
SchedulePage
├── TodayFocus
├── CalendarRail
├── TimelineList
├── AronaPlanningDock
└── EventEditorSheet
```

---

## 8. 建议组件结构

```txt
apps/web/src/
├── app/
│   ├── routes.tsx
│   ├── AppShell.tsx
│   └── page-transitions.tsx
│
├── components/
│   ├── primitives/
│   │   ├── Button/
│   │   ├── Surface/
│   │   ├── Badge/
│   │   ├── Tabs/
│   │   ├── Drawer/
│   │   ├── Dialog/
│   │   ├── Skeleton/
│   │   └── Toast/
│   │
│   ├── motion/
│   │   ├── AronaOrb.tsx
│   │   ├── PageFade.tsx
│   │   ├── StaggerList.tsx
│   │   ├── FloatingPanel.tsx
│   │   └── MagneticButton.tsx
│   │
│   ├── command/
│   │   ├── CommandDock.tsx
│   │   ├── CommandPalette.tsx
│   │   └── ConversationEntry.tsx
│   │
│   └── layout/
│       ├── GlobalTopBar.tsx
│       ├── SideRail.tsx
│       ├── ContextPanel.tsx
│       └── MainStage.tsx
│
├── features/
│   ├── chat/
│   ├── voice/
│   ├── memory/
│   ├── feeds/
│   ├── system/
│   ├── vms/
│   └── schedule/
│
├── pages/
│   ├── home/
│   ├── chat/
│   ├── voice/
│   ├── memory/
│   ├── feeds/
│   ├── system/
│   ├── vms/
│   └── schedule/
│
├── styles/
│   ├── tokens.css
│   ├── arona-theme.css
│   └── motion.css
│
└── stores/
```

---

## 9. 实施阶段

## Phase 1：设计系统与壳层

交付：

- `tokens.css`；
- `arona-theme.css`；
- `motion.css`；
- Button / Surface / Badge / Skeleton / Drawer / Dialog；
- AppShell；
- GlobalTopBar；
- SideRail；
- Page transitions。

验收：

- 所有页面统一 Arona 蓝白视觉；
- 导航清晰；
- focus ring 可见；
- reduced motion 生效；
- 320 / 768 / 1024 / 1440 responsive 基础可用。

## Phase 2：HomeCommandPage v0

交付：

- `pages/home/HomeCommandPage.tsx`；
- AronaStage；
- AronaOrb；
- ConversationEntry；
- QuickActionsRail；
- ContextPanel；
- EventTimeline。

验收：

- 首页有对话按钮；
- 首页有输入框；
- 首页能进入 Chat / Voice；
- 首页能进入 Memory / Feeds / System / VMs / Schedule；
- loading / empty / offline 状态可见；
- 动画方向符合 Arona 风格。

## Phase 3：Chat 与 Voice 深化

交付：

- Chat stream motion；
- ComposerDock；
- ToolActivityRail；
- MemoryContextDrawer；
- VoiceOrbStage；
- TranscriptRibbon。

验收：

- SSE token 流畅；
- tool_call/tool_result 清晰；
- Voice 状态完整；
- error/reconnect 有恢复路径。

## Phase 4：功能页重构

顺序：

1. Memory；
2. Feeds；
3. System；
4. VMs；
5. Schedule。

验收：

- 每页有主 action；
- 每页 loading / empty / error；
- 每页与 ask Arona 入口联动；
- 每页可键盘访问。

## Phase 5：浏览器验证与 E2E

验收：

- Chrome console 无 error/warning；
- Playwright 关键路径通过；
- Vitest 通过；
- axe 无关键 a11y 问题；
- 移动 / 平板 / 桌面布局正常。

---

## 10. v0 优先范围

第一版不要重做所有页面。建议 v0 只做：

```txt
- AppShell
- Arona theme tokens
- HomeCommandPage
- AronaStage
- ConversationEntry
- AronaOrb
- QuickActionsRail
- ContextPanel
- EventTimeline
```

这样可以最快验证：

- Arona 风格是否正确；
- 首页是否足够有记忆点；
- 对话按钮位置是否满意；
- 动画是否丰富但不过度。

---

## 11. 设计验收标准

- 首页第一屏必须能看出“阿洛娜智能中枢”；
- 对话入口必须比其他功能入口更突出；
- 颜色不得偏向通用 AI 紫蓝渐变；
- 动画必须有状态意义，而不是纯装饰；
- 所有按钮有 hover / active / focus / disabled；
- 所有异步区域有 loading / empty / error；
- 视觉层级清楚，用户知道下一步该点哪里；
- UI 不依赖未授权图片也能成立；
- 如果后续加入 Arona 官方/自绘资产，必须通过本地 asset 管理，而不是 hotlink。
