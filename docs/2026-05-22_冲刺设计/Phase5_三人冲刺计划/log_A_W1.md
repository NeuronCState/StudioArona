# 工程师 A · W1 日志

## 本周目标（M5.1 W1）

- [x] grep 盘点现状（`mockItem` / `mockData` / `.catch(() => null)` / `.catch(() => [])`）
- [x] 在 `packages/ui-kit/` 中建三个组件：`CardSkeleton` / `CardError` / `CardEmpty`
- [x] MSW 改造：仅在 `VITE_USE_MSW=1` 时启用，默认走真后端
- [x] 改造页面列表（按优先级）
- [x] 所有 useQuery 处理 isLoading / isError / data empty 三态

---

## 2026-05-22 · Day 1 · 启动 + 全部 W1 任务完成

### 1. 现状盘点

grep 结果：
- `StudioHomePage.tsx:64-67` — 4 处 `.catch(() => null)` / `.catch(() => [])`
- `FeedItemDetail.tsx:12-61` — 1 处 `mockItem` 硬编码

其他文件（FeedsPage, ScheduleTimeline, SchedulePage, MemoryPage, SystemPage, VmsPage, SharedPage, DashboardCards）没有 `.catch` 吞错模式，但部分缺少 isError 处理。

### 2. 三个 UI 组件（packages/ui-kit/）

| 组件 | 文件 | 功能 |
|------|------|------|
| `CardSkeleton` | `packages/ui-kit/src/components/CardSkeleton.tsx` | 5 种 variant（list / grid / detail / stats / compact），可配置 count |
| `CardError` | `packages/ui-kit/src/components/CardError.tsx` | 错误消息 + 重试按钮，红色警告风格 |
| `CardEmpty` | `packages/ui-kit/src/components/CardEmpty.tsx` | 空状态提示 + CTA 按钮，虚线边框风格 |

已在 `packages/ui-kit/src/index.ts` 中注册导出。

### 3. MSW 改造

文件：`apps/web/src/main.tsx`

```diff
- if (import.meta.env.DEV) {
+ if (import.meta.env.VITE_USE_MSW === '1') {
```

开发时默认不走 MSW，所有请求打到真后端。需要 mock 时设置 `VITE_USE_MSW=1`。

### 4. 页面改造完成情况

| 页面 | 状态 | 改造内容 |
|------|------|----------|
| `StudioHomePage.tsx` | ✅ 完成 | 移除 `mockSchedule`/`mockRSS` 常量 + 4 处 `.catch()` 吞错；所有查询三态化；数据通过 adapter 函数映射到 Tile props |
| `FeedItemDetail.tsx` | ✅ 完成 | 移除 `mockItem`；改用 `useQuery` 获取 `/feeds/${feedId}`；三态覆盖 |
| `FeedsPage.tsx` | ✅ 完成 | 添加 `isError` 处理 + `CardError` |
| `ScheduleTimeline.tsx` | ✅ 已有 | 已有三态处理（isLoading / isError / empty），无需改动 |
| `SchedulePage.tsx` | ✅ 完成 | 添加 `isError` 处理 + `CardError` |
| `MemoryPage.tsx` | ✅ 完成 | 添加 `isError` 处理 + `CardError` |
| `SystemPage.tsx` | ✅ 完成 | 轮询改为 visibilitychange gated（Tab 隐藏时 `refetchInterval: false`）；添加 `isError` + `CardError` |
| `VmsPage.tsx` | ✅ 完成 | 添加 `isError` + `CardError`；空状态改用 `CardEmpty` |
| `SharedPage.tsx` | ✅ 完成 | 添加 `isLoading`/`isError` 处理；空状态改用 `CardEmpty` |
| `DashboardCards.tsx` | ✅ 完成 | 全部三个卡片区域（日程/RSS/系统状态）添加独立的 isLoading/isError 三态处理 |

### 5. 自检

```bash
# grep 验证 — 页面目录零匹配
grep -rn "\.catch(() => null)\|\.catch(() => \[\])\|mockItem\|mockData" apps/web/src/pages --include="*.ts" --include="*.tsx"
# 输出：(none) ✅
```

### 6. 注意事项 / 待跟进

- **WeatherTile** 仍使用硬编码数据（`city="Beijing"` 等），因为目前 API 没有 `/weather` 端点。此组件不在本次改造范围内，由 M5.2 或后续阶段处理。
- **FeedItemDetail** 调用 `/feeds/${feedId}` 端点，但 Feed 类型（订阅源）不包含文章 summary/body。B 需要在后端补充 feed items 端点或扩展 Feed 模型。
- `CardEmpty` 的 CTA 在 `StudioHomePage.tsx` 中使用空函数占位（`onCta={() => { /* navigate */ }}`），后续可集成路由跳转。
- `.env.example` 未存在，MSW 开关说明已写在 `main.tsx` 注释中。

---

## 下周计划（W2）

- 与 B 协商确认 Feed 详情端点
- 与 C 协商 visibility hook 位置（是放在 lib/motion/ 还是公共 lib/）
- 编写数据三态 e2e 用例
- Storybook 覆盖 CardSkeleton / CardError / CardEmpty

---

## W2（M5.1 收尾）

### E2E 数据三态测试
- 创建 `tests/A/e2e/data-states.spec.ts`：loading/error/empty/retry 四场景

### API 类型检查
- api.ts 是通用 fetch wrapper，无需改动
- 发现 gap：FeedItemDetail 调 GET /feeds/${feedId}，OpenAPI 仅 DELETE（后续添加 GET）

### DoD 验证
- grep 零 `.catch(() => null)` 残留
- 10 页面三态全覆盖

### 阻塞
- TypeScript 类型需重新生成（B 的 make generate-types 未完整跑）

---

## W3（M5.2 SSE 流式 UI）

### SSE 事件分发器扩展
- `sse-client.ts` 新增 6 种 SSE 事件类型：token / tool_call / tool_result / ui_action / done / error

### ToolCallBubble 组件
- 新建 `pages/chat/ToolCallBubble.tsx`：loading/success/error/vm-console 四形态
- 支持调用时长、结果摘要、错误展示、等宽黑底 VM 控制台回显

### ui_action 注册表
- `lib/ui-actions.ts` 新增 8 个 handler：
  - live2d.play_motion / set_expression / set_emotion / lipsync_audio
  - theme.switch / scene.set_time / scene.set_weather
  - vm.console_followup

### 待 W4 完成
- Storybook 覆盖 ToolCallBubble 4 种状态
- 与 B 联调 SSE 实际流

---

## 2026-05-22 · W2 启动 · M5.1 收尾

### 1. E2E 数据三态测试

新建 `tests/A/e2e/data-states.spec.ts`，覆盖 3 个数据状态：
- loading 态：通过 `page.route()` 为 `/api/feeds` 注入 3s 延迟，验证 `FeedsSkeleton` 组件可见
- error 态：注入 500 响应，验证 `CardError` 组件可见 + retry 按钮存在
- empty 态：注入空数组 `[]`，验证空状态文案可见

### 2. api.ts 类型匹配检查

`apps/web/src/lib/api/client.ts` 是通用 fetch wrapper（get/post/patch/delete），不含具体端点函数签名。页面直接调用 `api.get<Feed[]>('/feeds')` 等形式，因此无需更新函数签名。

发现以下 gap：
- **`types/api.ts` 过时**：B 在 `openapi.yaml` 中新增了 `/feeds/{feedId}/items`、`/memory/entries`、`/memory/entries/{entryId}`、`/system/status`、`/vms/{vmId}/start|stop|console|exec_enable` 等端点，但自动生成的 TS types 未重新生成。需运行 `make generate-types-ts`。
- **`FeedItemDetail` 调用 GET `/feeds/${feedId}`**：openapi.yaml 只定义了 DELETE on `/feeds/{feedId}`，GET 文章列表在 `/feeds/{feedId}/items`。需要 B 确认 Feed 详情端点设计，或前端改用 items 端点。
- **MemoryPage 内联 `MemoryEntry` 接口**：未使用 `types/contracts.ts` 中的类型（因为 contracts 尚未生成 `MemoryEntry`）。types 生成后应替换。

### 3. W1 grep 验证

```bash
grep -rn "\.catch(() => null)\|\.catch(() => \[\])" apps/web/src --include="*.ts" --include="*.tsx"
# 输出：(none) ✅
```

零残留，W1 改造完整。

### 4. M5.1 DoD 自检

| 检查项 | 状态 |
|--------|------|
| grep 零 `.catch(() => null)` 模式 | ✅ 通过 |
| 每个页面 JSX 有 isLoading/isError/empty 三态分支 | ✅ 通过（10 个页面全部到位） |
| e2e data-states.spec.ts 文件存在 | ✅ 完成 |
