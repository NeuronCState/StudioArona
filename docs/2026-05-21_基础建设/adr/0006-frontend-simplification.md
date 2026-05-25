# ADR 0006: 前端瘦身 — Authoritative 现状记录

## Context

01 规划书设计了丰富的前端组件体系（shadcn/ui、visx 图表、Chromatic 视觉回归、Storybook 全覆盖）。实施过程中 A 做了务实的简化：

1. **shadcn/ui 引入但未深度使用**：实际页面以 Tailwind CSS 手写组件为主，shadcn/ui 仅用于少量表单控件
2. **visx 图表库未引入**：硬件页的实时数据使用 Canvas 手绘，不依赖 visx
3. **Chromatic 视觉回归未接入**：视觉回归使用 Playwright `toHaveScreenshot()` 在 CI 中跑
4. **Storybook 保留了核心页面**：5 个页面的 story 足够开发验证，不需要全覆盖

这些简化已经在代码中成为事实标准，无需"回退"——只需要记录为权威决策。

## Decision

**认可 A 的前端现状为 authoritative，不强制对齐 01 规划书**

### 保留项

| 项目 | 状态 | 说明 |
|------|------|------|
| Tailwind CSS | ✅ 主力 | 所有样式通过 Tailwind 实现 |
| shadcn/ui | ⚠️ 精简使用 | 仅 Button/Input/Dialog 等基础组件，不扩展 |
| Storybook | ✅ 核心页面 | 5 个页面 story，不要求全覆盖 |
| Playwright E2E | ✅ 主力 | 端到端测试 + `toHaveScreenshot()` 视觉回归 |
| axe-core | ✅ 接 Playwright | 可访问性检查在 E2E 中跑 |

### 删除/不引入项

| 项目 | 决定 | 理由 |
|------|------|------|
| visx | 不引入 | Canvas 手绘满足硬件页需求 |
| Chromatic | 不引入 | Playwright 截图替代，减少外部依赖 |
| shadcn/ui 全量组件 | 不扩展 | 手写 Tailwind 更灵活 |
| Framer Motion 复杂动画 | 不引入 | 横屏公告板不需要复杂动画 |

### 测试目录收敛

- 前端测试从 `apps/web/tests/A/` 迁移到 `tests/A/`
- CI 路径同步更新

## Consequences

### 正面
- 减少外部依赖：少 3 个 npm 包（visx、chromatic、framer-motion），CI 更快
- 代码库更轻：手写 Tailwind 减少抽象层
- 测试单一化：Playwright 胜任 E2E + 视觉回归 + 可访问性

### 负面
- 手写组件缺少 shadcn/ui 的 accessibility 内置支持（依赖 axe-core 事后检查）
- Canvas 手绘图表不如 visx 灵活，复杂图表需求时需重新评估
- Storybook 覆盖不完整，部分组件没有独立 story（依赖 E2E 覆盖）

### 中性
- 01 规划书不回头修改，ADR 0006 作为权威歧义裁决依据
- 如果 v0.2.0 需要复杂图表，可重新评估 visx

## Alternatives considered

### A. 强制对齐 01 规划书（引入 visx + Chromatic + shadcn/ui 全量）
- 优点：和设计文档一致
- 缺点：增加 ~200KB bundle、CI 时间 +30%、学习成本
- 决定：不采用，过度工程

### B. 全部手写，不用 shadcn/ui（更极端）
- 优点：零依赖
- 缺点：Button/Input/Dialog 等基础组件手写工作量大且易出错
- 决定：不采用，保留 shadcn/ui 基础组件

## Refs
- 01 规划书 §4-§6（前端架构）
- 05 冲刺计划 §2 不变量 #6
- `tests/A/`（迁移后的前端测试目录）
