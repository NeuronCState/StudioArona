# 前端 A Runbook

> 维护者: 前端 A | 最后更新: 2026-05-21
> 适用版本: `apps/web` (Vite + React 18 + TypeScript)

---

## 1. 快速诊断

### 1.1 白屏 / 无法加载

**症状**: 浏览器空白页，无任何内容渲染。

**诊断步骤**:

1. **检查 Vite dev server 是否运行**
   ```bash
   pnpm --filter web dev
   ```
   预期输出包含 `Local: http://localhost:5173/`。如果端口被占用，`vite.config.ts` 中 `server.port` 默认为 5173。

2. **检查浏览器 Console 是否有 JS 错误**
   - 打开 Chrome DevTools → Console
   - 重点关注: `Uncaught TypeError`, `Failed to fetch`, `Module not found`
   - 如果看到 `import.meta.env.DEV` 相关错误，说明 Vite 未正确处理环境变量，重启 dev server。

3. **检查 Network 面板**
   - DevTools → Network → 刷新页面
   - 关键请求检查:

   | 请求 | 预期状态 | 异常含义 |
   |------|---------|---------|
   | `GET /` | 200 | Vite dev server 正常 |
   | `POST /api/auth/login` | 200 (含 token) | 登录正常；**若 401** → 用户名或密码错误；**若 500** → 后端/API gateway 未运行 |
   | `GET /src/main.tsx` | 200 | Vite 模块加载正常 |

4. **检查 MSW 是否启动**
   - 打开 Console，确认存在日志: `[MSW] Mocking enabled.`
   - 如果没有此日志，说明 MSW Service Worker 未注册成功 → 参考 2.1 节。

5. **检查 API 代理**
   - `vite.config.ts` 中配置了 `/api` → `http://localhost:8080` 的代理。
   - 如果后端未启动，所有 `/api/*` 请求会返回 502/504，同时 MSW 拦截会失效（因为 MSW 拦截的是浏览器 fetch，不会阻止代理转发）。
   - 在 MSW 开发模式下，所有 `/api/*` 请求应该由 MSW 在浏览器端拦截，不应到达 Vite proxy。

### 1.2 登录失败

**症状**: 登录页面输入凭据后反复回到登录页，或出现 "Invalid credentials" 提示。

**诊断步骤**:

1. **确认 MSW mock 运行中**
   - 开发模式下 `main.tsx` 中的 `enableMocking()` 自动启动 MSW。
   - 生产环境不使用 MSW，需要真实后端。

2. **确认用户名密码**
   - Mock 用户数据定义在 `src/mocks/data/users.ts`。
   - 可用凭据（密码统一为 `demo`）:
     - `zhang` / `demo`
     - `li` / `demo`
     - `wang` / `demo`

3. **检查 localStorage**
   在 Console 中执行:
   ```js
   JSON.parse(localStorage.getItem('javis-auth'))
   ```
   正常结构:
   ```json
   {
     "state": {
       "accessToken": "mock-jwt-u_zhang",
       "refreshToken": "mock-refresh-u_zhang",
       "user": { "id": "u_zhang", "username": "zhang", ... },
       "isAuthenticated": true
     },
     "version": 0
   }
   ```
   - 如果 `accessToken` 为 `null` → token 未写入，检查 Network 中 `/api/auth/login` 的 response。
   - 如果整个 key 不存在 → localStorage 被清除或浏览器处于隐私模式。

4. **检查 Zustand persist 是否正常**
   - `useAuthStore` 使用 `zustand/middleware/persist`，持久化 key 为 `javis-auth`。
   - `App.tsx` 中通过 `useAuthStore((s) => s.isAuthenticated)` 守卫路由。
   - 未认证时渲染 `<LoginPage />`，认证后渲染 `<AppShell>` 包裹的路由。

### 1.3 对话页无响应

**症状**: 进入对话页后输入消息无响应，或消息发不出去。

**诊断步骤**:

1. **检查 Zustand session store 状态**
   - `wakeState` 应为 `active`，`currentSessionId` 应非空。
   - `wakeState` 四个状态: `idle` → `waking` → `active` → `leaving`。
   - `ChatPage` 在 `wakeState === 'active'` 或已注册用户且 `wakeState === 'idle'` 时进入对话模式。
   - 如果 `wakeState` 不是 `active` 且用户也未登录 → 只渲染 `DashboardCards`。
   - 可以通过 React DevTools 查看 `useSessionStore` 的状态，或在 Console 中调用 `window.__ZUSTAND_DEVTOOLS__` (如果启用了 Zustand devtools)。

2. **检查 session 是否创建成功**
   - Network 中查找 `POST /api/chat/sessions`，预期返回 201。
   - ChatPage 在 `isChatMode && !currentSessionId` 时会自动调用此接口创建会话。
   - 如果返回 4xx/5xx → 检查 MSW handler 是否正常拦截此路由 (`handlers.ts` 第 47-53 行)。

3. **检查 SSE 连接**
   - Network 中查找 `POST /api/chat/sessions/{id}/messages`。
   - 该请求的 Content-Type 应为 `text/event-stream`。
   - MSW 环境下该请求会被 `handlers.ts` 中的 SSE mock 拦截，返回模拟的事件流。
   - MSW Handler 发送的 SSE 事件序列:
     ```
     event: session_started → tool_call → tool_result → token (逐字, 每 30ms 一个) → done
     ```
   - 如果请求一直 pending 且没有事件返回 → MSW handler 的 SSE mock 可能有问题（`ReadableStream` 不兼容）。

4. **检查 SSE 客户端实现**
   - `src/lib/sse-client.ts` 中 `createSSEConnection` 使用 `fetch` + `ReadableStream` reader 解析 SSE。
   - `src/hooks/useChatStream.ts` 中 `useChatStream` 处理 6 种 SSE 事件: `token`, `tool_call`, `tool_result`, `ui_action`, `done`, `error`。
   - 如果只看到用户消息但无助手回复 → 检查 SSE 流事件是否正确分发。

### 1.4 页面数据为空

**症状**: Feeds 页、VM 页、System 页等表格/卡片无数据。

**诊断步骤**:

1. **检查 MSW handlers 是否正确拦截**
   - 确认请求路径与 handler 定义的路径完全一致。
   - 路径速查:

   | 页面 | API |
   |------|-----|
   | Feeds | `GET /api/feeds` |
   | VM | `GET /api/vms` |
   | System | `GET /api/system/metrics` |
   | Schedules | `GET /api/schedules` |
   | Network | `GET /api/network/devices` |

2. **检查 TanStack Query 状态**
   - 打开 React Query DevTools 查看对应 query 是否处于 `error` 状态。
   - 常见原因: `staleTime: 30_000`（30 秒内不会重新请求），如果数据为空可能是首次加载失败且未自动重试（`retry: 1`）。
   - 如果 query 处于 `loading` 状态超过 5 秒 → 网络问题或 handler 未响应。

3. **检查 Authorization header**
   - `ApiClient` (`src/lib/api/client.ts`) 在每次请求时从 `useAuthStore.getState().accessToken` 读取 token。
   - 如果 token 为 null（未登录），请求仍会发出但没有 `Authorization` header。
   - MSW 暂未校验 token（mock 阶段），但生产环境需要。

---

## 2. 常见问题修复

### 2.1 MSW 未启动

**问题**: 开发模式下页面白屏，所有 API 请求返回代理错误 (502/504)，Console 中无 `[MSW] Mocking enabled.` 日志。

**原因与修复**:

1. **确认 `enableMocking()` 被调用**
   - 检查 `src/main.tsx`，确认以下代码存在且未被注释:
     ```ts
     async function enableMocking() {
       if (import.meta.env.DEV) {
         const { worker } = await import('./mocks/browser');
         return worker.start({ onUnhandledRequest: 'bypass' });
       }
     }
     enableMocking().then(() => { /* render */ });
     ```
   - `import.meta.env.DEV` 由 Vite 注入，只在 `vite dev` 时为 `true`。
   - `vite preview` 或生产构建中此值为 `false`，MSW 不会启动。

2. **清除浏览器 Service Worker**
   - Chrome DevTools → Application → Service Workers → 找到 MSW worker → 点击 Unregister。
   - 或在 Console 中执行:
     ```js
     navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
     ```
   - 刷新页面后 MSW 会重新注册。

3. **检查 Service Worker 注册错误**
   - Console 中是否有 `Failed to register service worker` 错误。
   - 常见原因: 浏览器隐私模式禁用了 Service Worker、`mockServiceWorker.js` 文件路径不对。
   - 开发模式下 MSW worker 脚本由 `msw` 库内置生成，不需要额外配置 public 目录。
   - MSW v2 使用 `setupWorker` (来自 `msw/browser`)，无需手动复制 worker 脚本。

4. **检查 `onUnhandledRequest` 设置**
   - 当前配置为 `bypass`，未拦截的请求会透传到真实网络。
   - 如果后端未启动且 MSW 未拦截某条 `/api/*` 请求，该请求会触发 Vite proxy 转发到 `localhost:8080` 导致 502/504。
   - 可临时改为 `warn` 查看哪些请求未被 MSW 拦截:
     ```ts
     worker.start({ onUnhandledRequest: 'warn' })
     ```

### 2.2 Tailwind 样式失效

**问题**: 页面无样式或组件样式异常，看起来像纯 HTML。

**诊断步骤**:

1. **确认 Tailwind content 路径**
   - `tailwind.config.ts` 中:
     ```ts
     content: ["./index.html", "./src/**/*.{ts,tsx}"]
     ```
   - 路径基于 `apps/web/` 目录。
   - 如果新增了组件目录不在 `src/` 下，需手动添加到 `content` 数组。

2. **确认 PostCSS 配置**
   - `postcss.config.js` 需包含:
     ```js
     export default {
       plugins: {
         tailwindcss: {},
         autoprefixer: {},
       },
     };
     ```
   - 缺少此文件或插件配置错误会导致 Tailwind 类名不生成 CSS。

3. **检查构建产物**
   ```bash
   pnpm --filter web build
   ```
   - 检查 `dist/assets/` 下的 CSS 文件大小（应 > 10KB）。
   - 如果 CSS 文件极小（< 1KB），说明 Tailwind 没有扫描到使用的类名。

4. **检查 globals.css**
   - `src/styles/globals.css` 应包含 Tailwind 指令:
     ```css
     @tailwind base;
     @tailwind components;
     @tailwind utilities;
     ```

5. **检查自定义颜色类名**
   - Tailwind 配置中定义了自定义颜色 `accent`, `surface`, `border`, `text`。
   - 使用这些颜色时类名为 `bg-accent`, `text-text-primary`, `border-border` 等。
   - 如果自定义颜色不生效 → 确认 `tailwind.config.ts` 中 `theme.extend.colors` 配置正确且未被覆盖。

6. **暗色模式检查**
   - Tailwind 配置 `darkMode: "class"`。
   - 暗色模式通过给 `<html>` 添加 `class="dark"` 切换。
   - 检查 `useTheme` hook (`src/hooks/useTheme.ts`) 是否正确管理此 class。
   - 手动测试: `document.documentElement.classList.toggle('dark')`。

### 2.3 构建失败

**诊断步骤**:

1. **TypeScript 类型检查**
   ```bash
   pnpm --filter web typecheck
   ```
   - 等价于 `tsc --noEmit`。
   - 依赖 `packages/contracts` 中的共享类型 (`@/types/contracts.ts` 引用了 shared types)。
   - 如果 contracts 包未构建，需要先 `pnpm --filter contracts build`。

2. **ESLint 检查**
   ```bash
   pnpm --filter web lint
   ```
   - 检查范围为 `src/**/*.{ts,tsx}`。

3. **Stylelint 检查**
   ```bash
   pnpm --filter web lint:style
   ```

4. **检查 Vite resolve.alias**
   - `vite.config.ts` 和 `vitest.config.ts` 都配置了:
     ```ts
     alias: { "@": path.resolve(__dirname, "./src") }
     ```
   - TS 的 `tsconfig.json` 中也需要对应的 `paths` 配置以支持 IDE 跳转。

5. **检查依赖版本**
   - 如果构建报 `RollupError` 或模块找不到:
     ```bash
     pnpm install --frozen-lockfile
     ```

6. **构建产物检查**
   - 成功构建后在 `dist/` 目录下应有:
     ```
     dist/
       index.html
       assets/
         vendor-*.js     (~140KB, react/react-dom/react-router-dom)
         motion-*.js     (~40KB, framer-motion)
         markdown-*.js   (~80KB, react-markdown 系列)
         xterm-*.js       (~150KB, xterm + addon-fit)
         index-*.js       (~218KB, 主应用逻辑)
         index-*.css
     ```
   - 共 5 个 JS chunk + 1 个 CSS chunk（`vite.config.ts` 中定义了 4 个 `manualChunks`，加上主入口和 CSS）。

### 2.4 路由 404

**问题**: Nginx 部署后直接访问 `/vms` 或 `/system` 返回 404。

**原因与修复**:

1. **确认 Nginx 有 SPA fallback**
   - `infra/docker/nginx.conf` 中:
     ```nginx
     location / {
         try_files $uri $uri/ /index.html;
     }
     ```
   - 这个配置使所有非静态文件请求回退到 `index.html`，由 React Router 处理。

2. **确认 Route 与 NavLink 一致**
   - `App.tsx` 路由定义:
     | Path | 组件 |
     |------|------|
     | `/` | `ChatPage` |
     | `/me/feeds` | `FeedsPage` |
     | `/shared` | `SharedPage` |
     | `/vms` | `VmsPage` |
     | `/system` | `SystemPage` |
   - `Sidebar.tsx` 导航项 `to` 属性必须与 Route `path` 完全一致。
   - 注意: `/me/feeds` 不是 `/feeds`。

3. **检查 BrowserRouter 基线**
   - `main.tsx` 使用了 `<BrowserRouter>`。
   - 如果改为 `HashRouter` 则不需要 Nginx fallback，但当前架构使用 `BrowserRouter`，生产环境必须有 fallback 配置。

### 2.5 WebSocket 连接失败

**问题**: Console 中有 WebSocket 连接错误，实时推送不工作。

**诊断**:

1. **检查事件总线连接**
   - `src/lib/event-bus.ts` 中 `EventBus.connect()` 连接 `ws://<host>/ws/events`。
   - 断开后 3 秒自动重连 (`reconnectTimer`)。
   - 开发环境: Vite proxy 配置了 `/ws` → `ws://localhost:8080`。
   - 生产环境: Nginx 配置了 `/ws/` location 的反代。

2. **Nginx WS 配置检查**
   ```nginx
   location /ws/ {
       proxy_pass http://api-gateway:8000;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
       proxy_read_timeout 3600s;
   }
   ```
   - 缺少 `Upgrade` 和 `Connection` header 会导致 WebSocket 无法建立。

### 2.6 暗黑模式切换异常

**问题**: 主题切换按钮无效，或切换后部分组件颜色不正确。

**诊断**:

1. 检查 `<html>` 元素是否有 `class="dark"`。
2. `TopBar` 中的主题按钮调用 `useTheme` hook 的 `toggle()` 方法。
3. Tailwind 暗色模式依赖 `darkMode: "class"`，所有 `dark:` 前缀的类名只在 `<html class="dark">` 时生效。
4. CSS 变量定义在 `:root` 和 `.dark` 下，手动切换测试:
   ```js
   document.documentElement.classList.toggle('dark')
   ```

---

## 3. 测试运行

### 3.1 单元 / 集成测试 (Vitest)

| 命令 | 说明 |
|------|------|
| `pnpm --filter web test` | 运行全部 Vitest 用例 |
| `pnpm --filter web test:watch` | 监听模式，文件变更自动重跑 |
| `pnpm --filter web test:coverage` | 运行并生成覆盖率报告 (text + json + html) |

**测试配置** (`vitest.config.ts`):
- 测试文件匹配: `src/**/*.{test,spec}.{ts,tsx}`
- 环境: `jsdom`
- Setup: `src/test/setup.ts` (注册 MSW Node server + `@testing-library/jest-dom`)
- 覆盖率: v8 provider, 输出 text/json/html

**现有测试文件 (11 个)**:

| 文件 | 覆盖范围 |
|------|---------|
| `src/pages/chat/ChatPage.test.tsx` | ChatPage 渲染与交互 |
| `src/pages/feeds/FeedsPage.test.tsx` | Feeds 页面 |
| `src/pages/shared/SharedPage.test.tsx` | Shared 页面 |
| `src/pages/system/SystemPage.test.tsx` | 系统指标页面 |
| `src/pages/vms/VmsPage.test.tsx` | VM 管理页面 |
| `src/stores/auth.test.ts` | Auth store 与 persist |
| `src/stores/session.test.ts` | Session store 状态机 |
| `src/stores/ui.test.ts` | Toast 通知 |
| `src/lib/api/client.test.ts` | API 客户端 |
| `src/lib/utils.test.ts` | 工具函数 |
| `src/hooks/useTheme.test.ts` | 主题切换 |

**测试失败常见原因排查**:

| 错误 | 原因 | 修复 |
|------|------|------|
| `ReferenceError: document is not defined` | 测试环境未配置 jsdom | 确认 `vitest.config.ts` 中 `environment: "jsdom"` |
| `Network request failed` | MSW Node server 未启动 | 确认 `src/test/setup.ts` 中 `beforeAll(() => server.listen(...))` |
| `TypeError: Cannot read properties of undefined` | Mock data 不完整 | 检查 `src/mocks/data/*.ts` 中的 mock 数据结构 |
| `expect(...).toBeInTheDocument is not a function` | jest-dom matchers 未注册 | 确认 setup 文件包含 `import '@testing-library/jest-dom'` |

### 3.2 E2E 测试 (Playwright)

| 命令 | 说明 |
|------|------|
| `pnpm --filter web e2e` | 运行全部 E2E spec (Chromium, headless) |
| `pnpm --filter web e2e --ui` | 可视化交互模式，逐步执行 |
| `pnpm --filter web e2e --update-snapshots` | 更新视觉回归的基准截图 |

**Playwright 配置** (`playwright.config.ts`):
- 测试目录: `tests/A/e2e/`
- 基地址: `http://localhost:5173`
- 浏览器: Chromium (Desktop Chrome)
- Web server: 自动启动 `pnpm dev` (非 CI 模式复用已有 server)
- CI 模式: 1 worker，重试 2 次
- 视觉回归: `maxDiffPixelRatio: 0.01`
- Trace: `on-first-retry`

**E2E Spec (4 个)**:

| Spec | 覆盖内容 |
|------|---------|
| `app.spec.ts` | 应用主要流程: 登录 → 对话 → 导航 |
| `feeds-vm.spec.ts` | Feeds 和 VM 页面的 CRUD 操作 |
| `accessibility.spec.ts` | axe-core 可访问性自动扫描 |
| `visual.spec.ts` | 视觉回归: 各页面截屏对比 |

**E2E 首次运行**:
```bash
# 安装 Playwright 浏览器（仅首次）
npx playwright install chromium

# 生成基线截图
pnpm --filter web e2e --update-snapshots

# 后续运行会对比基线
pnpm --filter web e2e
```

### 3.3 可访问性测试

- Playwright E2E 中 `accessibility.spec.ts` 使用 `@axe-core/playwright` 自动扫描。
- 手动检查: Chrome DevTools → Lighthouse → 勾选 Accessibility → Generate report。
- Lighthouse CI 配置中 `categories:accessibility` 最低分 0.9。

### 3.4 Storybook

| 命令 | 说明 |
|------|------|
| `pnpm --filter web storybook` | 启动 Storybook 开发服务器 (端口 6006) |
| `pnpm --filter web storybook:build` | 构建静态 Storybook |
| `npx chromatic --project-token <token>` | 发布到 Chromatic 进行视觉审查 |

现有 Stories:
- `ChatBubble.stories.tsx` - 对话气泡组件
- `ToastContainer.stories.tsx` - Toast 通知组件

---

## 4. 性能基线

### 4.1 Core Web Vitals 目标

| 指标 | 目标 (Lighthouse) | CI 断言 | 当前状态 |
|------|-------------------|---------|---------|
| LCP (Largest Contentful Paint) | < 2.0s | `error` <= 2000ms | 待 LH CI 实测 |
| FCP (First Contentful Paint) | < 2.0s | `warn` <= 2000ms | 待实测 |
| CLS (Cumulative Layout Shift) | < 0.1 | `error` <= 0.1 | 待实测 |
| TBT (Total Blocking Time) | < 300ms | `warn` <= 300ms | 待实测 |

Lighthouse CI 配置 (`apps/web/lighthouserc.cjs`):
```js
{
  collect: {
    url: ['/', '/me/feeds', '/system'],
    numberOfRuns: 3,
    startServerCommand: 'pnpm preview',
    startServerReadyPattern: 'Local:',
  },
  assert: {
    'categories:performance': ['error', { minScore: 0.8 }],
    'categories:accessibility': ['error', { minScore: 0.9 }],
    'categories:best-practices': ['error', { minScore: 0.85 }],
    'largest-contentful-paint': ['error', { maxNumericValue: 2000 }],
    'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
  },
}
```

### 4.2 构建产物

| Chunk | 内容 | 预估大小 |
|-------|------|---------|
| vendor | react, react-dom, react-router-dom | ~140KB gzip |
| motion | framer-motion | ~40KB gzip |
| markdown | react-markdown, remark-gfm, rehype-highlight | ~80KB gzip |
| xterm | xterm, @xterm/addon-fit | ~150KB gzip |
| index (主包) | 主应用逻辑 | ~218KB gzip |
| CSS | Tailwind 生成的样式 | 取决于实际使用的类名 |

### 4.3 运行时优化

| 策略 | 当前实现 |
|------|---------|
| 路由级代码分割 | `manualChunks` 将 vendor/motion/markdown/xterm 分离为独立 chunk |
| TanStack Query 缓存 | `staleTime: 30s`，`retry: 1`，窗口聚焦不重新请求 |
| MSW 延迟模拟 | handlers 中 `delay(100-300ms)` 模拟真实网络延迟 |
| 字体 | Inter, Noto Sans SC (Google Fonts), JetBrains Mono (等宽) |
| Nginx 静态资源缓存 | `/assets/` 配置 `expires 1y; Cache-Control: public, immutable` |
| Nginx Gzip | 开启并覆盖 js/css/json/svg 等类型 |

---

## 5. 部署检查清单

### 5.1 构建前检查

- [ ] `pnpm --filter web typecheck` 通过（零 TS 错误）
- [ ] `pnpm --filter web lint` 通过（零 ESLint 错误）
- [ ] `pnpm --filter web test` 通过（全部 11 个用例）
- [ ] 检查 `packages/contracts` 已正确链接（类型依赖）

### 5.2 构建

```bash
pnpm --filter web build
```

验证 `apps/web/dist/` 包含:
- [ ] `index.html` 存在且包含 `<script>` 标签引用 assets
- [ ] `assets/` 目录下有 JS 和 CSS 文件
- [ ] `assets/index-*.css` 文件大小 > 10KB（确保 Tailwind 正确提取）
- [ ] 共 5 个 JS chunk + 1 个 CSS chunk

### 5.3 Docker 构建与运行

```bash
# 构建 Docker 镜像 (multi-stage: node:22-alpine builder → nginx:1.27-alpine runner)
docker build -f infra/docker/Dockerfile.web -t studio-javis/web:dev .

# 本地验证
docker run --rm -p 8080:80 studio-javis/web:dev
# 访问 http://localhost:8080
```

**Dockerfile 关键点**:
- Stage 1 (builder): 使用 `node:22-alpine`，复制 monorepo 依赖文件，`pnpm install --frozen-lockfile`，`pnpm --filter web build`。
- Stage 2 (runner): 使用 `nginx:1.27-alpine`，复制 dist + nginx.conf。
- Healthcheck: `wget -q localhost:80` 每 30s 检查一次。

### 5.4 Nginx 配置验证

关键配置项检查 (`infra/docker/nginx.conf`):

- [ ] SSE 代理正确: `proxy_buffering off;` `proxy_cache off;` `proxy_read_timeout 3600s;`
- [ ] WebSocket 代理正确: `proxy_set_header Upgrade $http_upgrade;` `proxy_set_header Connection "upgrade";`
- [ ] Gzip 开启: `gzip on;` `gzip_types` 包含 `text/css application/json application/javascript text/xml`
- [ ] SPA fallback: `try_files $uri $uri/ /index.html;`
- [ ] 静态资源长期缓存: `location /assets/` 配置 `expires 1y; Cache-Control public, immutable`
- [ ] 安全头: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`

### 5.5 生产环境验证

- [ ] `http://<ubuntu-ip>` 可正常加载登录页
- [ ] 登录后成功进入对话页，Sidebar 显示 5 个导航项
- [ ] 静态资源 `/assets/` 返回 200 + `Cache-Control: public, immutable`
- [ ] 直接访问 `/vms` 不返回 404（SPA fallback 生效）
- [ ] SSE 连接正常（对话页发送消息后有逐字输出效果）
- [ ] WebSocket `/ws/events` 连接状态正常
- [ ] API 反代 `/api/` 请求正常转发到 api-gateway:8000

---

## 6. 目录速查

### 6.1 源码目录 (`apps/web/src/`)

| 目录 / 文件 | 说明 |
|------------|------|
| `App.tsx` | 根组件，路由定义 + 认证守卫 |
| `main.tsx` | 入口文件，MSW 启动 + React Query Provider + BrowserRouter |
| `pages/chat/` | 对话页: ChatPage, ChatBubble, ChatInput, DashboardCards, FaceTrackOverlay |
| `pages/feeds/` | 信息源订阅管理页 (FeedsPage) |
| `pages/shared/` | 共享页，日程与协作 (SharedPage) |
| `pages/vms/` | 虚拟机管理页 (VmsPage) |
| `pages/system/` | 系统硬件监控页 (SystemPage) |
| `pages/login/` | 登录页 (LoginPage) |
| `components/layout/` | AppShell, Sidebar, TopBar — 应用壳布局 |
| `components/ui/` | ScrollToBottom, ToastContainer — 通用 UI 组件 |
| `components/wake/` | WakeOverlay, LeaveCountdown — 唤醒/离开动画 |
| `features/chat/` | Chat 功能模块 |
| `features/feeds/` | Feeds 功能模块 |
| `features/schedule/` | 日程功能模块 |
| `features/system/` | 系统监控功能模块 |
| `features/vm/` | VM 管理功能模块 |
| `hooks/` | useChatStream, useTheme, useWakeEvents |
| `styles/` | globals.css (Tailwind 入口) |

### 6.2 Lib (`apps/web/src/lib/`)

| 文件 | 说明 |
|------|------|
| `api/client.ts` | API 客户端 (ApiClient class)，自动附加 Bearer token，401 自动 logout |
| `api/client.test.ts` | API 客户端测试 |
| `auth/` | 认证相关工具函数 |
| `sse/` | SSE 事件流底层工具 |
| `ws/` | WebSocket 底层工具 |
| `sse-client.ts` | SSE 连接创建 (`createSSEConnection`)，解析 text/event-stream 格式 |
| `event-bus.ts` | WebSocket 事件总线 (EventBus)，自动重连 (3s 间隔) |
| `ui-actions.ts` | UI Action 分发器 (dispatchUIAction)，支持 navigate/toast/highlight/render_card/clear_session/confirm |
| `utils.ts` | `cn()` 函数 (clsx + tailwind-merge) |
| `utils.test.ts` | utils 单元测试 |

### 6.3 Store (`apps/web/src/stores/`)

| 文件 | Store Hook | 持久化 | 关键字段 |
|------|-----------|--------|---------|
| `auth.ts` | `useAuthStore` | localStorage (`javis-auth`) | accessToken, refreshToken, user, isAuthenticated, login(), logout() |
| `auth.test.ts` | — | — | Auth store 与 persist 行为测试 |
| `session.ts` | `useSessionStore` | 无（运行时状态） | wakeState ('idle'\|'waking'\|'active'\|'leaving'), currentSessionId, sidebarCollapsed |
| `session.test.ts` | — | — | Session store 状态机测试 |
| `ui.ts` | `useUIStore` | 无（运行时状态） | toasts (Toast[]，4 秒自动消失), addToast(), removeToast() |
| `ui.test.ts` | — | — | Toast 增删与自动消失测试 |

### 6.4 Mock (`apps/web/src/mocks/`)

| 文件 | 说明 |
|------|------|
| `handlers.ts` | MSW 请求处理器 (Auth / Chat Sessions / SSE / Feeds / Schedules / System Metrics / VMs / Network) |
| `browser.ts` | 浏览器端 MSW worker 初始化 (`setupWorker`) |
| `node.ts` | Node 端 MSW server (`setupServer`)，用于 Vitest 集成测试 |
| `data/users.ts` | Mock 用户数据 (zhang, li, wang) |
| `data/feeds.ts` | Mock Feeds 数据 |
| `data/schedules.ts` | Mock 日程数据 |
| `data/system.ts` | Mock 系统指标 (CPU/Mem/Disk/GPU) / VM / 网络设备数据 |

### 6.5 E2E (`apps/web/tests/A/e2e/`)

| 文件 | 说明 |
|------|------|
| `app.spec.ts` | 应用主流程: 登录 → 对话 → 各页面导航 |
| `feeds-vm.spec.ts` | Feeds 和 VM 的增删操作 |
| `accessibility.spec.ts` | axe-core 可访问性自动扫描 |
| `visual.spec.ts` | 视觉回归: 各页面截屏对比基准 |

### 6.6 配置文件

| 文件 | 说明 |
|------|------|
| `apps/web/vite.config.ts` | Vite 配置 (alias `@` → `src/`, proxy `/api` → 8080, proxy `/ws` → ws://8080, 4 manualChunks) |
| `apps/web/vitest.config.ts` | Vitest 配置 (jsdom, v8 coverage, include pattern, setup file) |
| `apps/web/playwright.config.ts` | Playwright 配置 (Chromium, baseURL 5173, CI retry 2, visual maxDiffPixelRatio 0.01) |
| `apps/web/lighthouserc.cjs` | Lighthouse CI 配置 (3 URL × 3 runs, 阈值断言) |
| `apps/web/tailwind.config.ts` | Tailwind 主题 (颜色 accent/surface/border/text, 字体 Inter/Noto Sans SC/JetBrains Mono, 动画 fade-in/slide-up/cursor-blink/rotate-in/rotate-out) |
| `apps/web/postcss.config.js` | PostCSS 插件 (tailwindcss + autoprefixer) |
| `apps/web/eslint.config.js` | ESLint 配置 |
| `apps/web/tsconfig.json` | TypeScript 配置 |
| `apps/web/.storybook/` | Storybook 配置目录 |
| `infra/docker/Dockerfile.web` | Web 前端 Docker 镜像 (multi-stage build) |
| `infra/docker/nginx.conf` | Nginx 配置 (反代 + SSE/WS 代理 + Gzip + SPA fallback + 安全头) |

### 6.7 共享包 (`packages/`)

| 包 | 说明 |
|------|------|
| `packages/contracts/` | 共享类型定义 (从 OpenAPI spec 生成，包含 User/ChatSession/Feed/Schedule/VM/SystemMetrics 等) |
| `packages/ui-kit/` | 共享 UI 组件库 (Badge, Button, Card, EmptyState, Input, RingProgress, chart, chat, layout, markdown, nav) |
| `packages/skills/` | Agent Skills 定义 |

### 6.8 Type 定义 (`apps/web/src/types/`)

| 文件 | 说明 |
|------|------|
| `contracts.ts` | 数据契约类型 (User, ChatSession, ChatMessage, Feed, Schedule, SystemMetrics, VM, NetworkDevice) |
| `ui-actions.ts` | UI Action 类型 (navigate, highlight, render_card, clear_session, toast, confirm) |
| `ws-events.ts` | WebSocket 事件类型 |

---

## 7. 依赖版本速查

| 依赖 | 版本 | 用途 |
|------|------|------|
| react | ^18.3.1 | UI 框架 |
| react-dom | ^18.3.1 | React DOM 渲染 |
| react-router-dom | ^6.28.0 | 客户端路由 |
| @tanstack/react-query | ^5.60.0 | 服务端状态管理与缓存 |
| zustand | ^5.0.0 | 客户端状态管理 (含 persist 中间件) |
| framer-motion | ^11.11.0 | 声明式动画 |
| tailwindcss | ^3.4.14 | CSS 工具类框架 |
| lucide-react | ^0.460.0 | 图标集 |
| xterm | ^5.3.0 | 终端模拟器 |
| @xterm/addon-fit | ^0.11.0 | xterm 自适应插件 |
| react-markdown | ^9.0.1 | Markdown 渲染 |
| remark-gfm | ^4.0.0 | GFM 扩展 (表格/任务列表) |
| rehype-highlight | ^7.0.0 | 代码语法高亮 |
| zod | ^3.23.8 | Schema 校验 |
| react-hook-form | ^7.53.0 | 表单状态管理 |
| @hookform/resolvers | ^5.2.2 | react-hook-form + zod 集成 |
| clsx | ^2.1.1 | 条件类名拼接 |
| tailwind-merge | ^2.5.4 | Tailwind 类名冲突合并 |
| msw | ^2.6.0 | API Mock (开发 + 测试) |
| vitest | ^2.1.4 | 单元/集成测试运行器 |
| @testing-library/react | ^16.1.0 | React 组件测试工具 |
| @testing-library/jest-dom | ^6.6.0 | DOM 断言 matchers |
| @testing-library/user-event | ^14.5.0 | 用户交互模拟 |
| @playwright/test | ^1.48.0 | E2E 测试框架 |
| @axe-core/playwright | ^4.11.3 | 可访问性测试 |
| vite | ^5.4.11 | 构建工具与 dev server |
| @vitejs/plugin-react | ^4.3.4 | Vite React 插件 |
| typescript | ^5.6.3 | 类型系统 |
| eslint | ^9.13.0 | 代码检查 |
| prettier | ^3.3.3 | 代码格式化 |
| jsdom | ^25.0.0 | DOM 模拟环境 (测试用) |

---

## 8. 联系方式与升级路径

### 8.1 问题升级路径

1. **前端自身问题 (本 Runbook 覆盖)** → 按本文档排查。
2. **API / 后端问题** → 参考 Agent B 的 runbook (`docs/runbook/troubleshooting.md`)。
3. **基础设施问题** → 参考 D 的 runbook (`docs/runbook/deployment.md`, `docs/runbook/rollback.md`)。
4. **Perception 服务问题 (人脸识别/跟踪)** → 参考 C 的 runbook (`docs/runbook/perception-service.md`)。
5. **Skills 定义问题** → 参考 `docs/runbook/skill-authoring-guide.md`。
6. **无法定位归属** → 检查 `docs/00_协作总纲与接口契约.md` 确定问题所属模块。

### 8.2 关键文档索引

| 文档 | 路径 |
|------|------|
| 协作总纲与接口契约 | `docs/00_协作总纲与接口契约.md` |
| 前端 A 规划书 | `docs/01_前端A_规划书.md` |
| 前端 A 开发进度 | `docs/A_前端开发进度.md` |
| ADR | `docs/adr/0003-serial-protocol.md` |
| 部署 Runbook | `docs/runbook/deployment.md` |
| 回滚 Runbook | `docs/runbook/rollback.md` |
| 故障排查 Runbook | `docs/runbook/troubleshooting.md` |
| Perception 服务 Runbook | `docs/runbook/perception-service.md` |
| Skills 编写指南 | `docs/runbook/skill-authoring-guide.md` |
| 凭据轮换 Runbook | `docs/runbook/credential-rotation.md` |
