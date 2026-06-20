# Studio Arona v3.2.0 — 依赖大升级 + 新 API 落地

> **升级周期**: 2026-06-20 → 2026-06-21  
> **影响范围**: 23 npm + 8 Rust crate 升级，14 项新 API 特性落地  
> **commit**: `461a606`（37 files, +1404/-1540）  
> **测试**: 83 vitest 全过 · tsc 0 error · build 2.42s

---

## TL;DR

前端核心栈从 **React 18 / Vite 5 / Vitest 2 / TypeScript 5.6 / Tailwind 3** 升级到 **React 19 / Vite 8 / Vitest 4 / TypeScript 6 / Tailwind 4**。Vite 构建引擎从 Rollup 切换到 Rolldown（Rust 重写）。14 项新 API 特性落地到代码中：`useActionState`、`useSuspenseQuery`、`whileInView`、`@container`、`z.discriminatedUnion`、`<Environment>` 等。

---

## 依赖升级（5 批，19 commits）

### 第一批 — Patch 零风险
| 包 | 旧版本 | 新版本 |
|---|--------|--------|
| `@tauri-apps/api` | 2.11.0 | 2.11.1 |
| `@tanstack/react-query` | 5.60.0 | 5.101.0 |
| `zustand` | 5.0.0 | 5.0.14 |

### 第二批 — React 19 + Router 7 + Framer 12 + R3F 9
| 包 | 旧版本 | 新版本 |
|---|--------|--------|
| `react` / `react-dom` | 18.3.1 | **19.2.7** |
| `react-router-dom` | 6.28.0 | **7.18.0** |
| `framer-motion` | 11.11.0 | **12.40.0** |
| `@react-three/fiber` | 8.17.0 | **9.6.1** |
| `@react-three/drei` | 9.117.0 | **10.7.7** |

### 第三批（5.A）— Minor/Patch 20 项
`@hookform/resolvers` 5.4.0 · `@playwright/test` 1.61.0 · `@testing-library/jest-dom` 6.9.1 · `@types/three` 0.184.1 · `@typescript-eslint/*` 8.61.1 · `autoprefixer` 10.5.0 · `msw` 2.14.6 · `postcss` 8.5.15 · `prettier` 3.8.4 · `react-hook-form` 7.80.0 · `three` 0.184.0 · `web-vitals` 5.3.0 等

### 第四批（5.B）— Major 中风险
| 包 | 旧版本 | 新版本 |
|---|--------|--------|
| `typescript` | 5.6.3 | **6.0.3** |
| `zod` | 3.23.8 | **4.4.3** |
| `tailwindcss` | 3.4.14 | **4.3.1** |
| `jsdom` | 25.0.0 | **29.1.1** |
| `react-markdown` | 9.0.1 | **10.1.0** |

### 第五批（5.C）— Major 高风险
| 包 | 旧版本 | 新版本 |
|---|--------|--------|
| `vite` | 5.4.11 | **8.0.16**（跨 3 major） |
| `@vitejs/plugin-react` | 4.3.4 | **6.0.2** |
| `vitest` | 2.1.4 | **4.1.9**（跨 2 major） |
| `eslint` | 9.13.0 | **10.5.0** |
| `stylelint` | 16.10.0 | **17.13.0** |
| `tailwind-merge` | 2.5.4 | **3.6.0** |
| `lucide-react` | 0.460.0 | **1.21.0**（0.x→1.x） |

### Rust 升级（8 crate）
`tauri` 2.11.3 · `tauri-build` 2.6.3 · `reqwest` 0.13.4 · `serde` 1.0.228 · `serde_json` 1.0.150 · `anyhow` 1.0.102 · `tokio` 1.52.3 · `libc` 0.2.186

**跳过的**：`pixi.js` 7→8（pixi-spine 4.0.6 锁 pixi 7）· `storybook` 8→10（addon 生态待统一升级）

---

## 新 API 特性落地（14 项）

### React 19
- **`useActionState` + `<form action>`** — LoginPage/CreateVmForm 表单状态管理简化，替代 react-hook-form + useMutation 三件套
- **`preload()`** — DesignModeToggle hover "Arona" 时预加载 GLB + Draco + lazy chunk，减少模式切换延迟
- **`inert` attribute** — StudioHomePage focus mode 时 tile-layer 使用 `inert` + `inert:opacity-40 inert:pointer-events-none`

### React Query 5
- **`useSuspenseQuery`** — SystemPage 消除手动 `isPending`/`isError` 分支，渲染路径更纯粹
- **`queryOptions()`** — `useApiQuery` 类型安全查询配置工厂

### Framer Motion 12
- **`whileInView`** — FadeIn + StaggerList 新增滚动触发模式，`scrollFadeIn`/`scrollStaggerContainer`/`scrollStaggerItem` variants

### R3F 9 + drei 10
- **`<Float>`** — ClassroomScene 教室模型浮动呼吸效果 + SunOrb 浮动光球
- **`<Environment>`** — HDR 环境光（sunset/night preset）替代硬编码 ambientLight，自然漫反射

### Zod 4
- **`z.discriminatedUnion`** — `vmSchema` 按 VM status（queued/creating/running/stopped/error/destroyed）类型分化
- **`z.uuid()`** — `userProfileSchema` ID 验证
- **Schema SSOT** — 提取 `lib/schemas/auth.ts` / `vm.ts` / `api.ts`，替代行内 schema

### Tailwind 4
- **`@container` queries** — 12 页面响应式网格从 viewport breakpoints 迁移到容器查询（`sm:grid-cols-2` → `@2xl:grid-cols-2`）
- **`inert:` variant** — StudioHomePage tile-layer 语义化禁用
- **CSS-first `@theme`** — 删除 `tailwind.config.ts`，配置移入 `globals.css`

### Vitest 4
- **Browser mode** — `@vitest/browser` + `@vitest/browser-playwright` 配置，`test:browser` 脚本，`db.browser.test.ts` 示例

### Dexie 4
- **`useLiveQuery`** — `useReactiveLocal<T>()` hook，Web 端订阅 IndexedDB 变更跨 tab 即时刷新，桌面端回退

---

## 离线修复

- `clearAllUserData()` 桌面端同步清理 `~/Documents/studioarona/`（原来只清 IndexedDB）
- 登录/注册区分网络错误（"服务器未连接"）vs 凭据错误
- RSS 刷新 / 网页监控添加离线时 toast 提示（原来静默失败）

---

## 安装包

| 平台 | 格式 | 架构 |
|------|------|------|
| macOS | .dmg | Apple Silicon (arm64) |
| macOS | .dmg | Intel (x64) |
| Windows | .msi | x64 |
| Linux | .deb | x64 |

CI 自动构建，产物保留 90 天。

---

## 升级指南

### 从 v3.1.x 升级

1. **Node.js**: 需要 22+（Vite 8 要求）
2. **pnpm**: `pnpm install --frozen-lockfile` 安装最新依赖
3. **TypeScript**: 无代码改动（0 breaking）
4. **Zod**: `z.record()` 需两个参数 → `z.record(z.string(), z.unknown())`
5. **Tailwind**: 删除 `tailwind.config.ts`，所有主题配置在 CSS 中
6. **React 19**: `useRef()` 必须有初始值；`JSX.Element` → `ReactElement`
7. **Vitest 4**: `vi.fn().mockImplementation` 必须用 `function` 形式

### Tauri 桌面

- 数据路径不变：`~/Documents/studioarona/<table>/<id>.json`
- 权限不变：`capabilities/default.json` 限 `$HOME/Documents/studioarona/**`
- 离线完全可用，重连自动同步

---

## 已知问题

- pixi.js 停留在 7.4.3（pixi-spine 4.0.6 锁 pixi 7，等 spine 5.x 发布）
- Storybook 8.4.0（addon 生态未同步升级到 10.x）
- OCR 模型需单独下载：`python3 Client/run.py --download-ocr`（1.85G）

---

## 贡献者

@NeuronCState · Claude Fable 5
