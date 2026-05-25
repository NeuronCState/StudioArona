# 工程师 A · 前端体验层任务书

> **角色定位**：负责整个 Web 端的视觉、交互、动效与 AI 驱动 UI 的渲染层。
> **协作模式**：与工程师 B 通过 `packages/contracts/` 中的三份契约文件解耦，互不阻塞。
> **工期**：8 周，对应 Phase M1 - M4。

---

## 0. 角色 Prompt（直接喂给执行 Agent）

```
你是 Studio Javis 项目的前端体验工程师。
你的目标：把当前完成度 10% 的 Web 端推进到生产可用，重点是对话体验、AI 驱动 UI、语音模式三件事。

设计语言：Claude（暖灰底 / 墨色文字 / 赭石点缀 / serif 标题 / 大量留白）。
交互范式：参考主流 AI 对话产品（消息气泡、悬浮工具栏、流式输出、语音球三态）。
关键约束：视觉资产、字体、颜色、图标全部自创或使用开源资源，不复制任何专有产品的 CSS 或品牌素材。

工作目录限定：
  apps/web/**
  packages/ui-kit/**

只读、不修改：
  packages/contracts/openapi.yaml
  packages/contracts/ws-events.schema.json
  packages/contracts/ui-actions.schema.json
  services/**

任何契约层修改必须发起 issue 与工程师 B 协商。
所有改动在每个 Phase 末尾自测：pnpm --filter web typecheck && lint && test && e2e。
```

---

## 1. 范围边界

| 类型 | 路径 | 权限 |
|---|---|---|
| 全权 owner | `apps/web/**` | 读写 |
| 全权 owner | `packages/ui-kit/**` | 读写 |
| 共享契约（只读） | `packages/contracts/*.yaml` `*.schema.json` | 仅读，需修改时与 B 协商 |
| 禁止触碰 | `services/**` `infra/**` `packages/skills/**/handler.py` | 完全不动 |

**与 B 的接口契约（你只消费、不定义）**
- HTTP / SSE：`openapi.yaml` 定义的所有路由
- WebSocket 事件：`ws-events.schema.json` 中的事件类型
- AI 驱动 UI 动作：`ui-actions.schema.json` 中的 `navigate / highlight / render_card / clear_session / toast / confirm` —— 你的组件注册表必须支持每一种

---

## 2. 设计系统（先做，不然后面所有页面都返工）

### 2.1 Design Tokens（`apps/web/src/styles/tokens.css`）

新建 CSS Variables，覆盖以下层级：

```
颜色：
  --color-bg              暖灰底（接近 #F7F4EE）
  --color-surface         卡片底（#FFFFFF / dark 模式 #1F1D1B）
  --color-text-primary    墨色（#1A1916）
  --color-text-secondary  中灰
  --color-accent          赭石（约 #B8552B，呼应 Claude 橙）
  --color-accent-soft     淡赭（用于 hover / 选中态）
  --color-border          细分隔
  --color-success / --color-warn / --color-error

字号：
  --text-xs ... --text-3xl，比例 1.2

字体：
  --font-sans  系统 UI 栈 + Inter / Noto Sans SC
  --font-serif Lora / Source Serif 用于标题与 AI 引言
  --font-mono  JetBrains Mono / Fira Code

间距：4px 基准 8 级
圆角：--radius-sm 6px, --radius-md 12px, --radius-lg 20px, --radius-pill 999px
阴影：3 级，elevation-1/2/3，模糊柔和不抢戏
动效曲线：
  --ease-out  cubic-bezier(0.16, 1, 0.3, 1)
  --ease-in-out  cubic-bezier(0.65, 0, 0.35, 1)
  --duration-fast 150ms / --duration-base 250ms / --duration-slow 400ms
```

同时建 dark 模式（`[data-theme="dark"]` 选择器覆盖），整站默认跟随系统。

### 2.2 ui-kit 基础组件清单

在 `packages/ui-kit/` 输出（先无依赖纯展示，再被 web 引入）：

- `Button`（primary / secondary / ghost / danger，3 个尺寸）
- `IconButton`（图标按钮，含 tooltip 槽位）
- `Input` / `Textarea`（带 error / hint 状态）
- `Card` / `Surface`
- `Avatar`（首字母兜底 + 真实图）
- `Tooltip` / `Popover` / `Dropdown`
- `Dialog` / `Drawer`
- `Toast`（接 ui_action 的 toast）
- `Skeleton`（加载占位）
- `Tag` / `Badge`
- `Tabs`
- `Spinner`（呼吸点状）

每个组件必须有：Storybook story、a11y 属性（aria-* / 键盘交互）、暗色态。

---

## 3. 页面级详细规格

> **铁律：没有任何页面可以是空白或只放占位。** 每个页面要有完整的视觉层级、骨架屏、空态插画、错误态。

### 3.1 登录 / 注册页 `/login`

布局：左右分屏（移动端单栏）。
- 左：品牌区，serif 大标题"工作室贾维斯"，副标题一句话介绍，背景是缓慢漂移的网格 + 几何粒子（Canvas 或 CSS animation，30fps 节流）
- 右：表单卡片
  - 切换 Tab：登录 / 注册
  - 字段：用户名、密码、（注册时）显示名、头像上传（拖拽 + 点击）
  - 头像未传时给 6 个预设卡通头像可选
  - 提交按钮加载态用 Spinner 替换文本
- 错误态：表单顶部 inline error，shake 动画 (`x: [-4, 4, -2, 2, 0]`, 350ms)
- 注册成功后自动登录跳 `/chat`

### 3.2 默认对话页 `/chat`（**核心**）

整体布局（参考主流 AI 对话产品的范式，自创视觉）：

```
┌──────────────────────────────────────────────────────────┐
│ TopBar: 左 Sidebar 折叠 / 中 会话标题 + 模型选择 / 右 头像菜单 │
├─────────────┬────────────────────────────────────────────┤
│             │                                            │
│  Sidebar    │     消息流主栏（最大宽度 768px 居中）        │
│  · 新对话    │                                            │
│  · 历史会话   │     [user 气泡：右靠浅色卡片]               │
│   (按时分组)  │     [ai 流式：左靠纯文 + 头像 + 工具栏]      │
│  · Memory    │                                            │
│  · Feeds     │                                            │
│  · System    │                                            │
│  · VMs       │                                            │
│             │                                            │
│             │  ┌────────────────────────────────────┐    │
│             │  │ [+] [📎] 输入...        [🎤] [↑]    │    │
│             │  └────────────────────────────────────┘    │
│             │  底部 hint：⌘+Enter 发送 / ⌘+/ 命令          │
└─────────────┴────────────────────────────────────────────┘
```

**消息气泡规格**
- 用户：右对齐，最大宽 600px，淡赭背景 + 圆角 16px，hover 显示 [复制 / 编辑]
- AI：左对齐，无背景纯文字流，左侧 32px 头像（阿洛娜风格），下方一行工具栏：[复制 / 重新生成 / 朗读 / 👍 / 👎]
- Markdown 渲染：用 `react-markdown + remark-gfm + rehype-highlight`，代码块要有语言标签 + 复制按钮 + 折叠（>20 行）
- 表格、列表、引用全部走自己的 prose 样式（不用 prose-tailwind 默认）

**流式 token 动效**
```ts
// 每个 token 入场
<motion.span
  initial={{ opacity: 0, y: 2 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.18, ease: 'easeOut' }}
/>
```
但**不要每个 char 都 motion**，性能会爆。按 token chunk 分组，一组一个 motion span。

**tool_call 卡片**（AI 调用 skill 时弹出）
- 折叠态：单行 chip：图标 + skill 名 + 一行参数 preview
- 展开态：显示完整 input JSON、运行中 spinner、result（成功）或 error（失败）
- 用 framer-motion 的 `layoutId` 让折叠⇄展开平滑过渡
- 失败用淡红色边框

**输入区**
- 自适应高度（最小 1 行，最大 8 行）
- `⌘+Enter` 发送，`Enter` 换行
- 左侧按钮：附件、命令面板（`⌘+/`）
- 右侧按钮：麦克风（点击进入语音模式）、发送
- 拖拽文件进入：整个输入区高亮虚线边框

**Sidebar**
- 历史会话按"今天 / 昨天 / 本周 / 更早"分组
- 每个会话项：标题（首条用户消息截断）+ 时间 + hover 出现 [重命名 / 删除]
- 顶部"新对话"按钮 → 调 `POST /api/chat/sessions`
- 底部 Memory / Feeds / System / VMs 入口

**SSE 流接入**
- 用现有 `lib/sse-client.ts`，扩展支持 `tool_call / tool_result / ui_action / done / error` 事件
- 收到 `ui_action` 时不渲染到消息流，而是丢给 `lib/ui-actions.ts` 分发器

### 3.3 沉浸式语音模式 `/voice` 与浮层 `<VoiceModeOverlay/>`

两种入口：
1. 机械臂语音唤醒后，前端收到 `ws event: presence.engaged + voice_mode_start` → 自动跳 `/voice`
2. 默认对话页麦克风按钮 → 弹出全屏 overlay（Esc 退出）

布局：纯黑/极深底（dark theme），中央**语音球**，上方一行用户字幕，下方一行 AI 字幕。

**语音球（Canvas + Web Audio API 实现）**

四个状态：
| State | 视觉 | 音效 |
|---|---|---|
| idle | 缓慢呼吸（scale 0.95↔1.05，4s 循环），柔和淡赭光晕 | 无 |
| listening | 球体边缘按 RMS 振幅做不规则膨胀，蓝色光环跟随 | 无（避免反馈） |
| thinking | 内部光带高速旋转 + 表面微粒子，整体偏冷紫 | 一次性轻 ping（200ms，-18dBFS） |
| speaking | 按 TTS 音频频谱做径向扩散，淡橙暖色 | TTS 音频本身 |

实现要点：
- 用 `AnalyserNode.getFloatFrequencyData` 取实时频谱，60fps requestAnimationFrame
- 状态切换走 framer-motion 的 transition 200ms，颜色用 `interpolate`
- 全屏点任何位置可暂停，长按返回对话页

**字幕**
- 用户实时 ASR：底色透明，文字逐字浮现，最终态淡入"已发送"chip
- AI 回复：流式 TTS 同时显示文字（和音频同步用 word-level timestamp）

**降级**
- 没有麦克风权限：弹 Dialog 引导授权
- ASR/TTS 服务不可达：底部 toast 警告，球体灰色 + 标记"离线"

### 3.4 Memory 可视化页 `/memory`

三个视图切换 Tabs：

**时间轴视图**
- 纵向时间轴（左侧时间标签，右侧记忆条目卡）
- 每张卡：类型 icon（事实 / 偏好 / 待办 / 关系 / 情绪）+ 摘要 + 来源会话链接 + 创建时间 + 命中次数徽章
- hover 出现：[编辑 / 禁用 / 删除]

**卡片网格视图**
- masonry 流式布局，按类型分色
- 顶部筛选：类型多选 + 关键词搜索（debounce 300ms）

**关系图视图**（M3 末尾，可砍）
- 用 `react-flow` 展示"用户 → 提到的人/物/地点"的图谱
- 点击节点高亮相关记忆

**操作**
- 编辑：行内 textarea，保存调 `PATCH /api/memory/entries/:id`
- 禁用：变灰但保留，再次点击恢复
- 删除：confirm dialog
- 顶部 stats bar：总数 / 本周新增 / 命中 top3 类型 / decay 中数量

**空态**：插画 + "你还没有和 Javis 聊过"+ 跳到 /chat 的按钮

### 3.5 Feeds 页 `/feeds`

不能空。三栏布局：
- 左：订阅源列表（添加 / 启停 / 删除）
- 中：文章流（卡片：封面图 / 标题 / 摘要 / 来源 / 时间 / 已读未读）
- 右：当前选中文章的预览（iframe 沙箱 / 渲染抓取的正文）
- 顶部：搜索 + 全部已读 + 添加源对话框

无订阅时：插画 + 引导添加 RSS

### 3.6 System 页 `/system`

仪表盘风格：
- 顶部 4 个数字卡：CPU / 内存 / 磁盘 / GPU 利用率（实时刷新，2s）
- 中部图表网格（用现成的 recharts 或 chart.js）：
  - CPU 时序折线（最近 5 分钟）
  - 内存堆叠区域图
  - 网络上下行
  - 进程 top10 表格（可排序）
- 底部"事件流"：滚动展示 NATS / WS 事件（拉取 `/api/events/recent`）
- 服务健康灯：api-gateway / agent / perception / db / redis 5 个圆点 + tooltip

### 3.7 VMs 页 `/vms`

- 卡片网格：每张卡 = 一个虚拟机（名称 / 状态色点 / IP / CPU 内存配额 / 用途标签）
- 卡片操作：启动 / 停止 / 重启 / 进入 SSH（弹 xterm 浮层）
- 顶部按钮：新建 VM（弹表单 Drawer）
- 空态：插画 + "尚无虚拟机"

### 3.8 Schedule 页 `/schedule`（M3）

日历视图（react-big-calendar 或自写）+ 事件列表，AI 可通过 ui_action 在这里塞日程卡。

---

## 4. AI 驱动 UI（核心架构）

### 4.1 组件注册表 `apps/web/src/lib/component-registry.ts`

```ts
type ComponentRegistry = Map<string, React.ComponentType<any>>;

export const registry: ComponentRegistry = new Map();

export function registerComponent(name: string, Component: React.ComponentType<any>) {
  registry.set(name, Component);
}

export function DynamicRender({ name, props }: { name: string; props: any }) {
  const Comp = registry.get(name);
  if (!Comp) return <UnknownCardFallback name={name} />;
  return <Comp {...props} />;
}
```

启动时在 `apps/web/src/registry/index.ts` 集中注册：
- `RssCard / FeedItemCard`
- `SystemMetricCard / ProcessTable`
- `VmCard / VmList`
- `MemoryEntryCard`
- `ScheduleEventCard`
- `WeatherCard`
- `ConfirmCard`
- `ImageCard / VideoCard`
- 后续 B 加 skill 时同步加 component

每个动态组件签名：`(props: TProps) => JSX.Element`，props 形状由 `packages/contracts/ui-actions.schema.json` 中 `render_card.payload` 定义。

### 4.2 ui_action 分发器 `apps/web/src/lib/ui-actions.ts`

```ts
export function dispatchUIAction(action: UIAction) {
  switch (action.type) {
    case 'navigate':       router.push(action.to); break;
    case 'highlight':      highlightSelector(action.selector); break;
    case 'render_card':    chatStore.appendCard(action.payload); break;
    case 'clear_session':  chatStore.clear(); break;
    case 'toast':          toast(action.message, action.level); break;
    case 'confirm':        openConfirmDialog(action); break;
    default:               console.warn('unknown ui_action', action);
  }
}
```

调用点：SSE 客户端收到 `event: ui_action` 时调用一次。

### 4.3 测试

在 `apps/web/src/lib/__tests__/ui-actions.test.tsx` 覆盖每种 action 的分发与组件渲染。

---

## 5. 动效规范（统一控制 framer-motion）

| 场景 | 配置 |
|---|---|
| 路由切换 | fade + 8px y 位移，250ms ease-out |
| 消息入场 | opacity 0→1 + y 8→0，250ms |
| token 流 | M4 抛光时上 chunk 级 motion.span（duration 180ms），M2 用 CSS stream-cursor 闪烁光标 |
| tool_call 折叠/展开 | layoutId + AnimatePresence，280ms |
| Dialog / Drawer | 背景 fade，主体 spring（damping 25, stiffness 200） |
| Toast | y -20→0 + opacity，250ms，停 3.5s 后退场 |
| 错误抖动 | x [-4,4,-2,2,0]，350ms |
| 语音球状态切换 | 200ms cross-fade + scale 0.96 中转 |

性能预算：60fps，主线程 long task <50ms，Chat 流式渲染时不能掉帧。

---

## 6. Phase 拆分（每 2 周一个里程碑）

### Phase M1（W1-W2）：基础设施
- [ ] tokens.css + dark mode + 主题切换 hook
- [ ] ui-kit 12 个基础组件 + Storybook
- [ ] AppShell / Sidebar / TopBar 重写
- [ ] 登录注册页改 Claude 风格
- [ ] component-registry + ui-actions 分发器骨架（先注册 3 个 demo 组件）
- [ ] mock SSE 跑通流式渲染

### Phase M1.5（W2 末，半天）：M1 收尾修复 ⚠️ 必做

> **背景**：M1 验收发现 ESLint 跑不动 + 后端 stack 因 Python 版本问题起不来，A 必须等 B 修完 Python/SQLAlchemy 问题（详见 B 任务书 §6 Phase M1.5）才能进入真实联调。M1.5 期间 A 仅做以下收尾：

- [ ] 补齐 `apps/web/package.json` 的 ESLint 依赖：`@eslint/js` `typescript-eslint`，让 `pnpm --filter web lint` 跑通
- [ ] 在 `apps/web/src/mocks/handlers.ts` 补全 M2 需要的 mock：`/api/chat/sessions` 列表/创建/重命名/删除、`/api/memory/entries` GET/PATCH/DELETE、`/api/events/recent`
- [ ] 验证 `pnpm --filter web dev` 能在 mock 模式下完整走通登录 → 进入 chat → mock SSE 流式渲染
- [ ] **联调验收**：B 修完后跑 `./start.sh`，从前端登录注册一个用户，确认请求实际打到 api-gateway 而非 MSW（DevTools Network 面板检查）

### Phase M2（W3-W4）：对话核心

> **前置依赖**：B 的 Phase M1.5 完成（start.sh 全栈跑通），否则 M2 退化成 mock 模式开发，最终联调成本会被堆到 M3。

- [ ] ChatPage 重构成新布局
- [ ] 消息气泡 + 工具栏 + Markdown 渲染
- [ ] 流式 token 动效 + tool_call 卡片
- [ ] Sidebar 历史会话分组与重命名（接 `/api/chat/sessions`，**真实数据**而非 mock）
- [ ] 输入区附件 / 命令面板
- [ ] feed System VMs 三页填充骨架（不要空）
- [ ] **新增**：在 CI（或本地 pre-push）跑一次 `./start.sh` 健康检查脚本，确保 5 个端口全起来再合并 PR

### Phase M2.5（W4 末，1 天）：M2 收尾自检

- [ ] 全部页面在真实后端下手动走一遍：登录 / 聊天 / Sidebar 切会话 / 三个仪表页
- [ ] DevTools 检查没有 4xx/5xx 静默失败、没有 console.error
- [ ] 录一段 90 秒视频上传到 `docs/中期规划/A开发日志/phase-m2-demo.mp4`

### Phase M3（W5-W6）：语音模式 + Memory 页
- [ ] VoiceModeOverlay + /voice 路由
- [ ] 语音球四态 + Web Audio 接入
- [ ] 字幕同步
- [ ] Memory 页时间轴 + 网格视图 + 编辑/禁用/删除
- [ ] 关系图视图（可砍）

### Phase M4（W7-W8）：抛光与无障碍
- [ ] 全站 a11y 走查（axe-playwright 0 violation）
- [ ] 键盘可达性（Tab 顺序、focus ring）
- [ ] 加载/空态/错误态插画补全
- [ ] Lighthouse > 90，FCP < 1.5s
- [ ] Chromatic 视觉回归基线

---

## 7. 验收清单

每个 PR 必须通过：
- `pnpm --filter web typecheck`
- `pnpm --filter web lint`
- `pnpm --filter web test`
- `pnpm --filter web e2e`（关键流程）
- Storybook build 无警告
- 手动验证：登录 → 发消息 → 收到流式回复 → 触发 ui_action 切页 → 进入语音模式 → 退出 → 看到 Memory 页有新条目

**新增（M1 验收复盘补充）：每个 Phase 结束必须做一次"全栈冒烟"**

- [ ] 从干净环境起：`rm -rf .venv apps/web/node_modules/.vite && ./start.sh`
- [ ] 5 个端口全部就绪：5173 / 8080 / 8001 / 8002 / 5432 / 6379
- [ ] 浏览器实际访问 http://localhost:5173 → 登录注册 → 进入对话页，请求打到真实 api-gateway
- [ ] **绝不允许只跑单元测试就声明 Phase 完成** —— M1 就是因此漏掉了 Python 3.14 / SQLAlchemy 兼容问题
- [ ] 冒烟失败时第一时间在 `docs/中期规划/A开发日志/known-issues.md` 登记并 @ B

---

## 8. 给执行 Agent 的具体子 Prompt 模板

每个 Phase 开始前，把下面这段喂给执行 Agent：

```
你正在执行 Studio Javis 前端 Phase M{X} 的任务。

参考文档：docs/中期规划/工程师A_前端体验层任务书.md §6 中的 Phase M{X} 清单。

约束：
1. 仅修改 apps/web/** 与 packages/ui-kit/** 范围内的文件
2. 不动 services/** 和 packages/contracts/**
3. 每完成一个 checklist 项就提一个 commit，message 走 conventional commits
4. 每天结束前跑一次 typecheck + lint + test，挂了就先修
5. 设计语言严格遵守 §2 的 tokens，不引入新颜色/字号

完成后输出：
- 改动的文件清单
- Storybook 中新增/修改的 story
- 屏幕录屏（命令行回报路径即可）
- 已知 issue 列表

开始前请先 git checkout -b a/phase-m{X}-<topic>，然后逐项推进。
```
