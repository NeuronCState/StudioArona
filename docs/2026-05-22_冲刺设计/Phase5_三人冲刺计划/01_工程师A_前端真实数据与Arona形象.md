# 工程师 A · 前端真实数据与 Arona 形象任务书

> **角色定位**：负责把前端从"漂亮但 Mock 兜底"推到"真数据 + 双形象（Studio / Arona）+ Live2D 阿洛娜 + 3D 教室"。
> **协作方**：B（后端 / OpenClaw）、C（性能 / Studio 动效）通过 `packages/contracts/` 与文件分区解耦。
> **工期**：8 周（W1-W8）。
> **必读前置**：`00_总纲_数据真实化与形象升级.md` + 项目根 `CLAUDE.md`。

---

## 0. 角色 Prompt（直接喂给执行 Agent）

```
你是 Studio Javis 项目的前端体验工程师（代号 A），目标是把前端从"漂亮但 Mock 兜底"推到"真数据 + 双形象 + Live2D 阿洛娜 + 3D 教室"。本阶段你的工作覆盖三块：

1. 真实化：把所有 useQuery 的 .catch(() => null) 兜底拆成正经的 loading / empty / error 三态；msw 仅在 VITE_USE_MSW=1 时启用，默认全走真后端。
2. SSE 流式 UI：在对话中渲染 tool_call / tool_result / ui_action 事件。新增 ui_action 注册（live2d.* / theme.switch / scene.* / vm.console_followup）。
3. Arona 形象：Arona Shell 完整化 —— Three.js 背景层加载 BA 教室 + Live2D 中景层加载阿洛娜 + DOM 前景层；TopBar 加 Studio / Arona 切换器。

【绝对边界】
- ❌ 不修改 services/**、infra/**、packages/skills/<name>/{handler.py,schema.json}
- ❌ 不修改 packages/contracts/openapi.yaml ws-events.schema.json（仅读，需改通知 B）
- ✅ packages/contracts/ui-actions.schema.json 与 B 共评（本阶段会大幅扩展）
- ✅ apps/web/src/pages/** 全权 owner（数据三态）
- ✅ apps/web/src/components/arona/** 全权 owner（新建 Arona Shell）
- ❌ apps/web/src/components/effects/** 不归你（C 的领地，WebGL 装饰层）
- ❌ apps/web/src/lib/motion/** 不归你（C 的领地，动效系统）
- ❌ apps/web/vite.config.ts 不归你（C 的领地）
- ⚠️ tokens.css 颜色部分你可改，动效部分（--ease-* / --duration-*）C 主笔，你只消费

【关键资产位置】
- Live2D 模型：项目根 阿洛娜4.6版本/阿洛娜4.6/
  - 主文件：阿洛娜4_backup2025_0815_2142_backup2025_1017_2227.model3.json
  - 17 个表情：expressions/*.exp3.json
  - 2 个动作：idle.motion3.json、水饺.motion3.json
  - ⚠️ model3.json 的 EyeBlink 与 LipSync 的 Ids 数组为空，需要 runtime 根据 cdi3.json 反推 Parameter ID 后填进去（cdi3.json 是 Cubism Display Information，列出了所有参数 ID）
- Blender 教室：项目根 什亭之匣：蔚蓝档案教室 Blender 场景/BA教室4.2/
  - 用 Blender CLI 离线导出 .glb，commit 优化后产物到 apps/web/public/assets/scenes/

【依赖新增】
- three @latest
- @react-three/fiber、@react-three/drei
- pixi.js@7（Cubism SDK 当前兼容 PIXI v6/v7，避开 v8）
- pixi-live2d-display（含 Cubism 4 runtime；社区维护活跃 fork：guansss/pixi-live2d-display）
- Cubism Core 走 CDN（不进 bundle）：https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js

【参考开源项目（仅参考思路，不照搬代码）】
- Open-LLM-VTuber: https://github.com/Open-LLM-VTuber/Open-LLM-VTuber
  - 它的 live2d_model.py 展示了"标签 → 表情/动作"的映射设计
  - 它的前端展示了 lip-sync 与 LLM 流式输出的协同
- v3ucn/live2d-TTS-LLM-GPT-SoVITS-Vtuber: https://github.com/v3ucn/live2d-TTS-LLM-GPT-SoVITS-Vtuber
  - TTS + Live2D 嘴型同步参考

【性能预算（与 C 协商一致）】
- Studio 模式首屏 < 200KB gz、TTI < 1.5s
- Arona 模式（懒加载触发后）3D 资产 ≤ 8MB、Live2D 资产 ≤ 15MB、稳定 60fps @ 1080p
- 闲置 30s 自动降到 15fps；tab 隐藏 → 暂停所有 rAF（这部分 hook 由 C 提供，A 调用）

【自测命令】
pnpm --filter web typecheck && lint && test && e2e
```

---

## 1. 范围边界

| 类型 | 路径 | 权限 |
|---|---|---|
| 全权 owner | `apps/web/src/pages/**` | 读写（数据三态 + 业务逻辑） |
| 全权 owner | `apps/web/src/components/arona/**` | 读写（新建 Arona Shell） |
| 全权 owner | `apps/web/src/lib/{api,sse-client,ui-actions}.ts` | 读写 |
| 全权 owner | `packages/ui-kit/Card{Skeleton,Error,Empty}.tsx` | 读写（新建） |
| 共享 token（消费） | `apps/web/src/styles/tokens.css` 颜色部分 | 读写颜色，动效部分由 C 主笔 |
| 共享布局（结构主笔） | `apps/web/src/components/layout/{TopBar,AppShell,Sidebar}.tsx` | 结构 A 主笔，过渡动画 C 提供 |
| 共评 | `packages/contracts/ui-actions.schema.json` | 与 B 共同设计 |
| 只读 | `packages/contracts/openapi.yaml` `ws-events.schema.json` | 仅读，需改通知 B |
| 资产消费（只读） | `阿洛娜4.6版本/**` `什亭之匣：蔚蓝档案教室 Blender 场景/**` | 仅读 + 离线导出 |
| 禁止 | `services/**` `infra/**` `apps/web/src/components/effects/**` `apps/web/src/lib/motion/**` `apps/web/vite.config.ts` | 完全不动 |

---

## 2. M5.1 数据真实化（W1-W2）

### 2.1 现状盘点
```bash
grep -rn "\.catch(() => null)\|\.catch(() => \[\])\|mockItem\|mockData" apps/web/src --include="*.ts" --include="*.tsx"
```
参考 `apps/web/src/pages/studio/StudioHomePage.tsx:64-67` —— 这种写法每个查询失败都静默吞错。

### 2.2 useQuery 三态规范

```tsx
const { data, isLoading, isError, error, refetch } = useQuery({
  queryKey: ['schedules', 'upcoming'],
  queryFn: () => api.get<Schedule[]>('/schedules?upcoming=true'),
  staleTime: 60_000,
});

if (isLoading) return <CardSkeleton />;
if (isError)   return <CardError message={error.message} onRetry={refetch} />;
if (!data || data.length === 0)
  return <CardEmpty hint="还没有日程" cta="新建" onCta={...} />;
return <ScheduleList items={data} />;
```

封装到 `packages/ui-kit/`：
- `<CardSkeleton variant="..." />`
- `<CardError message onRetry />`
- `<CardEmpty hint cta onCta />`

### 2.3 MSW 改造

```ts
// apps/web/src/mocks/setup.ts
async function startMSW() {
  if (import.meta.env.VITE_USE_MSW !== '1') return;
  const { worker } = await import('./browser');
  return worker.start({ onUnhandledRequest: 'bypass' });
}
```

`.env.example` 注释清楚。

### 2.4 改造列表
- [ ] `pages/studio/StudioHomePage.tsx`
- [ ] `pages/feeds/FeedsPage.tsx` + `FeedItemDetail.tsx`（消除 `mockItem`）
- [ ] `pages/feeds/ScheduleTimeline.tsx`
- [ ] `pages/schedule/SchedulePage.tsx`
- [ ] `pages/memory/MemoryPage.tsx`
- [ ] `pages/system/SystemPage.tsx`（轮询改成 visibilitychange gated；具体 hook 由 C 在 `useVisibility.ts` 提供）
- [ ] `pages/vms/VmsPage.tsx`（加 start/stop 操作，加 console 视图入口）
- [ ] `pages/shared/SharedPage.tsx`
- [ ] `pages/chat/DashboardCards.tsx`

### 2.5 验收（M5.1 DoD）
- [ ] grep 不再有 `.catch(() => null)` 模式
- [ ] 关掉后端跑 `pnpm dev`，每个页面都能看到清晰的 error 态而不是空白
- [ ] e2e `apps/web/e2e/data-states.spec.ts` 三态用例通过

---

## 3. M5.2 SSE 流式 UI + ui_action 扩展（W3-W4）

### 3.1 SSE 事件分发器扩展

`apps/web/src/lib/sse-client.ts` 支持：
```ts
type SSEEvent =
  | { type: 'token'; text: string }
  | { type: 'tool_call'; id: string; tool: string; args: unknown }
  | { type: 'tool_result'; id: string; tool: string; status: 'ok' | 'error'; result?: unknown; error?: string }
  | { type: 'ui_action'; action: UIAction }
  | { type: 'done' }
  | { type: 'error'; message: string };
```

### 3.2 工具调用可视化

新建 `apps/web/src/pages/chat/ToolCallBubble.tsx`：

```
┌──────────────────────────────┐
│ 🔧 schedules.list            │
│ ↳ upcoming=true              │
│ [调用中... 350ms]            │  ← 进行中（动效由 C 的 motion lib 提供）
│                              │
│ ✓ 找到 3 条日程              │
│   • 14:00 项目同步           │
│   • 16:00 ...                │
│ [查看全部 →]                  │
└──────────────────────────────┘
```

**特殊形态：VM 控制台回显**

LLM 调 `vms.console.tail` / `vms.console.exec` 后会推 `vm.console_followup` ui_action，前端展示等宽字体黑底卡片（最多 50 行，超出折叠）：

```
┌──────────────────────────────┐
│ 💻 VM-build · 控制台输出       │
│ ─────────────────────────────│
│ $ df -h                      │
│ Filesystem  Size Used Avail  │
│ /dev/sda1   50G   23G   24G  │
│ ...                          │
│ [展开 ▾] [复制] [发给阿洛娜]  │
└──────────────────────────────┘
```

### 3.3 ui_action 注册表扩展

`apps/web/src/lib/ui-actions.ts`：

```ts
const handlers: Record<UIAction['type'], (action: UIAction) => void> = {
  // 现有
  'navigate': handleNavigate,
  'highlight': handleHighlight,
  'render_card': handleRenderCard,
  'clear_session': handleClearSession,
  'toast': handleToast,
  'confirm': handleConfirm,

  // 新增（本阶段）
  'live2d.play_motion': handleLive2DMotion,
  'live2d.set_expression': handleLive2DExpression,
  'live2d.set_emotion': handleLive2DEmotion,
  'live2d.lipsync_audio': handleLive2DLipsync,
  'theme.switch': handleThemeSwitch,
  'scene.set_time': handleSceneTime,
  'scene.set_weather': handleSceneWeather,
  'vm.console_followup': handleVMConsoleFollowup,
};
```

每个 handler 走全局事件总线（zustand store 或 mitt），`<AronaShell />` 与 `<ConsoleViewer />` 订阅。

### 3.4 验收（M5.2 DoD）
- [ ] 与阿洛娜对话触发 schedule.list、vms.console.tail，气泡能看到工具调用过程
- [ ] tool_call 可视化在 Storybook 有覆盖（loading / success / error / vm-console）
- [ ] e2e 一条对话完整触发 5+ 种 ui_action

---

## 4. M5.3 Arona Shell + Live2D + 教室（W5-W6）

### 4.1 主题切换器

现有 `apps/web/src/stores/design-mode.ts` 已是 `'arona' | 'studio'`，把它真正用起来：

1. `apps/web/src/components/layout/TopBar.tsx` 加切换控件（C 提供动画）：
   ```
   [🪶 Studio] [🌸 Arona]
   ```
2. 路由层根据 mode 渲染：
   ```tsx
   const mode = useDesignModeStore((s) => s.mode);
   const Shell = mode === 'arona'
     ? React.lazy(() => import('./components/arona/AronaShell'))
     : StudioAppShell;
   return <Suspense fallback={<C.SwitchingOverlay />}><Shell>{routes}</Shell></Suspense>;
   ```
3. **懒加载**：Studio 模式下完全不下载 Three.js / Pixi / Live2D 包（C 在 `vite.config.ts` 通过 manualChunks 与你协调）
4. 切换时机：用户主动点 + LLM 通过 `ui_action.theme.switch` 主动切

### 4.2 AronaShell 三层架构

`apps/web/src/components/arona/AronaShell.tsx`：
```
┌────────────────────────────────────────┐
│  [Three.js Canvas — 背景层]            │  z-index: 1
│  BA 教室 3D 场景，远景虚化              │
│                                        │
│       [PIXI Canvas — 中景层]           │  z-index: 10
│        阿洛娜 Live2D，右下偏中         │
│                                        │
│  [DOM UI 层 — 前景]                    │  z-index: 20
│  对话气泡 / 输入框 / 卡片              │
│  pointer-events 按需穿透                │
└────────────────────────────────────────┘
```

### 4.3 Three.js 教室

#### Blender 离线导出（一次性）
```bash
/Applications/Blender.app/Contents/MacOS/Blender \
  "什亭之匣：蔚蓝档案教室 Blender 场景/BA教室4.2/教室_Eevee 4.2.blend" \
  --background --python-expr "
import bpy
bpy.ops.export_scene.gltf(
  filepath='/tmp/classroom-day.glb',
  export_format='GLB', export_apply=True,
  export_draco_mesh_compression_enable=True
)"

npx @gltf-transform/cli optimize /tmp/classroom-day.glb \
  apps/web/public/assets/scenes/classroom-day.glb \
  --texture-compress webp --texture-size 2048
```
重复夜晚版（用 `教室_Eevee_night4.2.blend`）。每个 < 6MB。

#### 加载组件
`apps/web/src/components/arona/ClassroomScene.tsx`：
```tsx
import { Canvas } from '@react-three/fiber';
import { useGLTF, Environment } from '@react-three/drei';

export function ClassroomScene({ time }: { time: 'day' | 'night' }) {
  const { scene } = useGLTF(`/assets/scenes/classroom-${time}.glb`);
  return (
    <Canvas
      camera={{ position: [0, 1.5, 4], fov: 45 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      frameloop="demand"
      style={{ position: 'absolute', inset: 0, zIndex: 1 }}
    >
      <Suspense fallback={null}>
        <primitive object={scene} />
        <Environment preset="apartment" />
      </Suspense>
    </Canvas>
  );
}
```

### 4.4 Live2D 集成

`apps/web/src/components/arona/AronaModel.tsx`：

```tsx
import { Live2DModel } from 'pixi-live2d-display';
import * as PIXI from 'pixi.js';

declare global { interface Window { PIXI: typeof PIXI; Live2DCubismCore: any } }

useEffect(() => {
  // 1. 注入 Cubism Core（CDN）
  if (!window.Live2DCubismCore) {
    const s = document.createElement('script');
    s.src = 'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js';
    document.head.appendChild(s);
    await new Promise((r) => (s.onload = r));
  }
  // 2. 暴露 PIXI 给 Live2D 内部 Ticker
  window.PIXI = PIXI;
  // 3. 加载模型
  const manifest = await fetch('/api/assets/live2d/arona/manifest.json').then(r => r.json());
  const model = await Live2DModel.from(manifest.modelPath);
  // 4. 修复 EyeBlink / LipSync 空 Ids（重要！）
  patchModelParams(model);
  // 5. 加入 PIXI 舞台
  app.stage.addChild(model);
}, []);
```

**EyeBlink / LipSync 修复**：
```ts
function patchModelParams(model: Live2DModel) {
  const core = model.internalModel.coreModel.getModel();
  const ids: string[] = core.parameters.ids;  // runtime 拿到所有参数 ID
  // BA 阿洛娜常见 ID：
  const eyeIds = ids.filter(id => /^Param.?Eye.?(L|R)Open/i.test(id));
  const lipIds = ids.filter(id => /^Param.?MouthOpenY/i.test(id));
  // 注入到 model.internalModel.eyeBlink / breath / lipSync
  // 具体 API 详见 pixi-live2d-display README "EyeBlink"
}
```

开发期 `console.log(ids)` 一次记下完整列表，硬编码到 `apps/web/src/components/arona/arona-params.ts`。

### 4.5 情绪信号联动

订阅 ui-action bus：

```ts
useEffect(() => {
  const off = uiActionBus.on((action) => {
    if (action.type === 'live2d.set_expression') model.expression(action.name);
    if (action.type === 'live2d.play_motion') model.motion(action.group, undefined, 3);
    if (action.type === 'live2d.set_emotion') {
      const map: Record<string, { expr: string | null; motion: [string, number] }> = {
        happy:    { expr: '星星眼', motion: ['Idle', 0] },
        sad:      { expr: '哭哭',   motion: ['Idle', 0] },
        surprised:{ expr: '挤眼',   motion: ['Idle', 0] },
        angry:    { expr: '生气',   motion: ['Idle', 0] },
        sleepy:   { expr: '眯眼',   motion: ['Idle', 0] },
        curious:  { expr: '猫猫',   motion: ['Idle', 0] },
        neutral:  { expr: null,     motion: ['Idle', 0] },
      };
      const m = map[action.emotion];
      if (m?.expr) model.expression(m.expr);
      model.motion(m.motion[0], m.motion[1], 3);
    }
  });
  return off;
}, [model]);
```

### 4.6 视线跟随（仅鼠标，不接摄像头）

⚠️ **用户明确说**：Live2D 不接摄像头，仅 LLM 驱动。视线跟踪只跟鼠标。

```ts
const handleMouseMove = throttle((e: MouseEvent) => {  // throttle 由 C 的 motion lib 提供
  const x = (e.clientX / window.innerWidth) * 2 - 1;
  const y = (e.clientY / window.innerHeight) * 2 - 1;
  model.focus(x, y);
}, 33);
```

### 4.7 验收（M5.3 DoD）
- [ ] TopBar 切换 Studio ↔ Arona，状态持久化
- [ ] Arona 模式：教室加载 ≤ 8MB，3D 渲染稳定，阿洛娜居中略偏右，眨眼正常，鼠标跟视线
- [ ] LLM 输出"开心"语境时，前端能看到星星眼表情
- [ ] Studio 模式：bundle analyzer 显示 Three.js / Pixi 不在 main chunk
- [ ] 切回 Studio 时 Arona 资源被释放（dispose model + WebGL context）

---

## 5. M5.4 联调（W7）
- [ ] 与 B 联调 SSE / ui_action / VM console 回显
- [ ] 与 C 联调 Studio ↔ Arona 切换流畅度（C 提供切换动画 + 资源清理 hook）
- [ ] e2e：登录 → 对话 → 触发 schedule 创建 → 列表自动刷新 → 阿洛娜表情变化

## 6. M5.5 验收（W8）
- [ ] 总纲 §5 所有前端项 ✅
- [ ] `docs/Phase5_三人冲刺计划/adr_前端双形象架构.md` 已写
- [ ] Storybook 有 AronaModel / ClassroomScene / ToolCallBubble / Card{Skeleton,Error,Empty} 故事

---

## 7. 与 B、C 的协议清单

### 与 B 协商
1. `apps/web/src/lib/api.ts` 类型不对 → 让 B 跑 `make generate-types-ts`
2. SSE 事件类型对不上 → 让 B 改 `ws-events.schema.json`
3. 想新增 ui_action type → 在 `ui-actions.schema.json` 提 PR
4. Live2D 资产 404 → 让 B 检查 `/api/assets/live2d/arona/*`
5. LLM 标签格式异常 → 让 B 检查 `services/agent/bridge/server.js` 解析

### 与 C 协商
1. **不要自己写动画 hooks**：`useReducedMotion`、`useVisibility`、`useIdle`、`throttle`、`useTransition` 全部由 C 提供在 `apps/web/src/lib/motion/`
2. **不要自己写性能优化**：路由级 code split、Service Worker、SharedWorker WebSocket 都是 C 的领地
3. **TopBar 切换动画**：你写结构，C 写动画 token 与过渡曲线
4. **Studio 主题旧组件**（login canvas、home blur）：你不动，C 在 M5.1 全部重写
5. 当你需要"切换到 Arona 时显示加载状态" → 用 C 提供的 `<C.SwitchingOverlay />`

---

## 8. 自检清单（每个 PR 提交前）

```bash
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web test
pnpm --filter web e2e
pnpm --filter web build && du -sh apps/web/dist
```

人工 smoke：
- 切换 Studio / Arona 三次
- 关后端跑前端，每页是 error 态
- DevTools Performance 录 60s Arona 闲置，验 C 的降帧 hook 生效

---

## 9. Ubuntu 真机准备（你这边的预交付）

详见 `99_Ubuntu真机联调准备清单.md`。摘要：

- [ ] 所有 useQuery 在网络断开 / 慢网下的 error 态都要测过
- [ ] Live2D 资产路径只通过 `/api/assets/*` 抽象访问，**不允许**硬编码 `阿洛娜4.6版本/...` 中文路径（部署到 Linux 时 nginx 静态路径会变）
- [ ] glTF 教室产物 commit 到 `apps/web/public/assets/scenes/` 或单独的 LFS 仓
- [ ] 主题切换在禁用 WebGL 的浏览器（设置 `chrome://flags` 关掉 WebGL）下要有友好降级（fallback 回 Studio）
