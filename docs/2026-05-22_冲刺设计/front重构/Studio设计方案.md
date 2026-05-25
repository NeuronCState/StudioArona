# Studio 版本前端设计方案

> 参考 Claude/Anthropic 设计语言，打造专业、克制、优雅的工程师美学界面

## 设计哲学

**核心价值观**：
- **Clarity over decoration** — 清晰胜过装饰
- **Content-first** — 内容优先，界面退后
- **Warmth through restraint** — 克制中的温暖
- **Engineering elegance** — 工程师的优雅

**反对**：
- AI 默认美学（紫蓝渐变、过度圆角、卡片堆砌）
- 过度动画和视觉噪音
- 装饰性元素
- 通用模板感

---

## 设计系统

### 色彩 — Warm Neutral Palette

**主色调**：暖灰 + 琥珀强调

```css
/* 背景层次 */
--color-bg: #FAFAF9;           /* 石灰白 warm stone */
--color-surface: #FFFFFF;
--color-surface-elevated: #FFFFFF;
--color-surface-overlay: rgba(255, 255, 255, 0.95);

/* 文本层次 */
--color-text-primary: #1C1917;    /* 石墨黑 */
--color-text-secondary: #57534E;  /* 暖灰 */
--color-text-tertiary: #78716C;   /* 浅暖灰 */
--color-text-muted: #A8A29E;      /* 极浅灰 */

/* 强调色 — 琥珀/橙 */
--color-accent: #D97706;          /* 琥珀 600 */
--color-accent-hover: #B45309;    /* 琥珀 700 */
--color-accent-soft: #FEF3C7;     /* 琥珀 100 */
--color-accent-border: #FCD34D;   /* 琥珀 300 */

/* 边框 */
--color-border: #E7E5E4;          /* 石灰 200 */
--color-border-subtle: #F5F5F4;   /* 石灰 100 */

/* 语义色 */
--color-success: #059669;         /* 翠绿 600 */
--color-warning: #D97706;         /* 琥珀 600 */
--color-error: #DC2626;           /* 红 600 */
--color-info: #2563EB;            /* 蓝 600 */
```

**暗色模式**：

```css
--color-bg: #1C1917;
--color-surface: #292524;
--color-surface-elevated: #44403C;
--color-text-primary: #FAFAF9;
--color-text-secondary: #D6D3D1;
--color-text-tertiary: #A8A29E;
--color-accent: #F59E0B;          /* 琥珀 500 */
--color-border: #44403C;
```

### 排版 — Serif Headings + Sans Body

**字体栈**：

```css
/* 标题 — 衬线 */
--font-serif: 'Newsreader', 'Source Serif Pro', 'Georgia', serif;

/* 正文 — 无衬线 */
--font-sans: 'Inter Variable', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

/* 代码 */
--font-mono: 'Berkeley Mono', 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
```

**字阶系统**：

```css
/* 标题 */
--text-5xl: 3rem;      /* 48px - Page hero */
--text-4xl: 2.25rem;   /* 36px - Section title */
--text-3xl: 1.875rem;  /* 30px - Card title */
--text-2xl: 1.5rem;    /* 24px - Subsection */
--text-xl: 1.25rem;    /* 20px - Large body */

/* 正文 */
--text-base: 0.9375rem; /* 15px - Body */
--text-sm: 0.875rem;    /* 14px - Secondary */
--text-xs: 0.8125rem;   /* 13px - Caption */
--text-2xs: 0.75rem;    /* 12px - Label */

/* 行高 */
--leading-tight: 1.25;
--leading-snug: 1.375;
--leading-normal: 1.5;
--leading-relaxed: 1.625;
--leading-loose: 1.75;
```

### 间距 — 8pt Grid

```css
--space-1: 0.25rem;   /* 4px */
--space-2: 0.5rem;    /* 8px */
--space-3: 0.75rem;   /* 12px */
--space-4: 1rem;      /* 16px */
--space-5: 1.25rem;   /* 20px */
--space-6: 1.5rem;    /* 24px */
--space-8: 2rem;      /* 32px */
--space-10: 2.5rem;   /* 40px */
--space-12: 3rem;     /* 48px */
--space-16: 4rem;     /* 64px */
--space-20: 5rem;     /* 80px */
--space-24: 6rem;     /* 96px */
```

### 圆角 — Subtle Radii

```css
--radius-sm: 6px;
--radius-md: 8px;
--radius-lg: 12px;
--radius-xl: 16px;
--radius-2xl: 20px;
--radius-full: 9999px;
```

### 阴影 — Soft Elevation

```css
--shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.05);
--shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);
--shadow-md: 0 4px 6px rgba(0, 0, 0, 0.07), 0 2px 4px rgba(0, 0, 0, 0.05);
--shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.08), 0 4px 6px rgba(0, 0, 0, 0.05);
--shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.1), 0 10px 10px rgba(0, 0, 0, 0.04);
```

### 动效 — Natural Easing

```css
--ease-in: cubic-bezier(0.4, 0, 1, 1);
--ease-out: cubic-bezier(0, 0, 0.2, 1);
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

--duration-fast: 150ms;
--duration-base: 200ms;
--duration-slow: 300ms;
--duration-slower: 500ms;
```

---

## 信息架构

### 导航结构

```
Studio OS
├── Home (/)                    # 工作台首页
├── Chat (/chat)                # 对话
├── Memory (/memory)            # 记忆库
├── Schedule (/schedule)        # 日程
├── Feeds (/feeds)              # RSS 情报
├── System (/system)            # 系统状态
├── VMs (/vms)                  # 虚拟机
└── Voice (/voice)              # 语音模式
```

### 布局模式

**三栏布局**（参考 claude.ai）：

```
┌─────────────────────────────────────────────────────┐
│  [Sidebar]  │  [Main Content]  │  [Context Panel]  │
│   240px     │      flex-1      │      320px        │
└─────────────────────────────────────────────────────┘
```

- **Sidebar**：主导航 + 会话历史
- **Main Content**：当前页面内容
- **Context Panel**（可选）：上下文信息、快捷操作

---

## 页面设计

### 1. Home — 工作台首页

**布局**：

```
┌──────────────────────────────────────────────────────┐
│  Good morning, [User]                                │
│  [Status indicators]                                 │
│                                                      │
│  ┌─────────────────┐  ┌─────────────────┐          │
│  │ Quick Actions   │  │ Recent Activity │          │
│  │ • New Chat      │  │ • Session 1     │          │
│  │ • Voice Mode    │  │ • Session 2     │          │
│  │ • Memory        │  │ • Session 3     │          │
│  └─────────────────┘  └─────────────────┘          │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │ Today's Schedule                             │  │
│  │ • 10:00 Meeting                              │  │
│  │ • 14:00 Review                               │  │
│  └──────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

**特征**：
- 问候语 + 时间感知
- 快捷操作卡片（无边框，hover 显示边框）
- 最近活动时间线
- 今日日程预览

### 2. Chat — 对话页面

**布局**：

```
┌──────────────────────────────────────────────────────┐
│  [Session Title]                    [•••]            │
├──────────────────────────────────────────────────────┤
│                                                      │
│  User: How do I...                                   │
│                                                      │
│  Assistant: Here's how...                            │
│  [Code block]                                        │
│  [Tool result]                                       │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │ [Input area]                          [Send]   │ │
│  └────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

**特征**：
- 消息气泡：无背景色，仅左侧竖线区分
- 代码块：浅灰背景 + 圆角
- 工具调用：折叠卡片，可展开查看详情
- 输入框：底部固定，单行自动扩展至多行

### 3. Memory — 记忆库

**布局**：

```
┌──────────────────────────────────────────────────────┐
│  Memory                                              │
│  [Search] [Filter: All | Facts | Preferences]       │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │ • User prefers concise responses               │ │
│  │   Last used: 2 hours ago                       │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │ • Project uses React + TypeScript              │ │
│  │   Last used: 1 day ago                         │ │
│  └────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

**特征**：
- 列表视图，每条记忆一行
- Hover 显示操作按钮（编辑、删除、禁用）
- 搜索 + 类型筛选
- 使用频率和时间标记

### 4. Schedule — 日程

**布局**：

```
┌──────────────────────────────────────────────────────┐
│  Schedule                          [Today | Week]    │
│                                                      │
│  Today, May 22                                       │
│  ┌────────────────────────────────────────────────┐ │
│  │ 10:00 - 11:00  Team Sync                       │ │
│  │ 14:00 - 15:00  Code Review                     │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  Tomorrow, May 23                                    │
│  ┌────────────────────────────────────────────────┐ │
│  │ 09:00 - 10:00  Planning                        │ │
│  └────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

**特征**：
- 按日期分组
- 时间轴视图
- 事件卡片：标题 + 时间 + 地点（可选）

### 5. System — 系统状态

**布局**：

```
┌──────────────────────────────────────────────────────┐
│  System Status                                       │
│                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │ CPU         │  │ Memory      │  │ Disk        │ │
│  │ 24%         │  │ 8.2 / 16 GB │  │ 120 / 500GB │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
│                                                      │
│  Services                                            │
│  ┌────────────────────────────────────────────────┐ │
│  │ • API Gateway        ● Running                 │ │
│  │ • Agent Bridge       ● Running                 │ │
│  │ • Perception         ● Running                 │ │
│  └────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

**特征**：
- 指标卡片：数值 + 进度条
- 服务列表：状态点 + 名称
- 实时更新（WebSocket）

---

## 组件设计

### Button

```tsx
// Primary
<button className="btn-primary">
  Send
</button>

// Secondary
<button className="btn-secondary">
  Cancel
</button>

// Ghost
<button className="btn-ghost">
  <Icon />
</button>
```

**样式**：

```css
.btn-primary {
  background: var(--color-accent);
  color: white;
  padding: 0.5rem 1rem;
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 500;
  transition: background var(--duration-base) var(--ease-out);
}

.btn-primary:hover {
  background: var(--color-accent-hover);
}

.btn-secondary {
  background: var(--color-surface);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  padding: 0.5rem 1rem;
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 500;
  transition: border-color var(--duration-base) var(--ease-out);
}

.btn-secondary:hover {
  border-color: var(--color-accent);
}

.btn-ghost {
  background: transparent;
  color: var(--color-text-secondary);
  padding: 0.5rem;
  border-radius: var(--radius-md);
  transition: background var(--duration-base) var(--ease-out);
}

.btn-ghost:hover {
  background: var(--color-surface-elevated);
  color: var(--color-text-primary);
}
```

### Card

```tsx
<div className="card">
  <h3 className="card-title">Title</h3>
  <p className="card-body">Content</p>
</div>
```

**样式**：

```css
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  transition: 
    border-color var(--duration-base) var(--ease-out),
    box-shadow var(--duration-base) var(--ease-out);
}

.card:hover {
  border-color: var(--color-border);
  box-shadow: var(--shadow-sm);
}

.card-title {
  font-family: var(--font-serif);
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: var(--space-2);
}

.card-body {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  line-height: var(--leading-relaxed);
}
```

### Input

```tsx
<input 
  type="text" 
  className="input" 
  placeholder="Type something..."
/>
```

**样式**：

```css
.input {
  width: 100%;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 0.625rem 0.75rem;
  font-size: var(--text-sm);
  color: var(--color-text-primary);
  transition: border-color var(--duration-base) var(--ease-out);
}

.input::placeholder {
  color: var(--color-text-tertiary);
}

.input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-soft);
}
```

---

## 动画规范

### 页面过渡

**淡入 + 轻微上移**：

```css
@keyframes page-enter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.page {
  animation: page-enter var(--duration-slow) var(--ease-out);
}
```

### 卡片交互

**Hover 提升**：

```css
.card {
  transition: 
    transform var(--duration-base) var(--ease-out),
    box-shadow var(--duration-base) var(--ease-out);
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}
```

### 消息流入

**从左滑入**：

```css
@keyframes message-enter {
  from {
    opacity: 0;
    transform: translateX(-16px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.message {
  animation: message-enter var(--duration-base) var(--ease-out);
}
```

### 加载状态

**脉冲动画**：

```css
@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.skeleton {
  background: var(--color-border-subtle);
  border-radius: var(--radius-md);
  animation: pulse 2s var(--ease-in-out) infinite;
}
```

---

## 实施阶段

### Phase 1: 设计系统基础（1-2 天）

- [ ] 创建 `tokens-studio.css`（色彩、排版、间距、圆角、阴影、动效）
- [ ] 创建 `globals-studio.css`（全局样式、组件类）
- [ ] 更新 `tailwind.config.js`（扩展 Studio 主题）
- [ ] 创建 Storybook stories（Button、Card、Input、Badge）

### Phase 2: 布局重构（2-3 天）

- [ ] 重构 `AppShell`（三栏布局）
- [ ] 重构 `Sidebar`（导航 + 会话历史）
- [ ] 重构 `TopBar`（简化为状态栏）
- [ ] 创建 `ContextPanel`（可选右侧面板）

### Phase 3: 页面重构（3-4 天）

- [ ] `HomePage`（工作台首页）
- [ ] `ChatPage`（对话页面）
- [ ] `MemoryPage`（记忆库）
- [ ] `SchedulePage`（日程）
- [ ] `FeedsPage`（RSS 情报）
- [ ] `SystemPage`（系统状态）
- [ ] `VmsPage`（虚拟机）
- [ ] `VoicePage`（语音模式）

### Phase 4: 动画与交互（1-2 天）

- [ ] 页面过渡动画
- [ ] 卡片交互动画
- [ ] 消息流入动画
- [ ] 加载状态动画
- [ ] Hover/Focus 状态

### Phase 5: 响应式与无障碍（1-2 天）

- [ ] 移动端适配（320px、768px、1024px、1440px）
- [ ] 键盘导航
- [ ] ARIA 标签
- [ ] 屏幕阅读器测试
- [ ] 色彩对比度检查

### Phase 6: 验收与优化（1 天）

- [ ] 设计走查
- [ ] 性能优化
- [ ] 浏览器兼容性测试
- [ ] 文档更新

---

## 验收标准

### 视觉质量

- [ ] 色彩使用符合 Studio 设计系统
- [ ] 排版层级清晰，衬线标题 + 无衬线正文
- [ ] 间距符合 8pt 网格
- [ ] 圆角使用克制（6-16px）
- [ ] 阴影微妙，不过度
- [ ] 无 AI 默认美学痕迹（紫蓝渐变、过度圆角、卡片堆砌）

### 交互质量

- [ ] 动画自然，缓动曲线符合规范
- [ ] Hover/Focus 状态清晰
- [ ] 加载状态友好
- [ ] 错误状态明确
- [ ] 空状态有引导

### 功能完整性

- [ ] 所有页面功能正常
- [ ] 导航流畅
- [ ] 表单验证正确
- [ ] 实时更新正常（WebSocket）
- [ ] 响应式布局正常

### 无障碍性

- [ ] 键盘导航完整
- [ ] ARIA 标签正确
- [ ] 色彩对比度 ≥ 4.5:1
- [ ] 屏幕阅读器友好
- [ ] 焦点管理正确

### 性能

- [ ] 首屏加载 < 2s
- [ ] 页面过渡流畅（60fps）
- [ ] 无不必要的重渲染
- [ ] 图片懒加载
- [ ] 代码分割合理

---

## 参考资源

- [Claude Design by Anthropic Labs](https://www.anthropic.com/news/claude-design-anthropic-labs)
- [Prompting for frontend aesthetics](https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics)
- [Hallmark Design Skill: Anti-AI-Slop UI](https://mer.vin/2026/05/hallmark-design-skill-anti-ai-slop-ui-for-claude-code-and-cursor/)
- [How to Avoid AI Slop When Using Claude Design](https://www.mindstudio.ai/blog/claude-design-avoid-ai-slop-design-system)

---

## 下一步

1. 创建 `tokens-studio.css` 和 `globals-studio.css`
2. 更新 `design-mode.ts`，添加 `studio` 模式
3. 重构 `AppShell`，根据 `designMode` 切换样式
4. 逐页重构，从 `HomePage` 开始

**预计总工期**：10-14 天
