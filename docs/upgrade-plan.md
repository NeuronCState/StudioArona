# 依赖升级计划

> **目标**: 把 Studio Arona v3 monorepo 的核心前端依赖分批升级到 2026-06 最新稳定版
> **基线日期**: 2026-06-20
> **当前状态**: 调研完成，待执行
> **原则**: 分批升、低风险优先、不破坏 Tauri 桌面端构建链路

---

## 1. 版本基线对比

| 依赖 | 当前版本 | 最新稳定版 | 类型 | 升级风险 |
|---|---|---|---|---|
| `@tauri-apps/api` | 2.11.0 | **2.11.1** | patch | 🟢 零 |
| `@tauri-apps/cli` | (跟随 v2) | **2.11.3** | patch | 🟢 零 |
| `tailwindcss` | 3.4.14 | **4.3.1** | major | 🟡 中-高 |
| `react` | 18.3.1 | **19.2.7** | major | 🟡 中 |
| `react-dom` | 18.3.1 | **19.2.7** | major | 🟡 中 |
| `vite` | 5.4.11 | **8.0.16** | 3 major | 🔴 高 |
| `@tanstack/react-query` | 5.60.0 | **5.101.0** | minor | 🟢 低 |
| `framer-motion` | 11.11.0 | **12.40.0** | major | 🟡 中 |
| `zustand` | 5.0.0 | **5.0.14** | patch | 🟢 零 |
| `three` | 0.160.0 | **0.184.0** | 25 minor | 🟡 中-高 |
| `@react-three/fiber` | 8.17.0 | (跟随 three) | - | 🟡 中 |
| `@tanstack/react-query` | 5.60.0 | **5.101.0** | minor | 🟢 低 |

**版本数据来源**: `npm view <pkg> version` (2026-06-20)

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
- [ ] **4.1.1** 升级 `react` / `react-dom` 到 `^19.2.7`
- [ ] **4.1.2** 升级相关依赖:
  - `@types/react`: `^18.3.12` → `^19.x`
  - `@types/react-dom`: `^18.3.1` → `^19.x`
  - `@testing-library/react`: `^16.1.0` → `^19.x`
  - `@testing-library/user-event`: `^14.5.0` → `^14.6.x`
  - `react-router-dom`: `^6.28.0` → `^7.x` (依赖 React 19)
- [ ] **4.1.3** 检查所有 `forwardRef` 用法 → 改为 `ref` 直接作 prop (React 19 默认)
- [ ] **4.1.4** 检查 `useFormState` / `useFormStatus` 用法
- [ ] **4.1.5** 检查 `useEffect` cleanup 行为变化
- [ ] **4.1.6** 跑全套测试 + build

### 4.2 Framer Motion 11 → 12
- [ ] **4.2.1** 升级 `framer-motion` 到 `^12.40.0`
- [ ] **4.2.2** 检查 `motion` props API 变化
- [ ] **4.2.3** 检查 `AnimatePresence` 用法
- [ ] **4.2.4** 检查 `useMotionValue` / `useTransform` / `useSpring`
- [ ] **4.2.5** 视觉回归测试 (RouteTransition, StaggerList, FadeIn, Pressable)

### 4.3 第二批验证
- [ ] 所有路由切换动画正常
- [ ] 表单提交、对话框、抽屉正常
- [ ] 拖拽交互 (DesignMode, DragList) 正常
- [ ] 移动端响应式正常 (mobile-first layout)

---

## 5. 第三批: 重活 (强烈建议单独立项)

> **风险等级**: 🔴 高
> **预估工作量**: 1-2 周
> **前置条件**: 第二批完成并稳定运行 ≥ 1 周
> **建议**: 每个子项单独 PR, 独立验证

### 5.1 Tailwind CSS 3 → 4
- [ ] **5.1.1** 升级 `tailwindcss` 到 `^4.3.1`
- [ ] **5.1.2** 安装新 PostCSS 插件: `@tailwindcss/postcss`
- [ ] **5.1.3** **删除** `tailwind.config.js`
- [ ] **5.1.4** 迁移主题配置到 CSS 文件 (`src/styles/index.css`):
  ```css
  @import "tailwindcss";
  @theme {
    --color-primary: ...;
    --font-sans: ...;
  }
  ```
- [ ] **5.1.5** 改 `postcss.config.js`:
  ```js
  module.exports = {
    plugins: { '@tailwindcss/postcss': {} }
  }
  ```
- [ ] **5.1.6** 检查所有 `@apply` 语法 (部分 v3 用法 v4 不支持)
- [ ] **5.1.7** 检查所有自定义 class 命名约定 (v4 默认排除)
- [ ] **5.1.8** 检查 dark mode 配置 (v4 改用 `@variant dark (...)`)
- [ ] **5.1.9** 视觉回归测试 — 所有页面
- [ ] **5.1.10** Storybook 重新跑: `pnpm storybook`

### 5.2 Three.js 0.160 → 0.184 (分两次)
- [ ] **5.2.1** 第一阶段: 0.160 → 0.170
  - 升级 `three` 到 `^0.170.0`
  - 升级 `@react-three/fiber` 到对应版本
  - 升级 `@react-three/drei` 到对应版本
  - 跑 AronaModel/ClassroomScene 验证
- [ ] **5.2.2** 第二阶段: 0.170 → 0.184
  - 升级 `three` 到 `^0.184.0`
  - 同步升级 R3F + drei
  - 跑 AronaModel/ClassroomScene 验证
  - 性能基准对比 (FPS, 内存)
- [ ] **5.2.3** 视觉回归 + 性能回归
- [ ] **5.2.4** 更新 Three.js 文档/API 注释

### 5.3 Vite 5 → 8 (慎重考虑)
- [ ] **5.3.1** **决策点**: 是否真的需要 Vite 8?
  - 当前 Vite 5.4 已支持所有用到的功能
  - 升 Vite 8 必须经过 v6 (SSR API 改) + v7 (砍 legacy) + v8
  - Tauri v2 CLI 对 Vite 8 的支持还在跟进
- [ ] **5.3.2** (如决定升) 升级到 Vite 6:
  - 处理 SSR API breaking
  - 处理 `import.meta.url` 行为变化
- [ ] **5.3.3** 升级到 Vite 7:
  - 处理 legacy module graph 移除
  - 处理 css.devSourcemap 配置
- [ ] **5.3.4** 升级到 Vite 8:
  - 处理 build target 默认值变化
  - 处理 HMR API 改
- [ ] **5.3.5** 验证 Tauri `beforeDevCommand` / `beforeBuildCommand` 路径
- [ ] **5.3.6** 验证生产构建产物体积、构建时间

---

## 6. 不要做的事

| ❌ 不要 | 原因 |
|---|---|
| **Tauri v3** | 还在 alpha/beta, 2026 Q3 才 stable, 你 v3 monorepo 够用 |
| **Vite 一锅跳 8** | 中间 v6/v7 两次 breaking, 没意义地做两遍工 |
| **Three.js 一次跳 25 minor** | API surface 太大, 容易出回归 |
| **批量混合升级** | 出问题难定位, 必须分批 |
| **跳过视觉回归** | 3D / 动画 / 主题类升级必须看效果 |
| **生产环境 hot upgrade** | 必须本地 dev 充分测试, 走 PR + CI 流程 |

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

| 批次 | 工作量 | 建议时机 |
|---|---|---|
| 第一批 | 10 分钟 + CI 验证 | 立即 |
| 第二批 | 1-2 天 | 下个 sprint |
| 第三批 | 1-2 周 | 单独立项, 不混入功能 sprint |

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

