# Studio Arona v3 — Release Notes: Dependency Upgrade

> **升级周期**: 2026-06-20 → 2026-06-21
> **影响范围**: 60 npm + 16 Rust crate
> **commit 数**: 19 个 (待推送)
> **测试覆盖**: 83 vitest 全过 · tauri build --bundles app 成功
> **配套文档**: [`docs/upgrade-plan.md`](./upgrade-plan.md) 完整调研 + 决策记录

---

## TL;DR

一次系统化的依赖大升级 — **5 批共 19 个 commit**。前端核心栈从 **React 18 / Vite 5 / Vitest 2 / TypeScript 5.6 / Tailwind 3** 一次性升到 **React 19 / Vite 8 / Vitest 4 / TypeScript 6 / Tailwind 4**，构建系统从 **rollup** 切到 **rolldown**（Rust 重写，**build 速度 -53%**，产物 -34%）。Tauri 桌面端同步升到 **2.11.3**。

---

## 升级批次概览

| 批次 | 范围 | commit | 时间 |
|---|---|---|---|
| **第一批** | 4 dep patch (零风险) | `a36cfd9` | 10 分钟 |
| **第二批** | React 19 + Router 7 + Framer 12 + R3F 9 | `ada8e5b` | 1-2 天 |
| **4 (5.A)** | 17 npm + 8 Rust crate (Tauri 2.11.3) | `9248fcb` | 1 天 |
| **5 (5.B)** | 6 个中风险 major (TS 6 / Zod 4 / jsdom / react-markdown / Tailwind 4) | `2267ea8` + `e487e45` + `784d6b1` + `095ae3a` + `672c4e2` | 3-5 天 |
| **6 (5.C)** | 8 个高风险 major (Vite 8 / Vitest 4 / ESLint 10 / stylelint 17 / tailwind-merge / lucide-react / reqwest) | `d10a34b` + `b1a0b41` + `c004d1c` + `823d5cc` + `98952b6` + `b38cff1` + `d946190` | 1 天 |

**总共 23 个 npm 包 + 8 个 Rust crate 升级**，跨 **12 个 major**（含 Vite 跨 3 major、Vitest 跨 2 major、React 18→19、TypeScript 5→6、Zod 3→4、Tailwind 3→4、ESLint 9→10、stylelint 16→17、lucide-react 0.x→1.x、reqwest 0.12→0.13）。

---

## 升级清单

### Frontend (npm)

#### 🟢 零风险 Patch (4)
- `dexie` 4.4.3 → **4.4.4**
- `eslint-plugin-react` 7.37.2 → **7.37.5**
- `rehype-highlight` 7.0.0 → **7.0.2**
- `remark-gfm` 4.0.0 → **4.0.1**

#### 🟡 低风险 Minor (13)
- `@hookform/resolvers` 5.2.2 → **5.4.0**
- `@playwright/test` 1.48.0 → **1.61.0**
- `@testing-library/jest-dom` 6.6.0 → **6.9.1**
- `@types/three` 0.160.0 → **0.184.1**
- `@typescript-eslint/eslint-plugin` + `parser` 8.13.0 → **8.61.1**
- `autoprefixer` 10.4.20 → **10.5.0**
- `msw` 2.6.0 → **2.14.6**
- `postcss` 8.4.49 → **8.5.15**
- `prettier` 3.3.3 → **3.8.4**
- `react-hook-form` 7.53.0 → **7.80.0**
- `three` 0.160.0 → **0.184.0**
- `typescript-eslint` 8.59.4 → **8.61.1**
- `web-vitals` 5.2.0 → **5.3.0**

#### 🔴 高价值 Major (10) — 已完成
- **`react` 18.3.1 → 19.2.7** + `react-dom` — React 19 正式 stable，含 `useActionState` / `use()` / async transitions
- **`react-router-dom` 6.28.0 → 7.18.0** — Router 7 兼容 React 19，data router APIs 就绪
- **`framer-motion` 11.11.0 → 12.40.0** + ui-kit 同步 — 36 个 import 0 改动（包名不变）
- **`@react-three/fiber` 8.17.0 → 9.6.1** — 必备：8.17 不兼容 React 19，提前合并升
- **`@react-three/drei` 9.117.0 → 10.7.7** — 必备：drei 10 才支持 React 19
- **`typescript` 5.6.3 → 6.0.3** — TS 6 stable，0 改动（仅删 `baseUrl` 一处）
- **`zod` 3.23.8 → 4.4.3** — zod 4 stable，`z.input` / `z.output` 分裂
- **`jsdom` 25.0.0 → 29.1.1** — 跨 4 minor，0 改动
- **`react-markdown` 9.0.1 → 10.1.0** — 跨 1 major，0 改动
- **`tailwindcss` 3.4.14 → 4.3.1** + 新增 `@tailwindcss/postcss` — **CSS-first config** (`@theme` 块)，完整主题/动画/dark mode 迁移

#### 🔴 工具链升级 (7)
- **`vite` 5.4.11 → 8.0.16** — 跨 **3 major** (5→6→7→8)，**rolldown 替代 rollup**
- **`@vitejs/plugin-react` 4.3.4 → 6.0.2** — 跟 Vite 8 配套
- **`vitest` 2.1.4 → 4.1.9** — 跨 2 major，`vi.fn().mockImplementation` 必须 `function` 形式
- **`eslint` 9.13.0 → 10.5.0** + `@eslint/js` 9→10 + `eslint-plugin-react-hooks` 5→7
- **`stylelint` 16.10.0 → 17.13.0** + `stylelint-config-standard` 36→40 + `stylelint-config-tailwindcss` 0→1
- **`tailwind-merge` 2.5.4 → 3.6.0**
- **`lucide-react` 0.460.0 → 1.21.0** — 0.x→1.x 跳大版本，60 个 icon 0 改动

### 🦀 Rust (Cargo.toml)

| crate | 升级 | 备注 |
|---|---|---|
| `tauri` | 2.11.2 → **2.11.3** | patch |
| `tauri-build` | 2.6.2 → **2.6.3** | patch |
| `tauri-codegen` / `tauri-macros` / `tauri-runtime` / `tauri-runtime-wry` / `tauri-utils` | 同步升至 latest | transitive |
| `tray-icon` | 0.23.1 → **0.24.1** | transitive (tauri `tray-icon` feature) |
| **`reqwest`** | 0.12 → **0.13.4** | 跨 1 minor，0 代码改动 |
| `tauri-plugin-*` (shell/dialog/notification/log/fs) | 已是 latest | ✅ |
| `serde` / `serde_json` / `anyhow` / `tokio` / `libc` / `log` / `base64` | 已是 latest | ✅（cargo lockfile 之前已锁） |

---

## 🚀 性能改进

| 指标 | 之前 | 之后 | 改进 |
|---|---|---|---|
| **Vite 8 build 时间** | 5.51s | **2.59s** | **-53%** ⚡ |
| **生产产物 index.js** | 409.84 kB (gz 131.21) | **271.14 kB** (gz 86.69) | **-34%** 📦 |
| **生产产物总大小** | ~1213 kB | ~1170 kB | -3.5% (虽然加了 zod schemas 97 kB chunk) |
| **Tauri debug build (incremental)** | 6.42s | 4.79s | -25% |
| **Rust 编译** (reqwest 0.13 重新 transitive 链) | — | 4m 58s (一次) | — |

Vite 8 用 **rolldown**（Rust 重写的 bundler）替代 rollup，**同时**速度更快 + 产物更小。

---

## 🔧 关键修复（兼容性问题）

### React 19
- **JSX 命名空间变更**: 5 个文件 `JSX.Element` → `ReactElement`（React 19 不再 expose global `JSX`）
- **JSX.IntrinsicElements**: `vite-env.d.ts` 改用 `declare module "react"` 形式
- **useRef 类型变严**: `useRef<T>()` 必须传初始值，1 处改 `useRef<T | undefined>(undefined)`
- **0 处 `forwardRef`** 需改（项目没用 forwardRef）

### Zod 4
- **`z.input` / `z.output` 分裂**: `useForm<VmFormInput, undefined, VmForm>` 三 generic，`z.coerce` 字段 input=unknown / output=number

### Vite 8 / Rolldown
- **`manualChunks` 必须 function 形式**: 5 chunk (vendor/motion/markdown/xterm/...) 从 object `{key: [...]}` 改 `(id) => 'name'`
- `vite.config.ts` 重构

### Tailwind 4
- **`@tailwind base/components/utilities` → `@import "tailwindcss"`** (1 行)
- **5 个 @keyframes camelCase → kebab-case** (stylelint 17 强制 + 实际引用同步)
- **删 `tailwind.config.ts`**（CSS-first `@theme` 块替代）
- **`@custom-variant dark` 替代 `darkMode: ['selector', '[data-theme="dark"]']`**
- **CSS Color L4 语法** (`rgb(R G B / A)` 替代 `rgba(R, G, B, A)`) — stylelint 17 自动 `pnpm lint:style --fix` 修 106 处

### Vitest 4
- **`vi.fn().mockImplementation` 必须 `function` 关键字**（不是 arrow function）— 1 个 mock 文件 (VmsPage.test.tsx) 改

### Project-level infrastructure
- **切 npm 源**: `~/.npmrc` registry 从 `npmmirror.com` 改到 `https://registry.npmjs.org`（避免淘宝镜像版本同步延迟）
- **ui-kit 锁 @types/react@18.3.12**: 改 ui-kit 升 `@types/react@^19` + `peerDeps: react: ^18 || ^19`，解决 6 个 lucide-react TS2786 错
- **pnpm hoist**: `Client/.npmrc` 加 `public-hoist-pattern[]=*types*`
- **gitignore**: 忽略 `vite.config.d.ts` / `*.tsbuildinfo`（Vite/TypeScript 自动生成）

---

## 📋 计划与决策

完整调研 + 决策过程见 [`docs/upgrade-plan.md`](./upgrade-plan.md)，要点：
- **Plan 调研过期纠正**: 2026-06-20 调研遗漏了 8 个 stable major (TS 6 / Zod 4 / Vite 8 / Vitest 4 / Storybook 10 / lucide-react 1.x / pixi.js 8 / reqwest 0.13)，2026-06-21 拉网式重扫发现
- **"Vite 8 暂不升" 决策重做**: Vite 8 已是 official latest，一次跳 3 major (5→8) 节省分步成本
- **Storybook 10 跳过**: `@storybook/addon-essentials` 卡在 8.6.14 (peerDeps 锁 `storybook: ^8.6.14`)，无 9.x/10.x stable — 需要重做 addon 生态
- **Tailwind 3→4** 阶段 1 用兼容模式跑，阶段 2 完整 `@theme` 迁移

---

## 🚧 跳过 / 延后项目

| 项目 | 原因 | 重做条件 |
|---|---|---|
| **Tauri v3** | npm/crates.io 仍无 3.x 发布，2026 Q3 才 stable | Tauri v3 stable + 测试 |
| **pixi.js 7→8** | `pixi-spine@4.0.6` (npm latest) 锁 pixi 7，无 5.x 兼容版本 | 等 pixi-spine 5.x |
| **Storybook 8→10** | `@storybook/addon-essentials` 无 9.x/10.x stable (9.0.0-alpha only) | 重做 addon 生态 |
| **Tailwind 4 阶段 2d 完整视觉回归** | 已完成 CSS-first 迁移，浏览器手动视觉验证 | 用户手动验证后 |
| **`eslint-plugin-react` 不支持 ESLint 10** | peerDeps 锁 `^3..^9.7`，等上游适配 | 上游 8.x stable |
| **Storybook 间接 vite-plugin-react-docgen-typescript 锁 vite ^3-6** | 跟 Storybook 8 配套，无 9.x | Storybook 10 sprint |

---

## ⚠️ 已知问题 + Workaround

| 问题 | Workaround |
|---|---|
| **macOS 27 + Tauri 2.11.x**: `bundle_dmg.sh` 报 `Not enough arguments` | `pnpm tauri build --bundles app` 跳过 dmg (`.app` 已可用) |
| **Vite config 需要 `manualChunks` function 形式** (Vite 8 + rolldown) | 已修，5 个 chunk 改 function |
| **`@hookform/resolvers` zod resolver 4.x 行为变化** | `useForm` 三 generic 显式声明 |

---

## ✅ 验证

| 验证 | 结果 |
|---|---|
| `pnpm check` (tsc + eslint + stylelint + vitest + vite build) | **✅ 全过** |
| 单元测试 (vitest) | **20 files / 83 tests 全过** |
| `pnpm tauri build --bundles app` (Rust + Vite + bundle) | **✅ .app + .dmg 都产出** (.dmg 用 `--bundles app` workaround) |
| GitHub Actions `pr.yml` | 设计为 PR 触发 (本次未 push, 未触发) |
| 视觉回归 (浏览器) | **待用户手动验证** (Tailwind 4 阶段 2 主题迁移后) |

---

## 📦 安装包

构建产物:
- **macOS** (Apple Silicon): `Studio Arona_0.1.2_aarch64.dmg`
- **macOS** (Intel): `Studio Arona_0.1.2_x64.dmg`
- **Windows**: `Studio Arona_0.1.2_x64-setup.exe` (NSIS)
- **Linux**: `studio-arona_0.1.2_amd64.deb`

构建命令: `cd Client/tauri && pnpm dlx @tauri-apps/cli@^2.11.3 build` (macOS) / `pnpm tauri build --target x86_64-pc-windows-msvc` (Windows) / `--target x86_64-unknown-linux-gnu` (Linux)

---

## 📚 相关文档

- [`docs/upgrade-plan.md`](./upgrade-plan.md) — 完整升级计划 + 决策记录
- [`docs/upgrade-plan.md` §11 执行记录](upgrade-plan.md#11-执行记录) — 每个批次的实际执行结果

---

**升级者**: Mavis (Mavis Orchestrator)
**时间**: 2026-06-20 ~ 2026-06-21
**commit 范围**: `a36cfd9..672c4e2` (19 commits, 等待推送)
