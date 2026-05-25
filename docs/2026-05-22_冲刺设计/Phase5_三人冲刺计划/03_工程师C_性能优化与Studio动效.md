# 工程师 C · 性能优化与 Studio 主题动效任务书

> **角色定位**：把前端从"漂亮但耗电卡顿、动画零散"推到"丝滑 60fps + 动效成体系 + 多用户跑得动"。
> **协作方**：A（数据 + Arona）、B（后端 + OpenClaw）通过 `packages/contracts/` 与文件分区解耦。
> **工期**：8 周（W1-W8）。
> **必读前置**：`00_总纲_数据真实化与形象升级.md` + 项目根 `CLAUDE.md` + Phase 4 性能调研结论（见 `apps/web/src/pages/login/LoginPage.tsx` `apps/web/src/pages/home/HomeCommandPage.tsx` 当前实现的痛点）。

---

## 0. 角色 Prompt（直接喂给执行 Agent）

```
你是 Studio Javis 项目的性能与体验工程师（代号 C），目标是把前端从"漂亮但耗电卡顿、动画零散"推到"丝滑 60fps + 动效成体系 + 多用户跑得动"。本阶段你的工作覆盖四块：

1. WebGL 替换装饰层：用单个 fragment shader 重写 login 页那个 O(n²) 粒子 + 全屏网格 sin 波；home 页三个 blur 层换成预渲染 WebP；总耗电下降到 idle CPU < 3%。
2. Studio 主题动效系统化：建立动效 token、缓动曲线、时长规范，统一所有路由切换、卡片 hover、状态过渡的视觉语言；解决现有"动画零散、各做各的"的问题。
3. 性能基线与监控：建立 Web Vitals 监测、bundle analyzer 报告、自动性能回归门槛、prefers-reduced-motion 全局尊重、tab visibility / idle / 后台自动降帧。
4. 多用户性能：code splitting、SharedWorker WebSocket（多 tab 共用一条连接）、乐观更新、缓存策略、列表虚拟化、Service Worker。

【关键约束】
- ❌ 不动 services/、infra/（B 的领地）
- ❌ 不动 Arona shell（apps/web/src/components/arona/**，A 的领地）—— 但你要为它提供性能 hooks（useReducedMotion / useVisibility / useIdle）和懒加载边界
- ❌ 不动数据契约 packages/contracts/（B 主笔）
- ❌ 不动 apps/web/src/pages/** 的业务逻辑（A 的领地）—— 但你可以重写 login 页 / home 页的纯装饰背景（这些不是数据问题，是性能问题）
- ✅ 主战场：apps/web/src/{components/effects,lib/motion,hooks}, apps/web/vite.config.ts, apps/web/src/styles/animations.css
- ✅ 共享 token：apps/web/src/styles/tokens.css 的 --ease-* / --duration-* / --motion-* 由你主笔（颜色 token A 主笔）

【与 A 的边界（apps/web/ 内部分工）】
A 的关注点："拿到正确的数据并以正确的状态显示" —— 数据层 + Arona 形象壳
你的关注点："让所有动效 60fps 且体系化" —— 装饰层 + 性能基建 + Studio 主题动效

具体到文件：
- A 改 LoginPage.tsx 的表单 / 错误展示 / 路由跳转；C 重写 LoginPage.tsx 的 BackgroundAnimation 组件（剥离成 effects/LoginBackdrop.tsx）
- A 改 HomeCommandPage.tsx 的卡片数据；C 重写它的 blur 装饰层（剥离成 effects/HomeAmbient.tsx）
- A 写 TopBar.tsx 的切换器结构；C 写切换动画与 spring 过渡
- A 用 motion 库 hooks 但不实现它们

【性能预算】
- Studio 模式首屏 < 200KB gz、TTI < 1.5s、LCP < 2s
- Arona 模式（懒加载触发后）切换动画 < 600ms、3D 资产加载 < 5s
- 任何页面 idle 30s → 自动降到 15fps；tab 隐藏 → 暂停所有 rAF
- prefers-reduced-motion: reduce 时所有动画降级为 instant
- Lighthouse Performance ≥ 90（Studio 主题首屏）
- 100 条对话气泡列表滚动 60fps

【自测命令】
pnpm --filter web typecheck && lint && test && e2e
pnpm --filter web build && pnpm --filter web exec lighthouse http://localhost:5173
```

---

## 1. 范围边界

| 类型 | 路径 | 权限 |
|---|---|---|
| 全权 owner（新建） | `apps/web/src/components/effects/**` | WebGL 装饰层、动画粒子、过渡叠层 |
| 全权 owner（新建） | `apps/web/src/lib/motion/**` | 缓动函数、动效 token JS 端、spring、tween |
| 全权 owner（新建） | `apps/web/src/hooks/{useReducedMotion,useVisibility,useIdle,useThrottle,useVirtualList}.ts` | 性能 hooks |
| 全权 owner（新建） | `apps/web/src/styles/animations.css` | 全局 keyframes + transition utilities |
| 全权 owner（新建） | `apps/web/src/sw.ts` `apps/web/src/workers/ws-shared-worker.ts` | Service Worker + SharedWorker |
| 全权 owner | `apps/web/vite.config.ts` `apps/web/src/main.tsx`（仅性能相关初始化） | 构建配置 |
| 主笔 | `apps/web/src/styles/tokens.css` 的 `--ease-* / --duration-* / --motion-*` 部分 | A 评审 |
| 共享（结构 A 写、动效 C 写） | `apps/web/src/components/layout/{TopBar,AppShell,Sidebar}.tsx` | 改 className / data-state，不改业务结构 |
| 重写装饰背景 | `apps/web/src/pages/login/LoginPage.tsx`（仅 BackgroundAnimation 部分剥离）<br>`apps/web/src/pages/home/HomeCommandPage.tsx`（仅 blur 装饰层剥离） | 剥离为独立 effects 组件 |
| 只读 / 禁止 | `services/**` `infra/**` `packages/contracts/**` `apps/web/src/components/arona/**` `apps/web/src/pages/**`（除上面两个的装饰层） | 完全不动 |

---

## 2. M5.1 性能基建 + WebGL 替换（W1-W2）

### 2.1 性能监控基础设施

#### 2.1.1 Web Vitals 上报

新建 `apps/web/src/lib/performance/vitals.ts`：

```ts
import { onCLS, onFID, onLCP, onINP, onFCP, onTTFB } from 'web-vitals';

export function initVitals() {
  if (!import.meta.env.PROD) return;
  const send = (m: { name: string; value: number; id: string }) => {
    navigator.sendBeacon('/api/internal/metrics', JSON.stringify({
      kind: 'web-vital',
      ...m,
      ts: Date.now(),
      url: location.pathname,
    }));
  };
  onCLS(send); onFID(send); onLCP(send);
  onINP(send); onFCP(send); onTTFB(send);
}
```

`/api/internal/metrics` 端点由 B 提供（`02_工程师B*.md` §8）。

#### 2.1.2 Dev-only FPS HUD

`apps/web/src/dev/PerfHud.tsx` —— 仅 `import.meta.env.DEV` 时挂载，右下角浮窗显示 FPS / heap / draw calls。用 `stats.js` 即可。

#### 2.1.3 Bundle Analyzer 集成 CI

`apps/web/vite.config.ts` 加 `rollup-plugin-visualizer`：

```ts
import { visualizer } from 'rollup-plugin-visualizer';
plugins: [
  // ...
  visualizer({ filename: 'dist/stats.html', gzipSize: true, brotliSize: true }),
]
```

CI 加门槛：main chunk > 250KB gz 报警，>400KB 报错。

### 2.2 性能 Hooks 底座

新建 `apps/web/src/hooks/useReducedMotion.ts`：
```ts
export function useReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}
```

新建 `apps/web/src/hooks/useVisibility.ts`：
```ts
export function useVisibility() {
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return visible;
}
```

新建 `apps/web/src/hooks/useIdle.ts`：30s 无 mousemove / keydown / scroll → idle。
新建 `apps/web/src/hooks/useThrottle.ts`：标准 throttle。

A、Arona 模块、所有 effects 都从这里取，**不允许各自重复实现**。

### 2.3 WebGL 替换 login 页背景

#### 现状回顾（Phase 4 调研）
`apps/web/src/pages/login/LoginPage.tsx:46-213` 的 `BackgroundAnimation`：
- 45 个粒子 O(n²) 距离检测，每帧 ~990 次 sqrt
- 全屏网格每条线每 10px 一次 `Math.sin`，1080p 屏 ~8500 次 `lineTo`/帧
- mousemove 不节流 + `getBoundingClientRect()` 每次 reflow
- 没有 visibility / reduced-motion 保护

**目标**：单 fragment shader 完成同样视觉，CPU 几乎零占用，GPU 在集显也跑得稳。

#### 2.3.1 新建 `apps/web/src/components/effects/LoginBackdrop.tsx`

技术选型：**twgl.js**（~10KB gz，比 raw WebGL 简单，比 Three.js 轻 50 倍），不引 Three.js（那是 Arona 的领地）。

```tsx
import * as twgl from 'twgl.js';
import { useEffect, useRef } from 'react';
import { useReducedMotion, useVisibility } from '@/hooks';
import vertexShader from './shaders/login-bg.vert?raw';
import fragmentShader from './shaders/login-bg.frag?raw';

export function LoginBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const visible = useVisibility();

  useEffect(() => {
    const canvas = canvasRef.current!;
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) {
      // WebGL 不可用 → 静态渐变兜底
      canvas.style.background = 'radial-gradient(...)';
      return;
    }
    const programInfo = twgl.createProgramInfo(gl, [vertexShader, fragmentShader]);
    const arrays = { position: [-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1] };
    const bufferInfo = twgl.createBufferInfoFromArrays(gl, arrays);

    const mouse = { x: 0.5, y: 0.5 };
    let rafId = 0;
    let stopped = false;

    const onMouseMove = (e: MouseEvent) => {
      // 不再每次 getBoundingClientRect，缓存即可
      mouse.x = e.clientX / window.innerWidth;
      mouse.y = e.clientY / window.innerHeight;
    };
    window.addEventListener('mousemove', onMouseMove, { passive: true });

    const render = (time: number) => {
      if (stopped) return;
      twgl.resizeCanvasToDisplaySize(canvas);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(programInfo.program);
      twgl.setBuffersAndAttributes(gl, programInfo, bufferInfo);
      twgl.setUniforms(programInfo, {
        u_resolution: [canvas.width, canvas.height],
        u_time: time * 0.001,
        u_mouse: [mouse.x, mouse.y],
      });
      twgl.drawBufferInfo(gl, bufferInfo);
      rafId = requestAnimationFrame(render);
    };

    if (!reduced && visible) rafId = requestAnimationFrame(render);

    return () => {
      stopped = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', onMouseMove);
      const ext = gl.getExtension('WEBGL_lose_context');
      ext?.loseContext();
    };
  }, [reduced, visible]);

  if (reduced) return <div className="login-bg-static" />;
  return <canvas ref={canvasRef} className="absolute inset-0 -z-10" />;
}
```

#### 2.3.2 Shaders

`apps/web/src/components/effects/shaders/login-bg.frag`：
```glsl
#version 300 es
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;
out vec4 fragColor;

// 网格波纹 + 粒子辉光合成
float grid(vec2 uv, float size) {
  vec2 g = abs(fract(uv * size) - 0.5);
  float line = min(g.x, g.y);
  float wave = sin(uv.y * 8.0 + u_time) * 0.05;
  return smoothstep(0.0, 0.02, 0.05 - line + wave);
}

float particle(vec2 uv, vec2 c, float r) {
  float d = length(uv - c);
  return smoothstep(r, 0.0, d);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  uv.x *= u_resolution.x / u_resolution.y;

  // 鼠标排斥扭曲
  vec2 mouseUV = u_mouse;
  mouseUV.x *= u_resolution.x / u_resolution.y;
  vec2 dir = uv - mouseUV;
  float dist = length(dir);
  uv += normalize(dir) * 0.02 * exp(-dist * 8.0);

  // 网格层
  float g = grid(uv, 24.0) * 0.15;

  // 5 个伪随机粒子
  float p = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 c = vec2(
      0.5 + sin(u_time * 0.3 + fi * 1.7) * 0.4,
      0.5 + cos(u_time * 0.4 + fi * 2.3) * 0.4
    );
    c.x *= u_resolution.x / u_resolution.y;
    p += particle(uv, c, 0.02);
  }

  vec3 col = mix(
    vec3(0.97, 0.95, 0.92),                   // 暖灰底（与 token 一致）
    vec3(0.72, 0.33, 0.17),                   // 赭石点缀
    g + p * 0.6
  );
  fragColor = vec4(col, 1.0);
}
```

**Vite 配置 `?raw` import**：默认就支持，无需额外插件。如需更好 GLSL 支持可加 `vite-plugin-glsl`（可选）。

#### 2.3.3 接入

`apps/web/src/pages/login/LoginPage.tsx` 中，A 把表单部分留下，C 把现有 `BackgroundAnimation` 删掉换成：
```tsx
import { LoginBackdrop } from '@/components/effects/LoginBackdrop';
// ...
<LoginBackdrop />
{/* 表单不动，由 A 维护 */}
```

### 2.4 home 页 blur 层重写

#### 2.4.1 现状
`apps/web/src/pages/home/HomeCommandPage.tsx:89-93` 三个 `blur-3xl` 圆 + 一个 `backdrop-blur-xl` 矩形，每次 hover 都触发整层 GPU 重合成。

#### 2.4.2 方案：预渲染 WebP

新建 `apps/web/public/assets/textures/home-ambient-{day,night}.webp` —— 在 Figma 或本地用脚本一次性生成 256x256 WebP（灰度高斯模糊渐变）。

新建 `apps/web/src/components/effects/HomeAmbient.tsx`：
```tsx
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useThemeStore } from '@/hooks/useTheme';

export function HomeAmbient() {
  const reduced = useReducedMotion();
  const dark = useThemeStore((s) => s.resolved === 'dark');
  const url = `/assets/textures/home-ambient-${dark ? 'night' : 'day'}.webp`;

  return (
    <div
      className="pointer-events-none absolute inset-0 -z-10 will-change-transform"
      style={{
        backgroundImage: `url(${url})`,
        backgroundSize: 'cover',
        animation: reduced ? 'none' : 'home-ambient-drift 30s ease-in-out infinite alternate',
      }}
    />
  );
}
```

`animations.css`：
```css
@keyframes home-ambient-drift {
  from { transform: translate3d(0, 0, 0) scale(1); }
  to   { transform: translate3d(-2%, -1%, 0) scale(1.04); }
}
```

`transform`-only 动画，浏览器走合成器，0% 主线程开销。

去掉原来 `HomeCommandPage.tsx:104` 那个 `backdrop-blur-xl` —— 改成 `bg-white/85`，视觉差异肉眼几乎察觉不到，但卡顿消失。

### 2.5 Studio 主题 voice orb 优化

`apps/web/src/pages/studio/VoiceOrb.tsx`（已审过 Phase 4）持续 60fps rAF，本阶段：
- 接 `useVisibility` —— tab 隐藏暂停
- 接 `useIdle` —— idle 时降到 15fps（每 4 帧才 redraw）
- `accentRef.current = readAccent(...)` 提到 useMemo，避免每帧 getComputedStyle
- 状态切换的 enter/exit 动画从手算贝塞尔改成 `lib/motion/spring.ts` 提供的统一 spring

### 2.6 验收（M5.1 DoD）
- [ ] login 页打开 5 分钟 Activity Monitor 该 tab CPU < 3%（截图证明）
- [ ] login 页 reduced-motion 设置下显示静态渐变
- [ ] login 页 tab 切到后台 → DevTools Performance 显示 rAF 暂停
- [ ] home 页 hover / scroll 不再掉帧（Performance 录屏）
- [ ] Web Vitals 上报 endpoint 联通（B 接收成功）
- [ ] Bundle analyzer 报告产出，main < 250KB gz
- [ ] 性能 hooks 全部就位，A 在 PR 中开始引用

---

## 3. M5.2 Studio 主题动效系统化（W3-W4）

### 3.1 动效 Token

`apps/web/src/styles/tokens.css` 新增（C 主笔，A 评审）：

```css
:root {
  /* 缓动曲线 */
  --ease-out:        cubic-bezier(0.16, 1, 0.3, 1);
  --ease-out-soft:   cubic-bezier(0.22, 1, 0.36, 1);
  --ease-in-out:     cubic-bezier(0.65, 0, 0.35, 1);
  --ease-in:         cubic-bezier(0.7, 0, 1, 0.5);
  --ease-elastic:    cubic-bezier(0.34, 1.56, 0.64, 1);

  /* 时长（4 级） */
  --duration-instant: 0ms;
  --duration-fast:    120ms;   /* hover、focus 反馈 */
  --duration-base:    240ms;   /* 卡片展开 / 收起 */
  --duration-slow:    400ms;   /* 路由切换 / 模态 */
  --duration-extra:   600ms;   /* 主题切换 */

  /* 复合 motion（直接用） */
  --motion-fade-in:   opacity var(--duration-base) var(--ease-out);
  --motion-slide-up:  transform var(--duration-base) var(--ease-out);
  --motion-scale-in:  transform var(--duration-fast) var(--ease-elastic);
  --motion-route:     opacity var(--duration-slow) var(--ease-out),
                      transform var(--duration-slow) var(--ease-out);
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-fast:  0ms;
    --duration-base:  0ms;
    --duration-slow:  0ms;
    --duration-extra: 0ms;
  }
}
```

JS 端镜像 `apps/web/src/lib/motion/tokens.ts`：
```ts
export const DURATION = { instant: 0, fast: 120, base: 240, slow: 400, extra: 600 } as const;
export const EASING = {
  out: [0.16, 1, 0.3, 1],
  outSoft: [0.22, 1, 0.36, 1],
  inOut: [0.65, 0, 0.35, 1],
  in: [0.7, 0, 1, 0.5],
  elastic: [0.34, 1.56, 0.64, 1],
} as const;
```

### 3.2 路由切换动画

新建 `apps/web/src/components/layout/RouteTransition.tsx`：
```tsx
import { useLocation } from 'react-router-dom';
import { CSSTransition, SwitchTransition } from 'react-transition-group';

export function RouteTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <SwitchTransition mode="out-in">
      <CSSTransition key={pathname} timeout={400} classNames="route">
        <div className="route-stage">{children}</div>
      </CSSTransition>
    </SwitchTransition>
  );
}
```

`animations.css`：
```css
.route-enter      { opacity: 0; transform: translate3d(0, 8px, 0); }
.route-enter-active {
  opacity: 1; transform: none;
  transition: var(--motion-route);
}
.route-exit       { opacity: 1; }
.route-exit-active {
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-out);
}
```

A 把现有 `<main>{children}</main>` 包成 `<RouteTransition>{children}</RouteTransition>`。

### 3.3 卡片微交互

所有卡片 hover / press 走统一规则：
```css
.card {
  transition: transform var(--duration-fast) var(--ease-out),
              box-shadow var(--duration-fast) var(--ease-out);
}
.card:hover  { transform: translate3d(0, -2px, 0); box-shadow: var(--shadow-elevation-2); }
.card:active { transform: translate3d(0, 0, 0)   scale(0.99); }
```

提供 utility class `motion-press` / `motion-lift`，A 在 ui-kit Card 里直接用。

### 3.4 状态过渡（loading → loaded）

`<CardSkeleton>`（A 在 ui-kit 写的）淡出，真实数据淡入，**用 CSS view-transitions API 或 FLIP**：
```ts
// apps/web/src/lib/motion/flip.ts
export function flipMorph(from: HTMLElement, to: HTMLElement) {
  const f = from.getBoundingClientRect();
  const t = to.getBoundingClientRect();
  to.animate([
    { transform: `translate(${f.left - t.left}px, ${f.top - t.top}px) scale(${f.width / t.width}, ${f.height / t.height})` },
    { transform: 'none' },
  ], { duration: DURATION.base, easing: `cubic-bezier(${EASING.out.join(',')})` });
}
```

A 在 useQuery → 数据到位时调用。

### 3.5 Toast / Modal / Sidebar 折叠动画

- Toast：从右侧 +12px slide-in + opacity，stagger 80ms
- Modal：背板 fade，主体 scale 0.96 → 1
- Sidebar 折叠：现有 `apps/web/src/components/layout/AppShell.tsx:38` 的 `{!sidebarCollapsed && <Sidebar />}` 是**直接卸载**，会闪一下。改为始终 mount，用 width 0 → 240px 过渡（如果 A 不愿意改结构，C 用 ResizeObserver + Web Animations API 包一层 SmoothMount）

### 3.6 验收（M5.2 DoD）
- [ ] 全站路由切换视觉响应 < 100ms 起手，500ms 内结束
- [ ] 卡片 hover 一致；任何 :hover 转 transform 而非 box-shadow（避免重排）
- [ ] reduced-motion 下所有动画即时
- [ ] sidebar 折叠平滑无闪
- [ ] Storybook 有动效系统说明页

---

## 4. M5.3 Code splitting + 懒加载 + Service Worker（W5-W6）

### 4.1 路由级 code splitting

`apps/web/src/App.tsx` 所有页面用 `React.lazy`：
```ts
const HomePage = lazy(() => import('./pages/home/HomePage'));
const ChatPage = lazy(() => import('./pages/chat/ChatPage'));
// ...
```

每个页面单独 chunk，main 只留路由 + Shell + 通用组件。

### 4.2 Arona Shell 懒加载

```ts
const AronaShell = lazy(() => import('./components/arona/AronaShell'));
```

Studio 模式下 Three.js / Pixi / Live2D 完全不下载。A 实现 AronaShell，C 在 vite.config.ts 用 `manualChunks` 把 three / pixi 单独拆：

```ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'arona-3d':   ['three', '@react-three/fiber', '@react-three/drei'],
        'arona-2d':   ['pixi.js', 'pixi-live2d-display'],
        'vendor-react': ['react', 'react-dom', 'react-router-dom'],
        'vendor-state': ['zustand', '@tanstack/react-query'],
      },
    },
  },
}
```

### 4.3 切换 Overlay

C 提供 `<SwitchingOverlay />` 组件给 A 用作 Suspense fallback：
```tsx
export function SwitchingOverlay({ message = '正在切换…' }: Props) {
  // 全屏半透明遮罩 + 中心 spinner + 文案
  // 受 reduced-motion 控制
}
```

### 4.4 Service Worker

`apps/web/src/sw.ts` —— 用 [`workbox-build`](https://developer.chrome.com/docs/workbox)：
- 静态资源（JS / CSS / 图片 / WebP）：CacheFirst，30 天
- API GET（与 B 协商哪些可缓存）：StaleWhileRevalidate，60s
- API POST / PATCH / DELETE：NetworkOnly
- Live2D / glTF 资产：CacheFirst，永久（带版本号 query string）
- 失败页：自定义离线 HTML

`apps/web/vite.config.ts` 加 `vite-plugin-pwa`。

### 4.5 图片优化

- 头像：与 B 协商在上传时生成 WebP + 多尺寸（avatar-32.webp / avatar-128.webp）
- IntersectionObserver 实现 `<LazyImage>` 组件，所有列表用

### 4.6 验收
- [ ] Lighthouse Performance ≥ 90
- [ ] Studio 首屏 main chunk < 200KB gz
- [ ] Arona 切换：lazy chunks 加载完成 < 5s
- [ ] PWA 离线打开能看到首屏（缓存的 Studio 模式）

---

## 5. M5.4 多用户性能 + SharedWorker WebSocket（W7）

### 5.1 SharedWorker WebSocket

多 tab 打开时，每 tab 各开一条 WS = 浪费连接 + 重复消息。改为 SharedWorker 集中管理：

`apps/web/src/workers/ws-shared-worker.ts`：
```ts
const ports: MessagePort[] = [];
let ws: WebSocket | null = null;

function ensureSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  ws = new WebSocket('/ws/events');
  ws.onmessage = (e) => ports.forEach(p => p.postMessage({ type: 'ws-msg', data: e.data }));
  ws.onclose = () => setTimeout(ensureSocket, expBackoff());  // 指数退避重连
}

self.onconnect = (e) => {
  const port = e.ports[0];
  ports.push(port);
  port.start();
  port.onmessage = (msg) => {
    if (msg.data.type === 'ws-send') ws?.send(msg.data.payload);
  };
  ensureSocket();
};

function expBackoff(attempt = 1) { return Math.min(1000 * 2 ** attempt, 30000); }
```

主线程 `apps/web/src/lib/event-bus.ts` 改为通过 SharedWorker 收发，对外 API 不变（A 不需要改业务代码）。

### 5.2 React Query 缓存策略

调优 `apps/web/src/lib/query-client.ts`：
```ts
new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: 'always',  // 切回 tab 自动刷
      networkMode: 'offlineFirst',
    },
    mutations: { networkMode: 'offlineFirst' },
  },
});
```

提供乐观更新工具 `apps/web/src/lib/optimistic.ts`，A 在 mutation 里用：
```ts
const mutation = useMutation({
  ...optimisticUpdate(queryClient, ['schedules'], (old, newItem) => [...old, newItem]),
  mutationFn: (item) => api.post('/schedules', item),
});
```

### 5.3 列表虚拟化

新建 `apps/web/src/hooks/useVirtualList.ts` —— wrap `@tanstack/react-virtual`，A 在 chat / feeds / memory 列表用。

### 5.4 验收
- [ ] 开 3 个 tab → DevTools Network 只看到 1 条 WS 连接
- [ ] 100 条对话气泡列表滚动 60fps（Performance 录屏）
- [ ] mutation 乐观更新视觉响应 < 50ms
- [ ] WS 断网 5s 后自动重连，重连成功 toast

---

## 6. M5.5 验收与归档（W8）

- [ ] 总纲 §5 性能项全部 ✅
- [ ] `docs/Phase5_三人冲刺计划/adr_动效系统与性能基线.md` 已写
- [ ] `log_C_W*.md` 完整
- [ ] Lighthouse 报告：Performance / Accessibility / Best Practices / SEO 各 ≥ 90
- [ ] 性能回归门槛挂 CI（main chunk 超限 fail，LCP 超限 warn）

---

## 7. 与 A、B 的协议清单

### 与 A
1. **不要重复造轮子**：所有动画 hooks（`useReducedMotion` / `useVisibility` / `useIdle` / `useThrottle`）来自 `@/hooks`
2. **TopBar 切换器**：A 写结构（segmented control），C 包动画与切换 overlay
3. **ui-kit 卡片 Skeleton/Error/Empty**：A 写结构，C 提供进入/退出动画 utility class
4. **Arona Shell 懒加载边界**：A 用 `React.lazy(() => import('./components/arona/AronaShell'))`，C 在 vite manualChunks 里拆 arona-3d / arona-2d
5. **路由切换**：A 不再各自包过渡，统一用 C 提供的 `<RouteTransition>`
6. **数据三态过渡**：A 调 C 的 `flipMorph` 让 skeleton → data 平滑

### 与 B
1. C 跑性能压测需要稳定 token → B 提供专用 dev token
2. Web Vitals 上报需要 `/api/internal/metrics` POST 端点 → B 提供
3. Service Worker 缓存策略：哪些 GET 端点 stale-while-revalidate，哪些 NetworkOnly → 列表确认
4. 静态资产（live2d / scenes）路由路径稳定后 → C 在 SW 配 CacheFirst

---

## 8. 自检清单（每个 PR 提交前）

```bash
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web test
pnpm --filter web e2e
pnpm --filter web build
du -sh apps/web/dist apps/web/dist/assets/*.js | sort -h | tail -20
pnpm --filter web exec lighthouse http://localhost:5173 --only-categories=performance --quiet
```

人工 smoke：
- 三种 reduced-motion 设置（reduce / no-preference / 系统跟随）切换页面
- DevTools Performance 录 60s 各页面，验 idle 降帧、tab 隐藏暂停
- 多 tab 同时打开 → Network 只一条 WS

---

## 9. Ubuntu 真机准备（你的预交付）

详见 `99_Ubuntu真机联调准备清单.md`。摘要：

- [ ] WebGL 兼容性：在 `chrome://gpu` 显示软件渲染（SwiftShader）的环境下要有 fallback 到静态背景
- [ ] Service Worker 在 Ubuntu Chrome 下 production build 启用，且能离线打开
- [ ] 字体回退链：CJK 字体在 Ubuntu 上要能加载（Noto Sans CJK SC）；不要硬依赖 macOS 系统字体
- [ ] PerfHud 自动在 prod build 中移除（vite tree-shake 验证）
- [ ] vite.config.ts 的环境变量切换矩阵（dev / staging / prod）写清楚
