# Phase6：整理与真机部署

> **起草日**：2026-05-22
> **目标**：代码整理 + Ubuntu 真机 SSH 联调，验证全链路在 Linux 上可运行
> **输入**：Phase5 三人冲刺完成 + 动态光照 Arona 场景 + Motion 系统
> **服务器**：192.168.198.145:22（无摄像头，正常 PC）

---

## 0. 起点快照（截至 2026-05-22）

### Phase5 已交付

| 模块 | 成果 |
|------|------|
| **Arona 场景** | Three.js ClassroomScene（GLB 双模型）+ DynamicSun 昼夜切换 + 250ms crossfade |
| **Live2D 角色** | PIXI.js + pixi-live2d-display，表情/动作/ui_action 驱动，鼠标跟随 |
| **分层架构** | z=1 Three.js / z=10 PIXI / z=20 DOM，pointer-events 穿透 |
| **Motion 系统** | DURATION + EASING tokens，bezierCSS/timing 工具函数，prefers-reduced-motion |
| **SSE 流式对话** | ToolCallBubble + ui_action registry |
| **SharedWorker WS** | query cache + optimistic updates |
| **Sidebar** | 平滑过渡动画 |

### 当前阻塞

| 阻塞项 | 状态 |
|--------|------|
| SSH 真机联调 | ❌ 未执行 |
| 代码整理（沙盒文件/命名/类型） | ❌ 未执行 |
| prod compose 适配无摄像头/无 GPU 场景 | ❌ 未做 |

---

## 1. Phase6 目标

### 1.1 两阶段目标

```
┌─ 阶段 A：代码整理（Mac，1-2 天）──────┐
│ 清理沙盒文件 + 命名修正 + 类型完善       │
│ 引入 Zustand + 场景配置化 + Story 归位  │
└────────────────────────────────────────┘
              ↓
┌─ 阶段 B：真机部署（Ubuntu，2-3 天）────┐
│ prod compose 适配 → SSH 部署 → 冒烟测试 │
│ 验证全链路在 Linux 上可运行              │
└────────────────────────────────────────┘
```

### 1.2 验收标准

- [ ] `git status` 无 "??" 沙盒文件，无带空格/数字后缀的源文件
- [ ] `make lint && make typecheck` 全绿
- [ ] `docker compose -f infra/compose/docker-compose.prod.yml up -d` 在 Ubuntu 上全部 healthy
- [ ] 浏览器访问 `http://192.168.198.145` 正常加载
- [ ] Arona 场景渲染正常（Three.js + PIXI 均可用）
- [ ] 登录 → 对话 SSE 流式输出正常
- [ ] Mock 模式下 perception 不崩溃

---

## 2. 服务器环境

### 2.1 目标机器

| 项 | 值 |
|----|-----|
| IP | 192.168.198.145 |
| SSH 端口 | 22 |
| 摄像头 | 无 → perception 必须 mock |
| GPU | 无 → 人脸识别用 CPU，LLM 走云端 API |

### 2.2 需要预装

```bash
# 通过 SSH 在服务器上执行
ssh user@192.168.198.145

# Docker（如未装）
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER

# git
sudo apt-get install -y git

# 确认
docker --version    # ≥ 24
docker compose version  # ≥ 2
```

### 2.3 不需要的

- ~~NVIDIA Container Toolkit~~（无 GPU）
- ~~摄像头权限~~（全 mock）
- ~~串口设备~~（全 mock）

---

## 3. 阶段 A：代码整理（Mac 端）

### 3.1 清理沙盒文件（15 个文件）

```bash
# 删除沙盒副本（确认无引用后）
rm "apps/web/src/components/effects/SwitchingOverlay 3.tsx"
rm "apps/web/src/components/ui-kit/CardEmpty.stories 2.tsx"
rm "apps/web/src/components/ui-kit/CardError.stories 3.tsx"
rm "apps/web/src/components/ui-kit/CardSkeleton.stories 2.tsx"
rm "apps/web/src/pages/chat/ToolCallBubble.stories 2.tsx"
rm "services/api-gateway/app/api/assets 2.py"
rm "packages/skills/feeds/schema 3.json"
rm "packages/skills/ha/handler 3.py"
rm "packages/skills/ha/schema 3.json"
rm "packages/skills/schedules/handler 3.py"
rm "packages/skills/schedules/schema 3.json"
rm "packages/skills/system/handler 3.py"
rm "packages/skills/system/schema 3.json"
rm "docs/Phase5_三人冲刺计划/security-review-B 2.md"
```

### 3.2 文件归位

| 当前 | 目标 | 理由 |
|------|------|------|
| `components/arona/arona-params.ts` | `components/arona/params.ts` | 去冗余前缀 |
| `lib/motion/MotionTokens.stories.tsx` | `components/design-system/MotionTokens.tsx` | Story 不是 lib |
| `types/pixi.js.d.ts` | 合并入 `types/live2d.d.ts` | 语义更准确 |
| `types/three.d.ts` | 保持不变，补全 GLTF 类型 | — |

### 3.3 引入 Zustand + 场景配置化

```typescript
// stores/scene.ts — 场景状态
import { create } from 'zustand';

interface SceneState {
  time: 'day' | 'night';
  modelState: 'loading' | 'ready' | 'error';
  setTime: (t: 'day' | 'night') => void;
  setModelState: (s: 'loading' | 'ready' | 'error') => void;
}
```

```typescript
// scenes/scene-config.ts — 场景配置
export const SCENE_PRESETS = {
  classroom: {
    day: { sun: {...}, ambient: {...}, sky: '#87CEEB' },
    night: { sun: {...}, ambient: {...}, sky: '#0d0d2b' },
    models: { day: '/assets/scenes/classroom-day.glb', night: '/assets/scenes/classroom-night.glb' },
  },
} as const;
```

### 3.4 集成验证

```bash
make lint
make typecheck
make test
```

---

## 4. 阶段 B：真机部署

### 4.1 关键变更：prod compose 适配无硬件环境

当前 `docker-compose.prod.yml` 存在的问题：

```yaml
# ❌ 问题 1：perception 硬编码 GPU
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia    # 无 GPU 会启动失败

# ❌ 问题 2：硬编码设备直通
devices:
  - /dev/video0:/dev/video0    # 无摄像头
  - /dev/ttyUSB0:/dev/ttyUSB0  # 无串口
```

**修复**：新增 `docker-compose.prod-nogpu.yml`（无 GPU / 无摄像头 overlay）：

```yaml
# 仅覆盖 perception 的 devices 和 GPU 配置
services:
  perception:
    devices: []         # 清空设备直通
    deploy: {}          # 清空 GPU 预约
    environment:
      MOCK_HARDWARE: "true"
      MOCK_SERIAL: "true"
      PERCEPTION_CAMERA_DEVICE: "mock"
      PERCEPTION_SERIAL_PORT: "mock"
```

### 4.2 创建 .env.production

```bash
# 在服务器上创建 .env.production
APP_ENV=production
LOG_LEVEL=info

DATABASE_URL=postgresql+asyncpg://javis:${PG_PASSWORD}@postgres:5432/javis
REDIS_URL=redis://redis:6379/0

JWT_SECRET=<生成随机字符串>
JWT_TTL_MIN=60
JWT_REFRESH_TTL_DAY=7

MINIMAX_API_KEY=<同 .env.local>
MINIMAX_MODEL=minimax-m2.7

PERCEPTION_PLATFORM=linux
PERCEPTION_CAMERA_DEVICE=mock
PERCEPTION_SERIAL_PORT=mock
PERCEPTION_VM_BACKEND=mock

MOCK_NAS=true
MOCK_HA=true
MOCK_VM=true
MOCK_HARDWARE=true
MOCK_SERIAL=true
```

### 4.3 部署步骤

```bash
# === 在 Mac 上执行 ===

# 1. 构建多架构镜像（或直接在服务器上 build）
docker buildx build -f infra/docker/Dockerfile.api-gateway -t studio-javis/api-gateway:dev .
docker buildx build -f infra/docker/Dockerfile.agent -t studio-javis/agent:dev .
docker buildx build -f infra/docker/Dockerfile.perception -t studio-javis/perception:dev .
docker buildx build -f infra/docker/Dockerfile.web -t studio-javis/web:dev .

# 2. 推送到服务器（或直接在服务器上 git clone + build）
# 方式 A：scp 镜像（慢但简单）
docker save studio-javis/api-gateway:dev studio-javis/agent:dev \
  studio-javis/perception:dev studio-javis/web:dev | \
  ssh user@192.168.198.145 "docker load"

# 方式 B：git clone + build（推荐）
ssh user@192.168.198.145
git clone <repo-url> /opt/studio-javis
cd /opt/studio-javis
```

```bash
# === 在服务器上执行 ===

# 3. 创建 .env.production
cp .env.example .env.production
# 编辑 .env.production，填入真实密钥

# 4. 构建镜像
IMAGE_TAG=dev docker compose -f infra/compose/docker-compose.prod.yml build

# 5. 启动
IMAGE_TAG=dev docker compose -f infra/compose/docker-compose.prod.yml up -d

# 6. 检查
docker compose -f infra/compose/docker-compose.prod.yml ps
docker compose -f infra/compose/docker-compose.prod.yml logs -f --tail=50
```

### 4.4 健康检查

```bash
# 在服务器上
curl -s http://localhost:8000/api/health | jq
# 期望：{"status": "ok"}

curl -s -o /dev/null -w "%{http_code}" http://localhost:80/
# 期望：200
```

---

## 5. 测试用例

### 5.1 冒烟测试（必须全过）

| # | 测试项 | 步骤 | 期望 |
|---|--------|------|------|
| T1 | 容器启动 | `docker compose ps` | 全部 healthy |
| T2 | API 健康 | `curl localhost:8000/api/health` | 200 |
| T3 | 前端加载 | 浏览器 `http://192.168.198.145` | 页面正常，无 console error |
| T4 | 登录 | 输入账号密码 | 登录成功，跳转主页 |
| T5 | Arona 场景 | 进入 Chat 页 | Three.js 场景渲染，光照正常 |
| T6 | Live2D 模型 | Arona 角色显示 | 模型加载，鼠标跟随 |
| T7 | SSE 对话 | 发送"你好" | 流式回复正常渲染 |
| T8 | 昼夜切换 | 点击切换按钮 | 场景 crossfade 平滑过渡 |
| T9 | 页面切换 | 切到 Feeds/System/VMs | 均正常加载 |
| T10 | 主题切换 | 切换 light/dark | 主题正常切换 |

### 5.2 场景专项测试

| # | 测试项 | 步骤 | 期望 |
|---|--------|------|------|
| S1 | GLB 模型加载 | 检查 Network 面板 | `classroom-day.glb` / `classroom-night.glb` 200 |
| S2 | 程序化 Fallback | 删除 GLB 文件后刷新 | FallbackScene 正常渲染（不白屏） |
| S3 | Live2D CDN | 检查 Network | `live2dcubismcore.min.js` CDN 可达 |
| S4 | Motion 动画 | Sidebar 展开/收起 | 动画流畅，prefers-reduced-motion 生效 |

### 5.3 异常测试

| # | 测试项 | 操作 | 期望 |
|---|--------|------|------|
| E1 | 刷新 Chat 页 | F5 | 场景重新初始化，无 WebGL context lost |
| E2 | 断网恢复 | 切飞行模式再恢复 | WS 重连，无崩溃 |
| E3 | perception 无 GPU | 检查 perception 日志 | 启动无 fatal error，mock 模式正常 |

---

## 6. 风险与回退

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| Three.js WebGL 在 Linux 无 GPU 下性能差 | 中 | 中 | 降级 frameloop 为 `demand`，接受 15-20fps |
| PIXI.js 在无 GPU 环境初始化失败 | 低 | 高 | 加 `forceCanvas: true` fallback |
| Live2D Cubism Core CDN 被墙 | 中 | 中 | 预下载到 `/assets/lib/` 本地 serve |
| perception GPU deploy 配置导致启动失败 | 高 | 高 | 用 `docker-compose.prod-nogpu.yml` overlay |
| GLB 文件路径在 Nginx 下 404 | 低 | 中 | 检查 Nginx `location /assets/` 配置 |
| PostgreSQL 数据卷权限问题 | 中 | 中 | `chown 999:999` pgdata 目录 |

---

## 7. 时间线

```
Day 1 (5/22)
  ├─ 阶段 A：代码整理（6 个 Task）
  └─ 输出：一次清理 commit

Day 2 (5/23)
  ├─ 创建 docker-compose.prod-nogpu.yml
  ├─ 创建 .env.production 模板
  ├─ SSH 到服务器，clone 代码
  └─ 首次部署尝试

Day 3 (5/24)
  ├─ 修复部署问题
  ├─ 冒烟测试（T1-T10）
  └─ 异常测试（E1-E3）

Day 4 (5/25)
  ├─ 修 bug（如有）
  ├─ 性能基线记录
  └─ 更新 runbook
```

---

## 8. 文件产出清单

| 文件 | 说明 |
|------|------|
| `infra/compose/docker-compose.prod-nogpu.yml` | 无 GPU overlay |
| `.env.production.template` | 生产环境变量模板（不含密钥） |
| `docs/runbook/deploy-linux-runbook.md` | 部署操作手册 |
| `docs/Phase6_整理与真机部署/Phase6_完成报告.md` | 完成后的记录 |

---

## 9. 修订记录

| 日期 | 修订 | 谁 |
|------|------|-----|
| 2026-05-22 | 初稿 | — |

---

## 10. 附录：当前 Git 状态关注点

```
# 源文件中的沙盒副本（需清理）
?? apps/web/src/components/effects/SwitchingOverlay 3.tsx
?? apps/web/src/components/ui-kit/CardEmpty.stories 2.tsx
?? apps/web/src/components/ui-kit/CardError.stories 3.tsx
?? apps/web/src/components/ui-kit/CardSkeleton.stories 2.tsx
?? apps/web/src/pages/chat/ToolCallBubble.stories 2.tsx
?? packages/skills/feeds/schema 3.json
?? packages/skills/ha/handler 3.py
?? packages/skills/ha/schema 3.json
?? packages/skills/schedules/handler 3.py
?? packages/skills/schedules/schema 3.json
?? packages/skills/system/handler 3.py
?? packages/skills/system/schema 3.json
?? services/api-gateway/app/api/assets 2.py
?? docs/Phase5_三人冲刺计划/security-review-B 2.md

# 新建的 Arona 组件（Phase5 产出）
?? apps/web/src/components/arona/AronaModel.tsx
?? apps/web/src/components/arona/AronaShell.tsx
?? apps/web/src/components/arona/arona-params.ts

# 新建的类型定义
?? apps/web/src/types/pixi.js.d.ts
?? apps/web/src/types/three.d.ts

# 新建的 lib
?? apps/web/src/lib/sse-integration.ts

# 修改的文件（未提交）
M  apps/web/src/lib/motion/MotionTokens.stories.tsx
M  apps/web/src/pages/chat/ToolCallBubble.tsx
M  apps/web/src/pages/chat/ToolCallCard.tsx
```
