# 08 — OpenClaw 版本管理

> 分支: `b/openclaw-version-pin`
> 预估: 2h | 角色: B | 依赖: 05-Bridge 服务重构

## 目标

固定 openclaw 版本，添加更新检查和前端通知。

## 前置信息

openclaw 通过 `npm install -g openclaw@latest` 全局安装，使用 `openclaw update` 更新。

## 任务清单

### 8.1 固定 package.json 版本

**文件**: `services/agent/package.json`

```bash
# 先查当前安装版本
pnpm --filter agent exec openclaw --version
# 或
npm ls -g openclaw
```

然后固定：
```json
"openclaw": "x.y.z"  // 替换 "latest" 为实际版本号
```

### 8.2 添加更新检查端点

**文件**: `services/agent/bridge/server.js`

```javascript
// GET /api/system/openclaw-version
if (req.url === "/api/system/openclaw-version" && req.method === "GET") {
  try {
    const { execSync } = await import("node:child_process");

    // 获取已安装版本
    let installed = "unknown";
    try {
      installed = execSync("openclaw --version", { timeout: 5000 })
        .toString().trim();
    } catch {}

    // 获取 npm 最新版本
    let latest = "unknown";
    try {
      latest = execSync("npm view openclaw version", { timeout: 10000 })
        .toString().trim();
    } catch {}

    const updateAvailable = installed !== "unknown" &&
      latest !== "unknown" &&
      installed !== latest;

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      installed,
      latest,
      updateAvailable,
      updateCommand: "openclaw update",
    }));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Failed to check version" }));
  }
  return;
}
```

### 8.3 前端更新通知

**文件**: `apps/web/src/pages/studio/StudioHomePage.tsx` 或系统状态组件

在 SystemPage 或 StudioHomePage 的系统信息区域添加：

```typescript
// 在 system metrics 请求旁添加
const { data: openclawVersion } = useQuery({
  queryKey: ["openclaw-version"],
  queryFn: () => api.get("/system/openclaw-version"),
  refetchInterval: 60 * 60 * 1000, // 每小时检查一次
  staleTime: 30 * 60 * 1000,
});

// 在 UI 中显示
{openclawVersion?.updateAvailable && (
  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
    <p className="text-amber-800">
      OpenClaw 有新版本可用: {openclawVersion.latest}
    </p>
    <p className="text-sm text-amber-600">
      运行 `openclaw update` 更新
    </p>
  </div>
)}
```

### 8.4 添加 MSW mock handler

**文件**: `apps/web/src/mocks/handlers.ts`

```typescript
http.get("/api/system/openclaw-version", () => {
  return HttpResponse.json({
    installed: "1.0.0",
    latest: "1.0.0",
    updateAvailable: false,
    updateCommand: "openclaw update",
  });
}),
```

## 验证步骤

1. `pnpm --filter agent install` — openclaw 固定版本安装成功
2. `curl localhost:18790/api/system/openclaw-version` — 返回版本信息
3. 前端系统页面显示 openclaw 版本状态
4. 如果有更新，显示更新提示

## Commit

```
feat(agent): pin openclaw version and add update notification

- Pin openclaw to specific version (was "latest")
- Add /api/system/openclaw-version endpoint with npm registry check
- Add frontend update notification in system page
- Add MSW mock handler for version check
```
