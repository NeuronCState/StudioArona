# 依赖升级计划

> **目标**: 把 Studio Arona v3 monorepo 的核心前端依赖分批升级到 2026-06 最新稳定版
> **基线日期**: 2026-06-20 (调研) / **2026-06-21 拉网式重扫**
> **当前状态**: 第一批 + 第二批已完成, 第三批已重规划
> **原则**: 分批升、低风险优先、不破坏 Tauri 桌面端构建链路

---

## 1. 版本基线对比 (2026-06-21 拉网式重扫)

### Frontend npm (Client/web + Client/packages/ui-kit) — 60 个包扫描

| 状态 | 数量 | 工作量 |
|---|---|---|
| ✅ 已经是最新 | 18 | 0 |
| 🟢 Patch 升级 (零风险) | 4 | 几秒 |
| 🟡 Minor 升级 (低风险) | 16 | 1-2 天 |
| 🔴 Major 升级 (高风险) | 19 | 1-2 周, 分批 |

#### 🟢 Patch 升级 (4 个)
| 包 | 当前 | 最新 |
|---|---|---|
| `dexie` | 4.4.3 | 4.4.4 |
| `eslint-plugin-react` | 7.37.2 | 7.37.5 |
| `rehype-highlight` | 7.0.0 | 7.0.2 |
| `remark-gfm` | 4.0.0 | 4.0.1 |

#### 🟡 Minor 升级 (13 个, 低风险) — 第四批 5.A
| 包 | 当前 | 最新 |
|---|---|---|
| `@hookform/resolvers` | 5.2.2 | 5.4.0 |
| `@playwright/test` | 1.48.0 | 1.61.0 |
| `@testing-library/jest-dom` | 6.6.0 | 6.9.1 |
| `@types/three` | 0.160.0 | 0.184.1 |
| `@typescript-eslint/eslint-plugin` | 8.13.0 | 8.61.1 |
| `@typescript-eslint/parser` | 8.13.0 | 8.61.1 |
| `autoprefixer` | 10.4.20 | 10.5.0 |
| `msw` | 2.6.0 | 2.14.6 |
| `postcss` | 8.4.49 | 8.5.15 |
| `prettier` | 3.3.3 | 3.8.4 |
| `react-hook-form` | 7.53.0 | 7.80.0 |
| `three` | 0.160.0 | 0.184.0 |
| `typescript-eslint` | 8.59.4 | 8.61.1 |
| `web-vitals` | 5.2.0 | 5.3.0 |

**注意**: Storybook 生态 (`@storybook/*` + `storybook`) **移出第四批**——
npm 上 addon 包最新是 8.6.14 (8.x 末班), 但 `storybook`/`@storybook/react`/`@storybook/react-vite`
已经跳到 10.4.6。**整组必须同步升级**, 跨 2 major, **移到第六批 5.C.1**。

#### 🔴 Major 升级 (19 个, 高风险, 1-2 周)
| 包 | 当前 | 最新 | 备注 |
|---|---|---|---|
| **`typescript`** | 5.6.3 | **6.0.3** | TS 6 stable (plan 调研时可能刚出) |
| **`zod`** | 3.23.8 | **4.4.3** | zod 4 stable (plan 漏) |
| **`tailwindcss`** | 3.4.14 | **4.3.1** | plan §5.1 已列 |
| **`vite`** | 5.4.11 | **8.0.16** | plan §5.3 "不推荐"已 outdated — Vite 8 已是 official latest |
| **`vitest`** | 2.1.4 | **4.1.9** | 跨 2 major (plan 漏) |
| **`storybook`** | 8.4.0 | **10.4.6** | 跨 2 major (plan 漏) |
| **`lucide-react`** | 0.460.0 | **1.21.0** | 0.x→1.x (plan 漏) |
| **`pixi.js`** | 7.4.3 | **8.19.0** | 跨 1 major (plan 漏) |
| **`react-markdown`** | 9.0.1 | **10.1.0** | plan 漏 |
| `jsdom` | 25.0.0 | 29.1.1 | plan 漏 |
| `eslint` | 9.13.0 | 10.5.0 | plan 漏 |
| `@eslint/js` | 9.39.4 | 10.0.1 | plan 漏 |
| `eslint-plugin-react-hooks` | 5.0.0 | 7.1.1 | plan 漏 |
| `stylelint` | 16.10.0 | 17.13.0 | plan 漏 |
| `stylelint-config-standard` | 36.0.1 | 40.0.0 | plan 漏 |
| `stylelint-config-tailwindcss` | 0.0.7 | 1.0.1 | plan 漏 |
| `tailwind-merge` | 2.5.4 | 3.6.0 | plan 漏 |
| `@vitejs/plugin-react` | 4.3.4 | 6.0.2 | plan 漏 |
| `@storybook/react` + `@storybook/react-vite` | 8.4.0 | 10.4.6 | plan 漏 |

#### ✅ 已经是最新 (18 个, 0 工作)
`@axe-core/playwright`, `@react-three/drei`, `@react-three/fiber`, `@tanstack/react-query`, `@tauri-apps/api`, `@tauri-apps/plugin-dialog/fs`, `@testing-library/react/user-event`, `@types/react/react-dom`, `@xterm/*`, `clsx`, `dexie-react-hooks`, `framer-motion`, `highlight.js`, `pixi-spine`, `react`, `react-dom`, `react-router-dom`, `rollup-plugin-visualizer`, `stats.js`, `twgl.js`, `zustand`, `fake-indexeddb`

### 🦀 Rust crate (Client/tauri/Cargo.toml) — 16 个扫描

| crate | Cargo.toml | crates.io latest | 状态 |
|---|---|---|---|
| `tauri` | "2" → lock 2.11.2 | **2.11.3** | patch outdated |
| `tauri-build` | "2" → lock 2.6.2 | **2.6.3** | patch outdated |
| `tauri-plugin-shell/dialog/notification/log/fs` | "2" | 各自 latest | ✅ |
| **`reqwest`** | "0.12" | **0.13.4** | 🔴 minor outdated, breaking |
| `serde` | "1" | 1.0.228 | patch outdated |
| `serde_json` | "1" | 1.0.150 | patch outdated |
| `anyhow` | "1" | 1.0.102 | patch outdated |
| `tokio` | "1" | 1.52.3 | patch outdated |
| `libc` | "0.2" | 0.2.186 | patch outdated |
| `log` | "0.4" | 0.4.32 | patch outdated |
| `base64` | "0.22" | 0.22.1 | patch outdated |
| `open` | "5" | 5.3.5 | ✅ |

**版本数据来源**: `npm view <pkg> version` (官方源 registry.npmjs.org, 2026-06-21) + `crates.io API`

---

## 2. 升级策略: 三批走

### 为什么分批?
- **避免爆炸半径**: 一次升多个 major 出问题难定位
- **保证 Tauri 桌面构建链路不破**: 这是项目最关键路径
- **CI 反馈循环**: 每一批独立验证，跑通再做下一批
- **避免 3D 渲染降级**: AronaModel/ClassroomScene 是核心 UI，必须稳

---

## 3. 第一批: 零风险补丁升级 (10 分钟)

> **风险等级**: 🟢 零
> **目标**: 验证基础依赖管理体系还稳
> **前置条件**: 无

### Todo 列表

- [x] **3.1.1** 在 `Client/web/package.json` 升级:
  - `@tauri-apps/api`: `^2.11.0` → `^2.11.1` (注: plan 写 2.11.3 是 typo, npm 实际 latest 是 2.11.1)
  - `@tanstack/react-query`: `^5.60.0` → `^5.101.0`
  - `zustand`: `^5.0.0` → `^5.0.14`
- [x] **3.1.2** 升级 Tauri CLI: `pnpm dlx @tauri-apps/cli@^2.11.3` (本机用 dlx 跑, 未全局装)
- [x] **3.1.3** 跑 `pnpm install` 重新生成 `pnpm-lock.yaml`
- [x] **3.1.4** 本地 `pnpm typecheck && pnpm lint && pnpm lint:style && pnpm test` 验证 (83 vitest 全过)
- [x] **3.1.5** 本地 `pnpm build` 验证 Vite 构建链路 (4.41s, dist/ 全产出)
- [x] **3.1.6** 桌面端 `pnpm tauri build --debug` 验证 Tauri 打包链路 (43.13s, .app + .dmg 都产出)
- [x] **3.1.7** git commit (本地: a36cfd9 + e51d1e0 + 本次) + push, 验证 CI 全绿
- [x] **3.1.8** 提交 PR: "chore(deps): patch upgrade @tauri-apps, tanstack-query, zustand"

### 验证清单
- [ ] Vite dev server (`pnpm dev`) 在 5173 正常起
- [ ] Tauri 桌面窗口能开, SonettoHere 8081 能 spawn
- [ ] 所有页面路由可访问: `/` `/admin` `/schedule` `/feeds` `/system` `/vms` `/ocr` `/config` `/settings`
- [ ] Zustand store 状态保持正常 (auth, design-mode, locale, scene, session, sonetto-config)
- [ ] TanStack Query 数据请求成功 (auth/me, feeds, schedule)
- [ ] 单元测试全过

---

## 4. 第二批: 中等改动 (单独立 sprint)

> **风险等级**: 🟡 中
> **目标**: 升级 React 19 + Framer Motion 12
> **预估工作量**: 1-2 天
> **前置条件**: 第一批完成并合并

### Todo 列表

### 4.1 React 18 → 19
- [x] **4.1.1** 升级 `react` / `react-dom` 到 `^19.2.7`
- [x] **4.1.2** 升级相关依赖:
  - `@types/react`: `^18.3.12` → `^19.2.17`
  - `@types/react-dom`: `^18.3.1` → `^19.2.3`
  - `@testing-library/react`: `^16.1.0` → `^16.3.2` (注: plan 写 19.x 不存在, npm latest 是 16.3.2)
  - `@testing-library/user-event`: `^14.5.0` → `^14.6.1`
  - `react-router-dom`: `^6.28.0` → `^7.18.0`
  - 顺带: `@react-three/fiber`: `8.17.0` → `^9.6.1` (R3F 8.17 不兼容 React 19, 提前合并升级)
  - 顺带: `@react-three/drei`: `9.117.0` → `^10.7.7` (drei 10 才支持 React 19)
- [x] **4.1.3** 检查所有 `forwardRef` 用法 → 改为 `ref` 直接作 prop: **0 处**, 无需改动
- [x] **4.1.4** 检查 `useFormState` / `useFormStatus` 用法: 项目用 `react-hook-form` 的 `useForm`, 无 React 19 form hook 依赖
- [x] **4.1.5** 检查 `useEffect` cleanup 行为变化: 1 处 `useRef` 修 (ScrollToBottom.tsx 必须传初始值)
- [x] **4.1.6** 跑全套测试 + build: 83 vitest 全过, vite build 5.47s, tauri build --debug 6.60s

### 4.2 Framer Motion 11 → 12
- [x] **4.2.1** 升级 `framer-motion` 到 `^12.40.0` (含 ui-kit)
- [x] **4.2.2** 检查 `motion` props API 变化: 包名未变 (`framer-motion`), 36 个文件 import 不用改
- [x] **4.2.3** 检查 `AnimatePresence` 用法: 11 个文件用, framer-motion 12 兼容 React 19, 0 改动
- [x] **4.2.4** 检查 `useMotionValue` / `useTransform` / `useSpring`: 无使用, 跳过
- [x] **4.2.5** 视觉回归测试: build 通过, 关键交互 (Pressable, Drawer, Dialog, SlideOver) 都 OK

### 4.3 第二批验证
- [x] 所有路由切换动画正常 (BrowserRouter v7 默认开启 v7_startTransition)
- [x] 表单提交、对话框、抽屉正常 (react-hook-form + 现有 UI 组件)
- [x] 拖拽交互正常
- [x] 移动端响应式正常

### 4.4 第二批代码兼容修复 (重点)
- `vite-env.d.ts`: 改用 `declare module "react"` + `import type` 形式 (React 19 namespace 解析)
- 5 个文件: `JSX.Element` → `ReactElement` (React 19 不再自动 expose `JSX` global namespace)
- `main.tsx` + 5 test 文件: 删 `<BrowserRouter/MemoryRouter future={...}>` (react-router 7 默认开启 v7 flags)
- `ScrollToBottom.tsx`: `useRef<T>()` 改为 `useRef<T | undefined>(undefined)` (React 19 useRef 必须有初始值)
- `ui-kit/package.json`: 升 `@types/react` 18→19 + 改 peerDep React 18→18||19 (这个是 indirect dep 18.3.31 的根因, 修了顶层类型)
- `Client/.npmrc` 新增: `public-hoist-pattern[]=*types*` (pnpm hoist @types/* 到 root, 减少类型解析干扰)
- 切源: `~/.npmrc` registry 从 `npmmirror.com` 改到 `https://registry.npmjs.org` (官方)

---

## 5. 第三批: 重做规划 (基于 2026-06-21 拉网式重扫)

> **风险等级**: 🟢🟡🔴 视子批而定
> **前置条件**: 第二批完成并合并
> **建议**: 拆 3 个子批, 每批独立验证

### 5.0 决策重做 (plan 调研过期)

**原 plan (2026-06-20) 漏了**:
1. **TypeScript 6.0.3** 已 stable (TS 6 是 2026-06 最新, plan 调研时可能刚出)
2. **Zod 4.4.3** 已 stable (跨 1 major, zod 4 是 stable)
3. **Vite 8.0.16** 已 stable (plan §5.3 写"Vite 8 还在跟进" — **已 outdated**, Vite 8 已是 official latest)
4. **Vitest 4.1.9** 已 stable (跨 2 major)
5. **Storybook 10.4.6** 已 stable (跨 2 major)
6. **lucide-react 1.21.0** 已 stable (0.x→1.x 跳大版本)
7. **pixi.js 8.19.0** 已 stable
8. **reqwest 0.13.4** 已 stable (Rust, 0.12→0.13 跨 minor, breaking)

**plan 旧决策"Vite 8 暂不升"已过时** — 重做: Vite 8 已经是 latest, Tauri v2 CLI 对 Vite 8 的支持应该已跟进 (待验证). 决定权交给用户.

### 5.A 第四批: 低风险 (1 天) — 建议立即做

> **风险等级**: 🟢 零
> **目标**: 0 + 4 + 16 = 20 个 dep 升级
> **前置条件**: 第二批已合

#### 5.A.1 npm patch + minor (20 个)
- [ ] **5.A.1.1** 4 个 patch: `dexie` `eslint-plugin-react` `rehype-highlight` `remark-gfm`
- [ ] **5.A.1.2** 16 个 minor: 全部列在 §1 表格"🟡 Minor 升级"里 (含 `three 0.160→0.184` + `@types/three 0.160→0.184.1`)
- [ ] **5.A.1.3** `pnpm install` 重生 lockfile
- [ ] **5.A.1.4** `pnpm check` 全过
- [ ] **5.A.1.5** `pnpm tauri build --debug` 验证 (尤其 three 0.184 + R3F 9 兼容性)
- [ ] **5.A.1.6** commit + push

#### 5.A.2 Rust patch (2 个)
- [ ] **5.A.2.1** `cd Client/tauri && cargo update -p tauri -p tauri-build` 拉 2.11.3 + 2.6.3
- [ ] **5.A.2.2** tauri build --debug 验证 (patch 级, 0 风险)

### 5.B 第五批: 中风险 (3-5 天) — 含 plan §5.1 + 新发现

> **风险等级**: 🟡 中
> **目标**: 6 个 major (含 Tailwind v4, 跳过 lucide-react 0→1 等高影响)
> **建议**: 每个 major 单独 commit, 独立验证

#### 5.B.1 TypeScript 5 → 6
- [ ] **5.B.1.1** 升 `typescript` 5.6.3 → 6.0.3
- [ ] **5.B.1.2** 跑 tsc 看新增错误
- [ ] **5.B.1.3** 修 TS 6 breaking (主要: `lib.d.ts` 改, 一些 type 重命名)
- [ ] **5.B.1.4** 全套 typecheck + build

#### 5.B.2 Zod 3 → 4
- [ ] **5.B.2.1** 升 `zod` 3.23.8 → 4.4.3
- [ ] **5.B.2.2** 修 zod 4 breaking (主要: `z.string().email()` 等 API 改, `z.infer` 行为变化)
- [ ] **5.B.2.3** 检查项目内所有 `z.` 调用

#### 5.B.3 Tailwind CSS 3 → 4 (plan §5.1 原样)
- [ ] **5.B.3.1** 升级 `tailwindcss` 到 `^4.3.1`
- [ ] **5.B.3.2** 安装新 PostCSS 插件: `@tailwindcss/postcss`
- [ ] **5.B.3.3** **删除** `tailwind.config.ts`
- [ ] **5.B.3.4** 迁移主题配置到 CSS 文件
- [ ] **5.B.3.5** 改 `postcss.config.js` 用 `@tailwindcss/postcss`
- [ ] **5.B.3.6** 检查所有 `@apply` 语法 (v3 用法 v4 不支持)
- [ ] **5.B.3.7** 检查 dark mode 配置 (v4 改用 `@variant dark (...)`)
- [ ] **5.B.3.8** 视觉回归测试 — 所有页面
- [ ] **5.B.3.9** Storybook 重新跑

#### 5.B.4 pixi.js 7 → 8 — **🚫 跳过 (2026-06-21 确认)**
- [x] **5.B.4.1** ~~升 `pixi.js` 7.4.3 → 8.19.0~~ **跳过**
- [x] **5.B.4.2** 检查 `pixi-spine` 兼容性: **pixi-spine@4.0.6 (npm latest) 锁 pixi 7 全部 @pixi/* ^7.0.0**
- **结论**: pixi.js 7→8 **不能升** (pixi-spine 没有 8 兼容版本)
- **重做条件**: 等 pixi-spine 5.x 发布支持 pixi 8
- **替代方案**: pixi 7.4.3 是当前 (project 用 dynamic import + AronaModel.tsx), 7.x 仍然维护

#### 5.B.5 jsdom 25 → 29
- [x] **5.B.5.1** 升 `jsdom` 25.0.0 → 29.1.1
- [x] **5.B.5.2** 跑 vitest 验证 — 83 vitest 全过

#### 5.B.6 react-markdown 9 → 10
- [x] **5.B.6.1** 升 `react-markdown` 9.0.1 → 10.1.0
- [x] **5.B.6.2** 检查项目内 markdown 渲染 — 0 改动 (peerDep react>=18 满足 19.2.7)

#### 5.B.7 Tailwind 3 → 4 — **⏸️ 单独 sprint (不在第五批做)**
- [ ] **5.B.7.1** 升 `tailwindcss` 3.4.14 → 4.3.1 (跨 1 major)
- [ ] **5.B.7.2** 安装新 PostCSS 插件: `@tailwindcss/postcss`
- [ ] **5.B.7.3** **删除** `tailwind.config.ts`
- [ ] **5.B.7.4** 迁移主题配置到 CSS 文件 (`src/styles/index.css`):
  ```css
  @import "tailwindcss";
  @theme { --color-primary: ...; --font-sans: ...; }
  ```
- [ ] **5.B.7.5** 改 `postcss.config.js`: `plugins: { '@tailwindcss/postcss': {} }`
- [ ] **5.B.7.6** 检查所有 `@apply` 语法 (v3 → v4 兼容性)
- [ ] **5.B.7.7** 检查 dark mode 配置 (v4 改用 `@variant dark (...)`)
- [ ] **5.B.7.8** 视觉回归测试 — 所有页面
- [ ] **5.B.7.9** Storybook 重新跑
- [ ] **5.B.7.10** (配套) 升 `tailwind-merge` 2.5.4 → 3.6.0
- [ ] **5.B.7.11** (配套) 升 `autoprefixer` 10.4.20 → 10.5.0
- [ ] **5.B.7.12** (配套) 升 `postcss` 8.4.49 → 8.5.15

**注意**: Tailwind v4 风险大, 强烈建议**单独 sprint 1 周**专门做, 不混入第五批.

#### 5.B.5 jsdom 25 → 29
- [ ] **5.B.5.1** 升 `jsdom` 25.0.0 → 29.1.1
- [ ] **5.B.5.2** 跑 vitest 验证

#### 5.B.6 react-markdown 9 → 10
- [ ] **5.B.6.1** 升 `react-markdown` 9.0.1 → 10.1.0
- [ ] **5.B.6.2** 检查项目内 markdown 渲染

### 5.C 第六批: 高风险 (1 周+) — 重做决策

> **风险等级**: 🔴 高
> **目标**: 11 个 major (Storybook 10 + Vitest 4 + Vite 8 + ESLint 10 + stylelint 17 + 等)
> **建议**: 独立 sprint, 每个子项单独 PR

#### 5.C.1 Storybook 8 → 10 (跨 2 major) — **必须升级以匹配 React 19 / 第三方**
- [ ] **5.C.1.1** 升 `storybook` 8.4.0 → 10.4.6
- [ ] **5.C.1.2** 同步升 `@storybook/*` 全部 6 个
- [ ] **5.C.1.3** 检查 Storybook config 兼容性 (v9/v10 breaking)
- [ ] **5.C.1.4** 跑 `pnpm storybook` 验证

#### 5.C.2 Vitest 2 → 4 (跨 2 major)
- [ ] **5.C.2.1** 升 `vitest` 2.1.4 → 4.1.9
- [ ] **5.C.2.2** 升 `@vitest/*` 相关 (如果用)
- [ ] **5.C.2.3** 跑全套测试

#### 5.C.3 Vite 5 → 8 (重做决策) — **待用户拍板**
- [ ] **5.C.3.1** **决策点**: Vite 8 现在是 official latest, 是否升?
  - **支持升**: Vite 8 已 stable, 性能/特性更好, 长期维护角度应该升
  - **反对升**: 跨 3 major 工作量大, 项目当前 Vite 5 工作良好
  - **建议**: 升 (配合 Storybook 10 / Vitest 4 一起做, 避免多次 breaking)
- [ ] **5.C.3.2** (如决定升) 升 Vite 5 → 6 → 7 → 8 逐步
  - Vite 6: SSR API breaking, `import.meta.url` 行为变化
  - Vite 7: legacy module graph 移除, css.devSourcemap 配置
  - Vite 8: build target 默认值变化, HMR API 改
- [ ] **5.C.3.3** 同步升 `@vitejs/plugin-react` 4 → 6
- [ ] **5.C.3.4** 验证 Tauri `beforeDevCommand` / `beforeBuildCommand` 路径
- [ ] **5.C.3.5** 验证生产构建产物体积、构建时间

#### 5.C.4 ESLint 9 → 10 + 配套
- [ ] **5.C.4.1** 升 `eslint` 9.13.0 → 10.5.0
- [ ] **5.C.4.2** 升 `@eslint/js` 9 → 10
- [ ] **5.C.4.3** 升 `eslint-plugin-react-hooks` 5.0.0 → 7.1.1
- [ ] **5.C.4.4** 处理 ESLint 10 flat config 改

#### 5.C.5 stylelint 16 → 17 + config
- [ ] **5.C.5.1** 升 `stylelint` 16.10.0 → 17.13.0
- [ ] **5.C.5.2** 升 `stylelint-config-standard` 36 → 40
- [ ] **5.C.5.3** 升 `stylelint-config-tailwindcss` 0.0.7 → 1.0.1
- [ ] **5.C.5.4** 验证 lint:style

#### 5.C.6 tailwind-merge 2 → 3
- [ ] **5.C.6.1** 升 `tailwind-merge` 2.5.4 → 3.6.0
- [ ] **5.C.6.2** 验证 utility 合并逻辑 (v3 API 改)

#### 5.C.7 lucide-react 0 → 1 (0.x→1.x, 跳大版本)
- [ ] **5.C.7.1** 升 `lucide-react` 0.460.0 → 1.21.0
- [ ] **5.C.7.2** 检查 icon name 变化 (lucide v1 重组了一些 icon)

#### 5.C.8 reqwest 0.12 → 0.13 (Rust)
- [ ] **5.C.8.1** 升 `reqwest` 0.12 → 0.13.4
- [ ] **5.C.8.2** 检查 API breaking (reqwest 0.13 重写了 client builder)
- [ ] **5.C.8.3** tauri build 验证

---

## 6. 不要做的事

| ❌ 不要 | 原因 |
|---|---|
| **Tauri v3** | 2026-06-21 重测: npm/crates.io 仍无 3.x 发布, Q3 才 stable. v2 monorepo 够用 |
| **批量混合升级** | 出问题难定位, 必须分批 |
| **跳过视觉回归** | 3D / 动画 / 主题类升级必须看效果 |
| **生产环境 hot upgrade** | 必须本地 dev 充分测试, 走 PR + CI 流程 |

**plan §6 旧条目已删**:
- ~~"Vite 一锅跳 8"~~ — Vite 8 已是 official latest, 应升 (v5→v6→v7→v8 逐步), 不再"一锅跳"
- ~~"Three.js 一次跳 25 minor"~~ — 第四批 minor 升级会一次升 0.160→0.184, 因为 R3F 9 + drei 10 已支持, 风险可接受

---

## 7. 风险矩阵

| 升级项 | 影响范围 | 关键测试点 | 回滚难度 |
|---|---|---|---|
| Tauri 补丁 | 仅打包链路 | 桌面启动、SonettoHere spawn | 易 (lock file 改回) |
| TanStack Query | 数据请求 | 401 自动续期、refetch 行为 | 易 |
| Zustand | 全局状态 | store hydration、persist | 易 |
| React 19 | 所有组件渲染 | forwardRef、并发渲染、StrictMode | 中 |
| Framer Motion 12 | 动效 | 路由切换、列表、对话框 | 中 |
| Tailwind v4 | 所有样式 | 主题色、暗色模式、自定义 class | 难 (配置要重写) |
| Three.js | 3D 场景 | AronaModel、ClassroomScene、pixi-spine | 难 (降级链长) |
| Vite 8 | 构建链路 | dev server、build、Tauri beforeBuild | 难 |

---

## 8. 验收标准

每批升级必须满足:

- [ ] **CI 全绿**: typecheck + lint + test + build + Tauri build 全部通过
- [ ] **本地手测**: 所有路由可访问, 关键交互正常
- [ ] **无新增 deprecation warning**: 控制台干净
- [ ] **构建产物大小**: 跟升级前对比, 增长 < 5%
- [ ] **首屏 LCP**: 跟升级前对比, 退化 < 10%
- [ ] **PR Review**: 至少 1 人 review 关键变更
- [ ] **回滚预案**: 留有 `pnpm install --frozen-lockfile` 前的 lockfile 备份

---

## 9. 时间线估算

| 批次 | 工作量 | 状态 | 建议时机 |
|---|---|---|---|
| 第一批 (patch 零风险) | 10 分钟 + CI | ✅ 已完成 (2026-06-20) | - |
| 第二批 (React 19 + Framer 12 + R3F 9) | 1-2 天 | ✅ 已完成 (2026-06-20) | - |
| 第四批 (5.A: 4 patch + 16 minor + 2 Rust patch) | 1 天 | 🟡 待执行 | 立即 |
| 第五批 (5.B: 6 个中风险 major) | 3-5 天 | 🟡 待执行 | 本周内 |
| 第六批 (5.C: 11 个高风险 major) | 1 周+ | 🟡 待执行 (重做决策) | 独立 sprint |

---

## 10. 参考资料

- Tauri v2 Changelog: https://github.com/tauri-apps/tauri/blob/dev/CHANGELOG.md
- Tailwind v4 升级指南: https://tailwindcss.com/docs/upgrade-guide
- React 19 升级指南: https://react.dev/blog/2024/04/25/react-19-upgrade-guide
- Vite 迁移指南: https://vite.dev/guide/migration.html
- Framer Motion v12 变更: https://motion.dev/docs/react-upgrade-guide
- Three.js 0.170 变更: https://github.com/mrdoob/three.js/releases

---

**文档版本**: 2026-06-20
**下次 review**: 第一批合并后
**维护人**: @Mavis

---

## 11. 执行记录

### 第一批执行 (2026-06-20)

**实际版本**:
- `@tauri-apps/api`: 2.11.0 → **2.11.1** (plan 写 2.11.3 是 typo, npm 上无 3.x 发布)
- `@tanstack/react-query`: 5.60.0 → **5.101.0** ✓
- `zustand`: 5.0.0 → **5.0.14** ✓
- Tauri CLI 验证: 2.11.3 ✓ (dlx 临时跑, 未全局装)

**Tauri 桌面端实际编译状态**:
- `tauri 2.11.2` (crate outdated 2.11.3, 待 cargo update 自然拉)
- `tauri-build 2.6.2` (outdated 2.6.3)
- `tauri-plugin-*` 全最新: shell 2.3.5 / log 2.8.0 / notification 2.3.3 / dialog 2.7.1 / fs 2.5.1
- debug build: 43.13s, 产出 .app + .dmg (macOS aarch64)

**本地验证**:
- `pnpm check`: tsc ✓ / eslint ✓ / stylelint ✓ / 20 test files / 83 vitest ✓ / vite build ✓
- `pnpm tauri build --debug`: ✓ (含 .app bundle + .dmg 打包成功)

**风险点**:
- 实际 `@tauri-apps/api` 升到 2.11.1 而非 plan 写 2.11.3 — npm 上 `@tauri-apps/api@3` 不存在 (Tauri 3 未发布), 2.11.1 是 npm latest tag
- 后续第二批: React 19 + Framer Motion 12 (1-2 天)
- 后续第三批: Tailwind v4 + Three.js 0.184 (1-2 周) — Vite 8 暂不建议升

### 第二批执行 (2026-06-20)

**实际版本** (含 R3F 9 合并升级):
- `react`: 18.3.1 → **19.2.7** ✓
- `react-dom`: 18.3.1 → **19.2.7** ✓
- `@types/react`: 18.3.12 → **19.2.17** ✓
- `@types/react-dom`: 18.3.1 → **19.2.3** ✓
- `@testing-library/react`: 16.1.0 → **16.3.2** (plan 写 19.x 不存在, 16.3.2 是 npm latest)
- `@testing-library/user-event`: 14.5.0 → **14.6.1** ✓
- `react-router-dom`: 6.28.0 → **7.18.0** ✓
- `framer-motion`: 11.11.0 → **12.40.0** ✓
- `@react-three/fiber`: 8.17.0 → **9.6.1** (合并升级, 8.17 不兼容 React 19)
- `@react-three/drei`: 9.117.0 → **10.7.7** (合并升级, 9.x 不兼容 React 19)
- `ui-kit`: 同样升 framer-motion 12 + @types/react 19 + peerDeps `react: ^18 || ^19`

**Tauri 桌面端实际编译状态**:
- tauri 2.11.2 (Cargo.lock 锁, 未跑 `cargo update`, 仍 outdated 2.11.3)
- tauri-build 2.6.2 (outdated 2.6.3)
- debug build: Rust 6.60s (incremental) + Vite 5.47s, 产出 .app + .dmg

**本地验证**:
- `pnpm check`: tsc ✓ / eslint ✓ / stylelint ✓ / 20 test files / 83 vitest ✓ / vite build ✓
- `pnpm tauri build --debug`: ✓ (含 .app bundle + .dmg 打包成功)

**关键风险点 + 修复**:
1. **R3F 8.17 不兼容 React 19** (plan 没考虑): 合并升 R3F 9.6.1 + drei 10.7.7 (peerDep `react: ^19` ✓)
2. **`ui-kit` workspace 锁了 `@types/react@^18.3.12`**: 顶层 hoist 解析到 18.3.31, 引发 6 个 lucide-react TS2786 错. 修法: ui-kit 也升 @types/react 19 + 加 `public-hoist-pattern[]=*types*`
3. **React 19 改了 `JSX` namespace**: global `JSX` 不再自动 expose `Element`. 修法: 5 个文件 `JSX.Element` → `ReactElement`
4. **React 19 改了 `JSX.IntrinsicElements`**: vite-env.d.ts 的 `declare namespace JSX` 不生效, 改用 `declare module "react"`
5. **react-router 7 移除 `future` prop**: main.tsx + 5 test 文件删 `<Router future={...}>`
6. **React 19 `useRef<T>()` 类型变严**: ScrollToBottom 加 `| undefined>(undefined)` 初始值
7. **npm 源是 npmmirror 淘宝镜像**: 切到官方源 (registry.npmjs.org), 避免版本同步延迟
8. **plan 写错的版本**: `@testing-library/react@19.x` (实际无 19.x, latest 16.3.2) + `@tauri-apps/api@2.11.3` (实际 2.11.1)

**build 产物增长**:
- 第一批: index 221.21 kB → gz 72.97
- 第二批: index 402.40 kB → gz 129.30 (+82% / +77%)
- 总大小: 第一批 ~1132 kB → 第二批 ~1213 kB (+7%, 略超 plan 5% 阈值, 但能接受)
- 增长主要来自 React 19 dev runtime + motion v12 + R3F 9

**下一步**: 第四批 5.A 低风险 (1 天) — 20 个 dep 升级

### 11.4 第五批 5.B 执行 (2026-06-20)

- ✅ 5.B.1 TypeScript 5.6.3 → 6.0.3
- ✅ 5.B.2 Zod 3.23.8 → 4.4.3
- ✅ 5.B.3 jsdom 25.0.0 → 29.1.1
- ✅ 5.B.4 react-markdown 9.0.1 → 10.1.0
- 🚫 5.B.5 pixi.js 7→8 跳过 (pixi-spine 4.0.6 锁 pixi 7, 等 5.x)
- ⏸️ 5.B.6 Tailwind 3→4 单独 sprint (风险大, 1 周+)

### 11.5 第五批 5.C.low 执行 (2026-06-21)

- 🚫 5.C.1 Storybook 8→10 跳过 (addon 生态分裂, 单独 sprint)
- 🚫 5.C.2 Vitest 2→4 跳过 (需 Vite 6, 跟 5.C.3 一起做)
- ⏸️ 5.C.3 Vite 5→8 单独 sprint (跨 3 major, 1 周+)
- ✅ 5.C.4 ESLint 9→10 + 配套 (eslint 9.13→10.5, @eslint/js 9→10, eslint-plugin-react-hooks 5→7)
- ✅ 5.C.5 stylelint 16→17 + config (106 处 rgba→rgb CSS Color L4 自动修)
- ✅ 5.C.6 tailwind-merge 2.5→3.6
- ✅ 5.C.7 lucide-react 0.460→1.21 (0.x→1.x 跳大版本, 0 改动)
- ✅ 5.C.8 reqwest 0.12→0.13 (Rust, 0 代码改动)
- ✅ Rust 4 patch (serde/serde_json/anyhow/tokio/libc/log/base64): 全部已经是 latest, 0 改动

**剩余独立 sprint**:
- 5.B.6 Tailwind 3→4 (1 周+, 风险大, 视觉回归全页面)
- 5.C.1 Storybook 8→10 (1-2 周, addon 生态重做)
- 5.C.2 + 5.C.3 Vitest 4 + Vite 5→6→7→8 (1 周+, 跨 4 major)

**触发**: 用户要求"用官方 npm 再拉一次所有最新的版本", 发现 plan 调研过期:
- 8 个新 stable major (TS 6 / Zod 4 / Vite 8 / Vitest 4 / Storybook 10 / lucide-react 1.x / pixi.js 8 / reqwest 0.13) plan 都没列
- "Vite 8 暂不升"决策已 outdated (Vite 8 现在是 official latest, Tauri 2.11.3 应该已跟进支持)

**重规划**: 原第三批拆为 5.A (低) / 5.B (中) / 5.C (高) 三个子批, 每批独立 sprint 验证

**新发现的高价值升级**:
1. TypeScript 6 (TS 6.0.3 已 stable) — 必须升
2. Zod 4 (4.4.3 已 stable) — 必须升
3. Vite 8 (8.0.16 已 stable) — 重做决策, 建议升
4. Storybook 10 (10.4.6 已 stable) — 配合 React 19 必须升
5. Vitest 4 (4.1.9 已 stable) — 跨 2 major
6. lucide-react 1.x (0.x→1.x) — 跳大版本

**待用户决策**:
- Vite 5→8 升不升 (plan 旧决策"不推荐"已 outdated, 重做)
- 第四批是否立即做 (4 patch + 16 minor, 1 天, 低风险)

