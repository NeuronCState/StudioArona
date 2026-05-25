# 工程师 C · W1 日志（M5.1 性能基建 + WebGL 替换）

> 本周目标：完成 §2 M5.1 性能基建 + WebGL 替换

## 每日进度

### Day 1（5月22日）

**完成项：**

1. **性能 Hooks 底座** ✅
   - `apps/web/src/hooks/useReducedMotion.ts` — 监听 `(prefers-reduced-motion: reduce)` 媒体查询
   - `apps/web/src/hooks/useVisibility.ts` — 监听 `document.visibilitychange`
   - `apps/web/src/hooks/useIdle.ts` — 30s 无 mousemove/keydown/scroll → idle=true
   - `apps/web/src/hooks/useThrottle.ts` — 标准 throttle hook

2. **Web Vitals 上报** ✅
   - `apps/web/src/lib/performance/vitals.ts` — CLS/FID/LCP/INP/FCP/TTFB，仅 PROD 模式上报
   - 通过 `navigator.sendBeacon` 发送到 `/api/internal/metrics`
   - 包含 rating 分级（good/needs-improvement/poor）

3. **Dev-only FPS HUD** ✅
   - `apps/web/src/dev/PerfHud.tsx` — 仅 `import.meta.env.DEV` 时挂载
   - 右下角显示 FPS/frame time，使用 stats.js

4. **Bundle Analyzer** ✅
   - `apps/web/vite.config.ts` 集成 `rollup-plugin-visualizer`
   - 输出 `dist/stats.html`（gzipSize + brotliSize）

5. **WebGL 替换 login 页背景** ✅
   - `apps/web/src/components/effects/LoginBackdrop.tsx` — 使用 twgl.js 单 fragment shader
   - `apps/web/src/components/effects/shaders/login-bg.vert` — 全屏三角形顶点着色器
   - `apps/web/src/components/effects/shaders/login-bg.frag` — 网格波纹 + 5 粒子辉光
   - 接 useReducedMotion（reduce 时静态渐变）
   - 接 useVisibility（tab 隐藏暂停 rAF）
   - mousemove 缓存 clientX/clientY，不再 getBoundingClientRect
   - `apps/web/src/pages/login/LoginPage.tsx` 已替换 BackgroundAnimation → LoginBackdrop

6. **Home 页 blur 层重写** ✅
   - `apps/web/src/components/effects/HomeAmbient.tsx` — compositor-only transform 动画
   - 使用纯 CSS 渐变占位（TODO: 需要 Figma 导出 WebP 纹理）
   - 接 useReducedMotion
   - `apps/web/src/pages/home/HomeCommandPage.tsx` 已替换 3 个 blur-3xl divs
   - `backdrop-blur-xl` 替换为 `bg-white/85`

7. **动效 Token 初始化** ✅
   - `apps/web/src/styles/tokens.css` 新增 `--ease-*`（5 条）、`--duration-*`（5 级）、`--motion-*`（4 种复合）
   - 添加 `prefers-reduced-motion: reduce` 媒体查询覆盖

8. **全局动画样式** ✅
   - `apps/web/src/styles/animations.css` — 全局 keyframes + transition utilities
   - `motion-lift` / `motion-shake` / `motion-stagger` 等 utility classes

9. **JS 动效 tokens** ✅
   - `apps/web/src/lib/motion/tokens.ts` — DURATION / EASING / bezierCSS / timing 工具函数

**已安装的 npm 包：**
- `web-vitals` — Web Vitals 指标采集
- `stats.js` — FPS 监控面板
- `twgl.js` — WebGL 辅助库
- `rollup-plugin-visualizer` — Bundle 分析

**已知 TODO / 阻塞：**

| 项目 | 描述 | 优先级 |
|------|------|--------|
| WebP 纹理 | `HomeAmbient` 当前用 CSS 渐变占位，需要 Figma 导出 256x256 WebP | P1 |
| `/api/internal/metrics` | Vitals 上报 endpoint 由 B 提供，当前未联通 | P1 |
| `make dev` 验证 | 未跑全栈启动验证（B 的服务未就绪） | P2 |
| CI 门槛 | `main chunk > 250KB gz 报警` 门槛未接 CI（M5.5） | P3 |

## 文件变更清单

```
新增:
  apps/web/src/hooks/useReducedMotion.ts
  apps/web/src/hooks/useVisibility.ts
  apps/web/src/hooks/useIdle.ts
  apps/web/src/hooks/useThrottle.ts
  apps/web/src/lib/performance/vitals.ts
  apps/web/src/dev/PerfHud.tsx
  apps/web/src/components/effects/LoginBackdrop.tsx
  apps/web/src/components/effects/shaders/login-bg.vert
  apps/web/src/components/effects/shaders/login-bg.frag
  apps/web/src/components/effects/HomeAmbient.tsx
  apps/web/src/lib/motion/tokens.ts
  apps/web/src/styles/animations.css
  docs/Phase5_三人冲刺计划/log_C_W1.md

修改:
  apps/web/src/styles/tokens.css          (新增 motion tokens + reduced-motion)
  apps/web/vite.config.ts                 (新增 visualizer 插件)
  apps/web/src/pages/login/LoginPage.tsx  (替换 BackgroundAnimation → LoginBackdrop)
  apps/web/src/pages/home/HomeCommandPage.tsx  (替换 blur divs → HomeAmbient)
  apps/web/package.json                   (新增 4 个 dependencies)
```

---

## W2 进度（5月22日 · M5.1 收尾）

### 1. hooks 桶导出 ✅
- `apps/web/src/hooks/index.ts` 统一导出 useReducedMotion / useVisibility / useIdle / useThrottle
- 三方组件可通过 `import { useVisibility, useIdle } from '@/hooks'` 统一导入

### 2. VoiceOrb 组件优化 ✅
- `apps/web/src/pages/studio/VoiceOrb.tsx`:
  - 接入 useVisibility — tab 隐藏时 cancelAnimationFrame，恢复时重新启动
  - 接入 useIdle — idle 时每 4 帧才 draw（~15fps）
  - accentRef 颜色值提取到 useMemo，particleColors 也预计算
  - 状态切换动画使用 lib/motion/tokens.ts 的 DURATION.extra(600ms) / DURATION.slow(400ms)
- 注: `apps/web/src/pages/voice/VoiceOrb.tsx` 是独立语音模式组件，不需要同样优化（不同用途）

### 3. Effects 组件完整性检查 ✅

| 检查项 | 组件 | 状态 |
|--------|------|------|
| WebGL context 释放 | LoginBackdrop.tsx | ✅ WEBGL_lose_context 在 cleanup 中调用 |
| Shader 语法 | login-bg.vert / login-bg.frag | ✅ GLSL 300 es, 语法正确 |
| Compositor-only 动画 | HomeAmbient.tsx | ✅ home-ambient-drift 仅用 translate3d + scale |
| useReducedMotion 接入 | LoginBackdrop / HomeAmbient | ✅ 两个组件均已接入 |
| useVisibility 接入 | LoginBackdrop | ✅ tab 隐藏时停止 rAF |

### 4. 图片懒加载组件 ✅
- 新建 `apps/web/src/components/effects/LazyImage.tsx`
- IntersectionObserver 触发加载，threshold 默认 0.2
- 进入视口前显示低质量占位 (blur+scale-110 LQIP)
- 加载完成后使用 motion tokens (DURATION.base + EASING.out) 淡入
- 错误态显示 fallback 文案

### 5. 构建配置验证 ✅
- `vite.config.ts` manualChunks: vendor(motion), markdown, xterm ✅
- `rollup-plugin-visualizer` 输出 dist/stats.html (gzipSize + brotliSize) ✅
- `PerfHud.tsx` 顶部 `if (!import.meta.env.DEV) return null` — Vite 在 prod build 中会 tree-shake 整棵组件树 ✅

### 6. M5.1 DoD 自检

| # | 检查项 | 结果 | 备注 |
|---|--------|------|------|
| 1 | login 页 idle CPU < 3% | ⬜ 待实际验证 | 需要运行 dev server 并在 Activity Monitor 中观察 |
| 2 | login 页 reduced-motion 下显示静态渐变 | ✅ 代码逻辑 | LoginBackdrop 在 reduced=true 时返回 radial-gradient div |
| 3 | login 页 tab 切后台 rAF 暂停 | ✅ 代码逻辑 | LoginBackdrop useEffect 依赖 visible，false 时不启动 rAF |
| 4 | home 页 blur 装饰层已替换为 transform-only 方案 | ✅ | HomeAmbient 使用 home-ambient-drift (translate3d + scale) |
| 5 | Web Vitals 上报代码就位 | ✅ 代码就位 | lib/performance/vitals.ts 就位，/api/internal/metrics endpoint 待 B 提供 |
| 6 | Bundle analyzer 集成 | ✅ | rollup-plugin-visualizer 已集成 |
| 7 | 性能 hooks 全部就位且通过 barrel export | ✅ | hooks/index.ts 就位 |

### W2 文件变更清单

```
新增:
  apps/web/src/components/effects/LazyImage.tsx
  apps/web/src/hooks/index.ts

修改:
  apps/web/src/pages/studio/VoiceOrb.tsx  (useVisibility + useIdle + useMemo + motion tokens)
  docs/Phase5_三人冲刺计划/log_C_W1.md   (本日 W2 进度追加)

---

## W3 进度（5月22日 · M5.2 Studio 主题动效系统化）

### 1. JS 动效 tokens 确认 ✅

`apps/web/src/lib/motion/tokens.ts` 已于 W1 完整实现，无需修改：
- `DURATION` — 5 级时长 (instant/fast/base/slow/extra)
- `EASING` — 5 条缓动曲线控制点
- `bezierCSS()` — 控制点数组 → CSS cubic-bezier 字符串
- `timing()` — 生成 WAAPI KeyframeAnimationOptions

### 2. RouteTransition 组件 ✅

- 新建 `apps/web/src/components/layout/RouteTransition.tsx`
- 采用轻量方案：`useLocation().pathname` 作为 `key`，通过 key 变化触发 React 重新挂载
- 新挂载的元素自动播放 `.route-stage` 的 enter 动画（`route-enter-anim`）
- 无需安装 `react-transition-group` 依赖
- A 接入方式：`<RouteTransition>{children}</RouteTransition>` 包裹 main 内容区

### 3. 全局动画 CSS 补充 ✅

`apps/web/src/styles/animations.css` 末尾追加：

| 新增项 | 说明 |
|--------|------|
| `@keyframes route-enter-anim` | key-based 路由进入动画（fade + translateY 8px） |
| `.route-stage` | 路由页面挂载动画 class |
| `.motion-press` | 按压态工具类（:active scale 0.98） |
| `@keyframes skeleton-pulse` | 骨架屏呼吸闪烁 |
| `@keyframes toast-slide-in` | Toast 从右侧滑入 |
| `@keyframes modal-scale-in` | 模态框 scale 0.96→1 弹出 |
| `@keyframes route-exit-anim` | 路由退出动画（备选） |
| `prefers-reduced-motion` 全局覆盖 | `*` 通配符强制 animation/transition duration 归零 |

### 4. FLIP 动画工具 ✅

- 新建 `apps/web/src/lib/motion/flip.ts`
- `flipMorph(from, to)` — 从 `from` 元素的 bounding rect FLIP 过渡到 `to` 元素
- 使用 WAAPI `Element.animate()`，duration 使用 `DURATION.base` (240ms)，easing 使用 `EASING.out`
- 返回 Animation 对象供调用方 `await .finished`
- `flipReplace(from, to)` — 便捷封装：执行 FLIP 后自动隐藏 `from`

### 5. tokens.css 确认无修改 ✅

已在 W1 完成 motion token 定义（--ease-* ×5, --duration-* ×5, --motion-* ×4），及 `prefers-reduced-motion` 覆盖。W3 无需变更。

### M5.2 DoD 自检

| # | 检查项 | 结果 | 备注 |
|---|--------|------|------|
| 1 | 路由切换视觉响应 < 100ms 起手，500ms 内结束 | ✅ | route-enter-anim 使用 --duration-slow(400ms)，key remount 触发即时 |
| 2 | 卡片 hover 一致，使用 transform 而非 box-shadow | ✅ | motion-lift 使用 translate3d + scale，均为 compositor-only |
| 3 | reduced-motion 下所有动画即时 | ✅ | 全局 `* { animation/transition-duration: 0s !important }` |
| 4 | sidebar 折叠平滑无闪 | ⬜ 待 W4 | 当前 AppShell 直接卸载/挂载，需改为 width 过渡或 SmoothMount |
| 5 | Storybook 有动效系统说明页 | ⬜ 待 W4 | 依赖 A 的 Storybook 配置就绪 |

### W3 文件变更清单

```
新增:
  apps/web/src/components/layout/RouteTransition.tsx
  apps/web/src/lib/motion/flip.ts

修改:
  apps/web/src/styles/animations.css           (追加 route-stage/press/skeleton/toast/modal/prefers-reduced-motion)
  docs/Phase5_三人冲刺计划/log_C_W1.md          (本日 W3 进度追加)
```

---

## W4 进度（5月22日 · M5.2 收尾：sidebar 动效 + 文档 + A 对接）

### 1. Sidebar 折叠平滑过渡 ✅

**问题**：原 `AppShell.tsx` 使用条件渲染 `{!sidebarCollapsed && <Sidebar />}`，导致 Sidebar 在展开/折叠时卸载/挂载，产生闪烁。

**修复方案**：Sidebar 始终 mount，通过 CSS `width` transition 实现平滑折叠。

**修改文件**：

| 文件 | 变更 |
|------|------|
| `Sidebar.tsx` | 新增 `collapsed` prop；aside 根元素根据 collapsed 切换 `w-0 overflow-hidden border-r-0` / `w-[240px]` |
| `AppShell.tsx` | 条件渲染改为 `<Sidebar collapsed={sidebarCollapsed} />`，始终挂载 |
| `animations.css` | 新增 `.sidebar-transition-width` 工具类，使用 `var(--duration-base)` (240ms) + `var(--ease-out)` |

**关键 CSS**：
```css
.sidebar-transition-width {
  transition: width var(--duration-base) var(--ease-out);
}
```

当 `collapsed=true` 时：`w-0 overflow-hidden border-r-0`（border 也同步消失避免残留线）。
当 `collapsed=false` 时：`w-[240px]`（正常宽度）。

### 2. 动效系统展示 Story ✅

`apps/web/src/lib/motion/MotionTokens.stories.tsx` — Storybook 交互式演示：

- **Easing Curves 面板**：5 条缓动曲线，点击触发小球平移动画，可直观对比 `out` / `outSoft` / `inOut` / `in` / `elastic`
- **Duration Scale 面板**：5 级时长，点击触发进度条填充，从 0ms 到 600ms
- **Utility Classes 面板**：`motion-lift` / `motion-press` / `route-stage` 点击演示
- **Story docs**：内嵌完整文档表格（缓动曲线用途、时长使用场景、工具类效果、reduced-motion 说明）

Story 注册为 `Design Tokens/Motion`，A 可直接在 Storybook 中查看。

### 3. A 对接点：Barrel Export ✅

`apps/web/src/lib/motion/index.ts` 统一导出 A 需要的所有内容：

```ts
export { flipMorph, flipReplace } from './flip';
export { DURATION, EASING, bezierCSS, timing } from './tokens';
```

A 导入方式：`import { flipMorph, flipReplace, DURATION, EASING, bezierCSS, timing } from '@/lib/motion';`

### 4. M5.2 DoD 自检（完整）

| # | 检查项 | 结果 | 备注 |
|---|--------|------|------|
| 1 | 路由切换视觉响应 < 100ms 起手，500ms 内结束 | ✅ | W3: route-enter-anim 400ms, key remount |
| 2 | 卡片 hover 一致，使用 transform 而非 box-shadow | ✅ | W3: motion-lift translate3d + scale |
| 3 | reduced-motion 下所有动画即时 | ✅ | W3: 全局 animation/transition-duration: 0s |
| 4 | sidebar 折叠平滑无闪 | ✅ | W4: CSS width transition, 始终 mount |
| 5 | Storybook 有动效系统说明页 | ✅ | W4: MotionTokens.stories.tsx |

### W4 文件变更清单

```
新增:
  apps/web/src/lib/motion/index.ts                    (barrel export)
  apps/web/src/lib/motion/MotionTokens.stories.tsx    (Storybook 动效演示)

修改:
  apps/web/src/components/layout/Sidebar.tsx           (collapsed prop + transition class)
  apps/web/src/components/layout/AppShell.tsx          (始终 mount Sidebar)
  apps/web/src/styles/animations.css                   (sidebar-transition-width)
  docs/Phase5_三人冲刺计划/log_C_W1.md                  (本日 W4 进度追加)
```
