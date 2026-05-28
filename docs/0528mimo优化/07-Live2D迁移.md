# 07 — Live2D Cubism SDK 迁移

> 分支: `a/live2d-cubism-migration`
> 预估: 12h | 角色: A | 依赖: 03-前端框架升级

## 目标

将 `pixi-live2d-display`（已废弃，2022 停更）替换为官方 Live2D Cubism SDK for Web，同时升级 PixiJS 7 → 8。

## 风险评估

**高风险** — 这是本次优化中工作量最大、风险最高的任务。Live2D 渲染涉及 Spine 动画、物理模拟、表情系统，替换核心渲染库可能导致视觉回归。

## 前置调研

### 确认当前使用范围

```bash
grep -rn "pixi-live2d-display\|Live2DModel\|PIXI" apps/web/src/ --include="*.tsx" --include="*.ts"
```

需要确认：
1. 哪些组件使用了 `pixi-live2d-display`
2. 使用了哪些 API（模型加载、动画播放、表情切换、物理模拟）
3. Spine 动画文件（`.atlas`、`.png`、`.skel`）是否与 Cubism SDK 兼容

### 官方 SDK 评估

**Live2D Cubism SDK for Web**: https://github.com/Live2D/CubismWebSDK

- 官方维护，最新版本支持 Cubism 5
- 原生支持 `.moc3` 模型格式
- 不依赖 PixiJS — 有自己的渲染管线
- 如果当前用的是 Spine 动画而非 Cubism `.moc3`，则 SDK 不适用

### 关键问题

**当前的 Arona 模型是什么格式？**
- 如果是 `.moc3`（Cubism）→ 可以迁移到官方 SDK
- 如果是 Spine（`.atlas` + `.skel`）→ 需要 Spine runtime，不是 Live2D

从 `apps/web/public/assets/wallpaper/arona/assets/` 的文件看：
- `arona_workpage_daytime.atlas` + `.skel` — 这是 **Spine** 格式
- `NP0035_spr.atlas` + `.png` — 这也是 **Spine** 格式

**结论：当前项目使用的是 Spine 动画，不是 Live2D Cubism。**

## 方案调整

既然实际使用的是 Spine 而非 Live2D，迁移方案应调整为：

### 方案 A：PixiJS 8 + @pixi-spine/runtime（推荐）

1. 升级 PixiJS 7 → 8
2. 替换 `pixi-live2d-display` 为 `@pixi-spine/runtime`（Spine 官方 PixiJS 插件）
3. 更新 Spine 动画加载和播放代码

```bash
pnpm --filter web remove pixi-live2d-display pixi.js
pnpm --filter web add pixi.js@^8.0.0 @pixi-spine/runtime@^4.2.0
```

### 方案 B：@spine-player/runtime（纯 Spine，不依赖 PixiJS）

如果 Spine 动画是独立展示（不需要 PixiJS 的其他功能），可以用 Spine 官方的独立播放器。

### 方案 C：保持现状，仅做最小改动

如果 Spine 动画只是装饰性的，保持 pixi.js 7 + 当前方案，不做大迁移。

## 建议

**先确认 Arona 模型的实际格式和使用方式，再决定迁移方案。**

需要人工确认：
1. Arona 的 Spine 动画在当前版本中是否正常工作？
2. 是否有计划更换为 Cubism `.moc3` 模型？
3. Spine 动画是核心功能还是装饰？

## 如果确认迁移（方案 A）

### 步骤

1. 安装新依赖
2. 修改 `AronaModel.tsx` 和 `ClassroomScene.tsx`
3. 替换 `pixi-live2d-display` 的 API 为 `@pixi-spine/runtime`
4. 更新 Spine 资源加载方式
5. 测试动画播放、表情切换、物理模拟

### 验证

1. `pnpm --filter web exec tsc --noEmit` — 类型检查通过
2. 手动检查：Arona 动画正常播放
3. 手动检查：表情/动作切换正常
4. 性能对比：FPS 不低于当前版本

## Commit

```
feat(web): migrate Spine rendering from pixi-live2d-display to @pixi-spine/runtime

pixi-live2d-display is abandoned (last commit 2022). Replace with
official Spine runtime for PixiJS 8 compatibility.
```
