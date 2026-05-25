# Studio v2 设计稿

## 设计参考

Claude/Anthropic Design + ChatGPT 布局 + 磁贴仪表盘

---

## 整体布局

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│   ┌──────────┐                                          │
│   │          │         Main Content Area                │
│   │          │                                          │
│   │ Sidebar  │    ┌───────────────────────────────┐    │
│   │          │    │                               │    │
│   │  (Nav)   │    │    Page Content               │    │
│   │          │    │                               │    │
│   │          │    │                               │    │
│   │          │    │                               │    │
│   │          │    │                               │    │
│   │          │    └───────────────────────────────┘    │
│   │ ┌──────┐ │                                          │
│   │ │ Home │ │                                          │
│   │ │ Chat │ │                                          │
│   │ │ RSS  │ │                                          │
│   │ │Sched │ │                                          │
│   │ │  VM  │ │                                          │
│   │ │Memory│ │                                          │
│   │ └──────┘ │                                          │
│   └──────────┘                                          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## 左侧导航栏

### 结构

```
┌────────────────┐
│                │
│                │
│     [Logo]     │  ← 顶部 Logo / 品牌
│                │
│                │
│                │
│                │
│                │  ← 空白区域（呼吸感）
│                │
│                │
│                │
│                │
│                │
│  ┌──────────┐  │
│  │ 🏠 Home  │  │  ← 导航按钮靠下排列
│  │ 💬 Chat  │  │     圆角卡片风格
│  │ 📡 RSS   │  │     当前页高亮
│  │ 📅 Sched │  │
│  │ 🖥️  VM   │  │
│  │ 🧠 Memory│  │
│  └──────────┘  │
│                │
│  [User Avatar] │  ← 底部用户区
│                │
└────────────────┘
```

### 规格

| 属性 | 值 |
|------|-----|
| 宽度 | 260px |
| 背景 | `#FAFAF9` 石灰白 |
| 边框 | 右侧 1px `#E7E5E4` |
| 圆角 | 右侧外圆角 16px（侧边栏整体右上/右下圆角） |
| 导航按钮圆角 | 12px |
| 按钮对齐 | flex-end，距底部 24px |
| 按钮间距 | 4px |
| 活跃态 | 琥珀色浅底 `#FEF3C7` + 琥珀色文字 `#D97706` |
| 默认态 | 透明底 + 暖灰文字 `#57534E` |
| Hover | 浅灰底 `#F5F5F4` |

### 导航项（从上到下）

```
🏠 Home      → /
💬 Chat      → /chat
📡 RSS       → /feeds
📅 Schedule  → /schedule
🖥️  VMs      → /vms
🧠 Memory    → /memory
```

### 导航按钮样式

```
┌──────────────────────┐
│  Icon  Label         │  ← 默认态：透明，灰色文字
└──────────────────────┘

┌──────────────────────┐
│  Icon  Label         │  ← Hover：浅灰底 #F5F5F4
└──────────────────────┘

┌──────────────────────┐
│▐ Icon  Label         │  ← 活跃态：左侧 3px 琥珀色竖线
│▐                     │    琥珀色浅底 #FEF3C7
└──────────────────────┘
```

---

## 首页仪表盘（Home Dashboard）

### 布局

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  Good morning, [User]                                    │
│  Tuesday, May 22, 2026                                   │
│                                                          │
│  ┌─────────────────────────┐  ┌───────────────────────┐ │
│  │                         │  │                       │ │
│  │   📅 Today's Schedule   │  │   🌤️  Weather         │ │
│  │                         │  │                       │ │
│  │   • 10:00 Team Sync     │  │   北京  22°C 晴       │ │
│  │   • 14:00 Code Review   │  │   湿度 45% 风力 2级   │ │
│  │   • 16:00 Planning      │  │                       │ │
│  │                         │  │                       │ │
│  └─────────────────────────┘  └───────────────────────┘ │
│                                                          │
│  ┌─────────────────────────┐  ┌───────────────────────┐ │
│  │                         │  │                       │ │
│  │   🖥️  System Status     │  │   📡 RSS Feed         │ │
│  │                         │  │                       │ │
│  │   CPU    ████░░  42%    │  │   • Article 1         │ │
│  │   Memory ███░░░  38%    │  │   • Article 2         │ │
│  │   Disk   ██░░░░  28%    │  │   • Article 3         │ │
│  │                         │  │                       │ │
│  └─────────────────────────┘  └───────────────────────┘ │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │                                                   │  │
│  │   💬 Quick Chat                                   │  │
│  │                                                   │  │
│  │   [Type a message...]                    [Send]   │  │
│  │                                                   │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 磁贴规格

| 磁贴 | 尺寸 | 内容 |
|------|------|------|
| Schedule | 1/2 宽 × 固定高 | 今日日程列表（3-4条） |
| Weather | 1/2 宽 × 固定高 | 城市、温度、天气图标、湿度、风力 |
| System | 1/2 宽 × 固定高 | CPU/Memory/Disk 进度条 |
| RSS | 1/2 宽 × 固定高 | 最近 3-4 篇文章标题 |
| Quick Chat | 全宽 × 自适应 | 输入框 + 发送按钮 |

### 磁贴样式

```css
.tile {
  background: #FFFFFF;
  border: 1px solid #F5F5F4;
  border-radius: 16px;
  padding: 24px;
  transition: border-color 200ms ease, box-shadow 200ms ease;
}

.tile:hover {
  border-color: #E7E5E4;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.tile-title {
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 600;
  color: #1C1917;
  margin-bottom: 16px;
}
```

---

## 页面过渡动画

### 规范

| 属性 | 值 |
|------|-----|
| 动画类型 | 淡入 + 轻微上移 |
| 持续时间 | 200ms |
| 缓动曲线 | `cubic-bezier(0, 0, 0.2, 1)` (ease-out) |
| 位移 | translateY(8px) → translateY(0) |
| 透明度 | 0 → 1 |

### CSS

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
  animation: page-enter var(--duration-base) var(--ease-out);
}
```

### 页面切换行为

- 使用 React Router，不卸载 AppShell
- 仅内容区域切换
- 无全屏遮罩过渡
- 200ms 淡入上移过渡
- 上一个页面立即消失，新页面动画进入
- 侧边栏保持不变（无动画）

---

## 设计 Token

### 色彩

```css
--color-bg: #FAFAF9;
--color-surface: #FFFFFF;
--color-surface-hover: #F5F5F4;
--color-text-primary: #1C1917;
--color-text-secondary: #57534E;
--color-text-tertiary: #78716C;
--color-text-muted: #A8A29E;
--color-accent: #D97706;
--color-accent-soft: #FEF3C7;
--color-border: #E7E5E4;
--color-border-subtle: #F5F5F4;
--color-success: #059669;
--color-warning: #D97706;
--color-error: #DC2626;
--color-info: #2563EB;
```

### 排版

```css
--font-serif: 'Newsreader', Georgia, serif;
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;
```

### 圆角

```css
--radius-sm: 6px;
--radius-md: 8px;
--radius-lg: 12px;
--radius-xl: 16px;
--radius-2xl: 20px;
```

### 阴影

```css
--shadow-xs: 0 1px 2px rgba(0,0,0,0.04);
--shadow-sm: 0 1px 3px rgba(0,0,0,0.06);
--shadow-md: 0 4px 6px rgba(0,0,0,0.06);
```

### 动效

```css
--ease-out: cubic-bezier(0, 0, 0.2, 1);
--duration-fast: 150ms;
--duration-base: 200ms;
--duration-slow: 300ms;
```

---

## 组件层级

```
AppShell
├── Sidebar (260px, 固定)
│   ├── Logo
│   ├── NavGroup (靠下对齐)
│   │   ├── NavItem (Home)
│   │   ├── NavItem (Chat)
│   │   ├── NavItem (RSS)
│   │   ├── NavItem (Schedule)
│   │   ├── NavItem (VMs)
│   │   └── NavItem (Memory)
│   └── UserArea
│
└── Main (flex-1)
    └── <PageContent /> (动画切换)
        ├── HomePage (磁贴仪表盘)
        │   ├── GreetingHeader
        │   ├── TileGrid
        │   │   ├── ScheduleTile
        │   │   ├── WeatherTile
        │   │   ├── SystemTile
        │   │   └── RSSTile
        │   └── QuickChatBar
        ├── ChatPage
        ├── FeedsPage
        ├── SchedulePage
        ├── VmsPage
        └── MemoryPage
```

---

## 页面清单

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | HomePage | 磁贴仪表盘 |
| `/chat` | ChatPage | 对话页面 |
| `/feeds` | FeedsPage | RSS 订阅管理 |
| `/schedule` | SchedulePage | 日程管理 |
| `/vms` | VmsPage | 虚拟机管理 |
| `/memory` | MemoryPage | 记忆库管理 |

---

## 下一步

1. 创建 `StudioSidebar` 组件
2. 创建 `StudioAppShell` 组件
3. 创建 `StudioHomePage` 组件（磁贴仪表盘）
4. 创建磁贴组件 (`ScheduleTile`, `WeatherTile`, `SystemTile`, `RSSTile`)
5. 创建页面过渡动画
6. 创建其余功能页面
7. 设计 Token CSS 文件
8. 全局 Studio 样式文件

---

## 验收标准

- [ ] 侧边栏：圆角、按钮靠下、活跃态左侧竖线
- [ ] 首页：4 个磁贴 + 底部快捷对话
- [ ] 页面切换：200ms 淡入上移
- [ ] 无 AI 默认美学（紫蓝渐变、过度圆角、emoj 图标）
- [ ] 排版：衬线标题 + 无衬线正文
- [ ] 色彩：暖中性色 + 琥珀强调
- [ ] 响应式：768px+ 显示侧边栏，移动端底部导航
