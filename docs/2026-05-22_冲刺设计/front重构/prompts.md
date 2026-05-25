# Front 重构提示词：Arona 阿洛娜前端实现 Prompt Pack

> 本文件给后续 Claude Code / 前端 Agent 使用。目标是让实现者按统一审美、结构和验收标准推进 Arona 阿洛娜前端重构。

## 0. 总提示词

```txt
你正在重构 Studio Javis 的前端。品牌人格已经从 Javis 改为 Arona / 阿洛娜，视觉方向为 Blue Archive / 蔚蓝档案启发的清澈蓝白校园 AI 中枢，但不要直接使用未经授权的官方图片或素材。

请构建生产级 React + TypeScript + Tailwind UI。目标不是普通后台，而是一个温柔、明亮、流畅、有陪伴感的智能工作室中枢。首页必须放置最突出的对话按钮和输入入口，让用户第一屏就能开始与阿洛娜对话。

必须遵守：
- 不使用通用 AI 紫粉蓝大渐变；
- 不使用黑底赛博风；
- 不使用 emoji 作为图标替代；
- 不制造未授权角色图片；
- 不引入无意义装饰；
- 所有动效必须表达状态或引导视线；
- 支持 prefers-reduced-motion；
- 所有交互有 hover / active / focus / disabled；
- 所有异步区域有 loading / empty / error；
- 保留现有 API、SSE、WebSocket、Zustand store 的兼容性。

优先实现：
1. 设计 tokens；
2. AppShell；
3. HomeCommandPage；
4. AronaStage；
5. ConversationEntry；
6. AronaOrb；
7. QuickActionsRail；
8. ContextPanel；
9. EventTimeline。
```

---

## 1. 设计系统提示词

```txt
请为 apps/web 建立 Arona 风格设计系统。

新增或更新：
- src/styles/tokens.css
- src/styles/arona-theme.css
- src/styles/motion.css

设计目标：
- 背景为清澈浅蓝白；
- surface 有轻微玻璃感但不能厚重；
- 主色为明亮 Arona blue；
- 文本颜色深蓝黑，保证对比度；
- focus ring 明显；
- radius 有层级；
- shadow 轻，主要用蓝色透明阴影；
- motion 使用柔和 ease-out。

建议 tokens：
- --color-canvas: #F6FBFF
- --color-sky-soft: #EAF6FF
- --color-sky-panel: #D8EEFF
- --color-surface: #FFFFFF
- --color-surface-glass: rgba(255, 255, 255, 0.72)
- --color-ink-primary: #172033
- --color-ink-secondary: #536178
- --color-ink-muted: #8A9AB2
- --color-arona-blue: #4BA3FF
- --color-arona-cyan: #67D7FF
- --color-arona-deep: #2F6FDB
- --color-arona-lavender: #A8B8FF
- --radius-control: 12px
- --radius-card: 24px
- --radius-hero: 32px
- --ease-arona: cubic-bezier(0.22, 1, 0.36, 1)

请确保 Tailwind 可以继续用于布局，但视觉颜色和动画优先走 CSS variables。
```

---

## 2. AppShell 提示词

```txt
请重构 apps/web 的 AppShell，使其成为 Arona Command Center 的应用壳层。

结构：
AppShell
├── GlobalTopBar
├── SideRail
├── MainStage
├── CommandDock / optional placeholder
└── ToastViewport / optional placeholder

要求：
- 桌面端左侧使用窄 SideRail；
- 移动端转换为 bottom navigation；
- TopBar 显示 Arona 阿洛娜、当前页面、在线状态、用户入口、Command shortcut；
- MainStage 有柔和浅蓝背景与 subtle ambient decoration；
- 页面切换使用淡入 + 轻微上移；
- active nav item 使用蓝色高光和 pill 背景；
- 所有 nav item 是可键盘访问的 button/link；
- 不要破坏当前 react-router 路由。

导航项：
- Home
- Chat
- Voice
- Memory
- Feeds
- System
- VMs
- Schedule

如果当前项目还没有 /home，可将 / 作为 HomeCommandPage，并将 Chat 放到 /chat。
```

---

## 3. HomeCommandPage 提示词

```txt
请新增或重构首页为 HomeCommandPage。首页是 Arona Command Center，必须是整个应用最重要的页面。

页面结构：
HomeCommandPage
├── AronaStage
│   ├── AronaOrb
│   ├── HeroCopy
│   └── ConversationEntry
├── ContextPanel
├── QuickActionsRail
└── EventTimeline

首屏目标：
- 用户第一眼看到“阿洛娜在线”；
- 用户第一屏能直接输入并点击“开始对话”；
- 语音模式按钮也在第一屏；
- Memory / Feeds / System / VMs / Schedule 可快速进入；
- 显示当前系统/记忆/RSS/日程摘要。

Hero copy 建议：
- 主标题：老师，需要我帮忙吗？
- 副标题：阿洛娜已经同步了记忆、日程和工作室状态。

必须状态：
- normal
- input focused
- creating session
- offline / bridge unavailable
- empty suggestions
- error with retry

不要使用真实角色图片，除非用户提供本地资产。可以用抽象 AronaOrb / halo 表达人格。
```

---

## 4. ConversationEntry 提示词

```txt
请实现 ConversationEntry 组件，作为首页和全局 CommandDock 的核心对话入口。

功能：
- textarea 输入；
- 主按钮：开始对话；
- 次按钮：语音模式；
- 支持 Enter 发送，Shift+Enter 换行；
- 空输入点击开始时展示 prompt suggestions；
- 支持 loading 状态；
- 支持 disabled/offline；
- 支持 error retry；
- 点击语音模式导航到 /voice；
- 点击开始对话应复用现有 session/chat store 或现有 API 封装，不要新建重复状态系统。

视觉：
- 像漂浮的蓝白 command dock；
- focus 时轻微放大和蓝色 halo；
- 按钮 hover 有清脆浮起；
- suggestions 用小 pill，不要做彩色标签墙。

可访问性：
- textarea 有 aria-label；
- loading 用 aria-busy；
- error 用 role=alert；
- 按钮有 visible focus ring。
```

---

## 5. AronaOrb 提示词

```txt
请实现 AronaOrb 组件，用抽象 orb / halo 表达阿洛娜状态，不使用官方角色图片。

Props：
- state: 'idle' | 'focused' | 'listening' | 'thinking' | 'speaking' | 'error' | 'offline'
- size?: 'sm' | 'md' | 'lg'
- reducedMotion?: boolean

视觉：
- 浅蓝白 orb；
- 外圈 halo；
- 少量粒子或光点；
- 状态改变时颜色和节奏变化。

状态动效：
- idle: 慢速呼吸
- focused: halo 变亮，轻微上浮
- listening: 环形波纹扩散
- thinking: 小粒子聚合/旋转
- speaking: cyan pulse
- error: soft pink flash
- offline: 降低饱和和透明度

实现优先级：
1. CSS radial-gradient + pseudo elements；
2. CSS keyframes；
3. 必要时少量 SVG；
4. 不引入重型动画库。

必须支持 prefers-reduced-motion。
```

---

## 6. QuickActionsRail 提示词

```txt
请实现 QuickActionsRail。它是首页下方/中部的核心功能入口。

Action items：
- Memory: 查看阿洛娜记住了什么
- Feeds: RSS 情报与摘要
- System: 工作室状态
- VMs: 虚拟机控制台
- Schedule: 今日计划
- Voice: 语音模式

每个 action card：
- icon placeholder 或现有 icon library；不要 emoji；
- title；
- description；
- status badge；
- hover reveal secondary action；
- click navigate；
- keyboard focus。

布局：
- desktop: responsive grid 或 horizontal rail；
- mobile: 2-column cards；
- active/hover 有轻微 translateY 和蓝色边缘光。
```

---

## 7. ContextPanel 提示词

```txt
请实现首页 ContextPanel，显示阿洛娜当前掌握的上下文。

Sections：
- User / presence
- Recent memory, max 3
- Today schedule
- RSS unread / latest
- System pulse
- Active session

要求：
- 数据没有接好时使用真实的 empty placeholders，不要编造数据；
- loading 用 skeleton；
- error 显示可恢复提示；
- 每个 section 可点击进入对应页面；
- panel 可在小屏折叠。

视觉：
- 半透明蓝白 panel；
- section 之间用细分割线；
- mono 用于系统数字；
- 不要卡片套卡片过多。
```

---

## 8. EventTimeline 提示词

```txt
请实现 EventTimeline，展示系统事件流。

事件类型：
- memory.summarized
- rss.updated
- presence.near
- vm.status_changed
- system.metric_changed
- schedule.created

要求：
- 如果有现有 WebSocket event bus，优先接入；
- 如果还没有数据，使用明确的 empty state：暂无实时事件；
- 不要伪造大量假事件；
- hover 展开详情；
- 新事件进入时轻微 slide/fade；
- 使用 mono 时间戳。

视觉：
- 浅色终端感；
- 蓝色细线；
- 低对比，不抢 ConversationEntry 的主视觉。
```

---

## 9. ChatPage 提示词

```txt
请将 ChatPage 重构为 Arona 对话工作台。

结构：
ChatPage
├── ChatHeader
├── SessionSidebar
├── ConversationStream
├── ToolActivityRail
├── MemoryContextDrawer
└── ComposerDock

要求：
- 复用现有 SSE client；
- token streaming 要流畅；
- tool_call/tool_result 以任务卡形式展示；
- ui_action 要有可读展示；
- error/reconnect 要有恢复路径；
- 清屏/结束 session 有确认或明确反馈；
- ComposerDock 风格与首页 ConversationEntry 一致。

动效：
- message enter stagger；
- token fade-in；
- tool card slide-in；
- session switch crossfade。
```

---

## 10. VoicePage 提示词

```txt
请将 VoicePage 做成阿洛娜沉浸语音界面。

结构：
VoicePage
├── VoiceOrbStage
├── TranscriptRibbon
├── PresenceIdentityCard
├── VoiceControls
└── WakeEventOverlay

状态：
- idle
- wake-detected
- identifying
- listening
- thinking
- speaking
- handoff-to-chat
- error

要求：
- VoiceOrbStage 复用 AronaOrb；
- transcript 从底部浮现；
- speaking 时 orb 和 transcript 有同步 pulse；
- error 状态可重试；
- 支持返回 Chat。
```

---

## 11. 功能页统一提示词

```txt
请按 Arona 设计系统重构功能页。每个页面必须包含：
- 页面标题；
- 一句阿洛娜式辅助说明；
- 主 action；
- loading skeleton；
- empty state；
- error state；
- 与 ask Arona 的联动入口；
- responsive 布局；
- keyboard focus。

页面方向：
- Memory: 记忆时间线 + inspector
- Feeds: source sidebar + article river + reading pane
- System: metrics grid + pulse hero + event log
- VMs: fleet cards + detail drawer + terminal
- Schedule: today focus + calendar rail + event editor
```

---

## 12. 验收提示词

```txt
请完成实现后逐项检查：

视觉：
- 是否一眼能看出 Arona 蓝白风格；
- 是否避免了通用 AI 紫蓝渐变；
- 首页对话入口是否是视觉第一优先级；
- 动画是否有状态意义；
- 页面是否有足够留白和层级。

功能：
- 首页可以开始对话；
- 首页可以进入语音；
- 首页可以导航所有核心功能；
- Chat SSE 正常；
- Voice 状态正常；
- 各页面 loading/empty/error 正常。

可访问性：
- Tab 顺序合理；
- focus ring 可见；
- button/link 语义正确；
- aria-label 完整；
- reduced motion 生效；
- 颜色对比达标。

测试：
- pnpm --filter web exec vitest run
- pnpm --filter web e2e
- pnpm --filter web build
- 浏览器 console 无 error/warning
- 320 / 768 / 1024 / 1440 viewport 正常
```

---

## 13. 分阶段执行提示词

### Phase 1 prompt

```txt
只实现 Arona 设计系统与 AppShell，不重构业务页。新增 tokens、theme、motion，并改造全局导航。保持现有页面可访问。完成后运行 frontend typecheck/build。
```

### Phase 2 prompt

```txt
实现 HomeCommandPage v0。首页必须包含 AronaStage、ConversationEntry、AronaOrb、QuickActionsRail、ContextPanel、EventTimeline。不要重构 Chat 深层逻辑，只确保首页可进入 Chat/Voice 和核心页面。
```

### Phase 3 prompt

```txt
重构 ChatPage 和 VoicePage 的视觉与交互。复用现有 SSE、session store、voice route。重点是 streaming message、tool activity、memory context drawer、voice orb states。
```

### Phase 4 prompt

```txt
按 Arona 设计系统逐页重构 Memory、Feeds、System、VMs、Schedule。每页都必须有主 action、ask Arona 入口、loading/empty/error、responsive 和 keyboard focus。
```

### Phase 5 prompt

```txt
启动 dev server，用真实浏览器检查 Home、Chat、Voice、Memory、Feeds、System、VMs、Schedule。修复 console errors、布局溢出、焦点问题、动效过度问题。最后运行 Vitest、Playwright、build。
```
