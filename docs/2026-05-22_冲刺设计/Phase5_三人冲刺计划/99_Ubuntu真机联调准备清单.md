# Ubuntu 真机联调准备清单

> **目的**：A、B、C 三个 Agent 在 Mac dev 阶段全部完成 Phase 5 后，本文件作为"切到 Ubuntu 物理机做真机联调"的交接清单。
> **触发**：00_总纲 §5 全部 ✅ 后由用户接管 SSH。
> **使用方式**：三人共同 review 本文件，缺项打 ❌，全部 ✅ 后通知用户。

---

## 0. 用户即将做的事

> **用户原话**：「这三个人的任务都进行完之后我就要连接 ubuntu 的 SSH 进行真实测试了，让他们做好准备。」

用户会做：
1. SSH 进 Ubuntu 物理机
2. clone 仓库 + checkout 本阶段最终分支
3. 跑 `infra/scripts/deploy-linux.sh`（B 主笔的部署脚本）
4. 验证：硬件接入、跨服务通信、阿洛娜真听 / 真说、VM 真跑、HA 真控、面孔识别真识别
5. 长时间运行测试（24h / 7d）

**A、B、C 在 Mac dev 阶段必须确保所有"切到真机就坏"的隐患都已消除**。下面分人列出预交付项。

---

## 1. 全员通用约定（三人都要做到）

### 1.1 路径无中文硬编码
- ❌ 代码中不允许出现 `阿洛娜4.6版本/...` `什亭之匣...` 这类中文绝对路径
- ✅ 所有资产通过 `/api/assets/*` 路由抽象（B 提供）+ `manifest.json` 间接寻址（A 消费）
- 验证命令：
  ```bash
  rg -n "阿洛娜|什亭之匣|/Users/zhangxuanning" apps/web/src services/ packages/
  # 应只在配置文件和 mock seed 数据中出现，业务代码 0 命中
  ```

### 1.2 环境变量驱动 Mock / 实物切换

`infra/compose/docker-compose.yml` + `.env.local` 已有 `MOCK_*` 矩阵。三人统一遵守：

| 变量 | Mac dev 默认 | Ubuntu 实物 | 谁负责 |
|---|---|---|---|
| `MOCK_HARDWARE` | true | **false** | B（perception） |
| `MOCK_NAS` | true | **false** | B |
| `MOCK_HA` | true | **false** | B |
| `MOCK_VM` | true | **false** | B |
| `MOCK_SERIAL` | true | **false** | B |
| `MOCK_CAMERA` | true | **false** | B |
| `LLM_PROVIDER` | `minimax` | `minimax` | B |
| `VITE_USE_MSW` | unset | unset | A |
| `VITE_API_BASE` | `/api` (vite proxy) | `/api`（同源 nginx） | A、C |
| `NODE_ENV` | development | **production** | C |

`.env.example` 必须列全所有变量 + 用途注释（B 维护）。

### 1.3 没有 macOS 专属依赖

```bash
# 验证：在干净的 Ubuntu 容器里跑
docker run --rm -v $(pwd):/app -w /app ubuntu:22.04 bash -c "
  apt-get update && apt-get install -y curl python3.12-venv nodejs
  # 安装项目依赖 + 跑 typecheck
"
```

容易踩的雷：
- `psutil` 在 macOS 与 Linux 字段不同（B 已知）
- 字体路径硬编码 macOS（C 处理）
- `webcrypto` polyfill 差异（C 处理）

---

## 2. 工程师 A 预交付清单

### 2.1 数据三态在弱网 / 断网下都正确
- [ ] Chrome DevTools Network → Slow 3G 测试 6 个核心页面，loading 不超过 5s 内出现，超时显示 error 态
- [ ] 离线测试：Chrome DevTools Offline，每页应有 fallback 文案而非白屏

### 2.2 静态资产路径规范化
- [ ] Live2D 资产**只通过** `/api/assets/live2d/arona/manifest.json` 间接寻址
- [ ] glTF 教室资产 commit 到 `apps/web/public/assets/scenes/classroom-{day,night}.glb`
- [ ] 在 Mac 上跑 `pnpm --filter web build && pnpm --filter web preview`（生产 mode），所有资产都能正确加载

### 2.3 Live2D 在 Linux Chrome 下能加载
- [ ] Cubism Core 通过 CDN 加载（不依赖 macOS 系统证书）
- [ ] WebGL 1 / WebGL 2 兼容（部分 Linux 老 Mesa 驱动只到 WebGL 1）
- [ ] 在禁用 WebGL 的 Chrome（chrome://flags 关 WebGL）下 → 自动 fallback 到 Studio 主题 + 错误 toast

### 2.4 Three.js 教室在集显能跑
- [ ] glTF 优化后 < 6MB / 份
- [ ] 在 Mac dev 上用 `chrome://gpu` 切到 SwiftShader（软渲染）测试一次 → 至少 30fps 或自动降级
- [ ] `<Canvas frameloop="demand">` 默认开启，相机不动不渲染

### 2.5 主题切换流畅 + 无残留
- [ ] Studio → Arona → Studio 三次往返，Memory tab 截图对比无泄漏
- [ ] 切回 Studio 时显式 dispose Three.js renderer / Pixi app / Live2D model

---

## 3. 工程师 B 预交付清单

### 3.1 mock backend 全部有 Linux 实物等价实现

| Mock 路径 | Linux 实物路径 | 状态 |
|---|---|---|
| `services/perception/app/core/hardware/mock.py` | `linux.py`（已有骨架） | ⬜ 完成 |
| `services/perception/app/core/vm/mock.py` | `libvirt.py`（新建） | ⬜ 完成 |
| `services/perception/app/core/serial/mock.py` | `pyserial.py` | ⬜ 完成 |
| `services/perception/app/core/face/mock.py` | `insightface.py` | ⬜ 完成 |
| `services/perception/app/core/factory.py` 工厂决策 | 根据 `MOCK_*` env 切换 | ⬜ 完成 |

每个实物实现要有 unit test（`tests/D/unit/`）+ 集成 test（`tests/D/integration/` —— 需要 testcontainers 或 mark `@pytest.mark.live` 跳过 mac）。

### 3.2 部署脚本 `infra/scripts/deploy-linux.sh`
- [ ] 干净 Ubuntu 22.04 / 24.04 上一键跑通：clone → 装依赖 → 起 PG/Redis → 迁移 → 起 systemd 服务 → 跑 smoke
- [ ] 支持回滚：`deploy-linux.sh --rollback` 回到上一个 git tag

### 3.3 Systemd 单元文件

新建 `infra/systemd/`：
- `studio-javis-api-gateway.service`
- `studio-javis-agent.service`
- `studio-javis-perception.service`
- `studio-javis-web.service`（serve `apps/web/dist` 的 nginx 或 caddy）

每个 unit 必须：
- `Restart=on-failure` + `RestartSec=5`
- `LimitNOFILE=65536`
- `User=javis`（非 root，B 在 deploy 脚本里 useradd）
- `After=postgresql.service redis.service`
- 依赖 `/etc/javis/env`（环境变量集中处）

### 3.4 数据库
- [ ] 干净库一键 `alembic upgrade head` 走通
- [ ] 种子数据脚本可重入（重跑不会重复插入或报错）
- [ ] 备份 / 恢复脚本（`infra/scripts/backup.sh` + `restore.sh` 已有，验一次）

### 3.5 OpenClaw 真模型接入
- [ ] MiniMax-M2.7 API key 走环境变量 `MINIMAX_API_KEY`，不能 commit
- [ ] 网络白名单：MiniMax API endpoint + Home Assistant 局域网 IP + 用户配置的 RSS 源
- [ ] LLM 失败重试与降级（API 不可达 → 回退到 LLM_PROVIDER=mock）

### 3.6 VM 控制台真接入
- [ ] libvirt 后端接通：`libvirt-python` + 读 `/var/log/libvirt/qemu/<name>.log` 末尾 N 行
- [ ] qemu-guest-agent 文档：用户在自己 VM 内装 `qemu-guest-agent` 包，systemd 启用
- [ ] VM exec 走 `virsh qemu-agent-command <vm> '{"execute":"guest-exec",...}'`
- [ ] 命令白名单 + 黑名单 + 超时 + 输出截断在真后端验过一次

### 3.7 安全
- [ ] sandbox `--unsafe-relax` 开关默认 false（dev 显式打开）
- [ ] injection-test 全过
- [ ] 多租户隔离测试全过
- [ ] gitleaks 扫一遍 commit history 无泄漏

---

## 4. 工程师 C 预交付清单

### 4.1 生产构建
- [ ] `pnpm --filter web build` 产物可被 nginx 直接 serve
- [ ] 所有 dev-only（PerfHud / Storybook / MSW worker）在 prod build 中 tree-shake 掉
- [ ] sourcemap 仅生成不上传（或上传到内部 sentry）

### 4.2 字体与 i18n
- [ ] 字体走 `font-family` 链，最后回退到系统通用：
  ```css
  font-family: 'Inter', 'Noto Sans SC', system-ui, -apple-system, sans-serif;
  ```
- [ ] 在 Ubuntu 上提前测：`fc-list | grep -i noto` 应包含 Noto Sans CJK
- [ ] 部署脚本（B 配合）可选安装 `fonts-noto-cjk` 包

### 4.3 WebGL fallback
- [ ] login 页 LoginBackdrop 在 WebGL 不可用时显示静态渐变（已实现）
- [ ] 浏览器禁用 WebGL（`chrome://settings/?search=webgl`）→ 自动隐藏 Arona 切换器 + toast 提示
- [ ] 软件渲染（SwiftShader）下 LoginBackdrop 至少 30fps 或自动 reduced-motion

### 4.4 Service Worker
- [ ] prod build 才注册（dev 不注册避免缓存反复）
- [ ] 提供"清缓存 + 强制更新"按钮（设置页）
- [ ] SW update 有 `skipWaiting` + 提示用户刷新的 toast

### 4.5 性能基线挂 CI
- [ ] Lighthouse CI 跑在 GitHub Actions（或同等），main chunk 超 250KB gz fail
- [ ] 性能回归门槛文档化在 `docs/Phase5_三人冲刺计划/adr_动效系统与性能基线.md`

### 4.6 SharedWorker 兼容性
- [ ] Safari < 16 不支持 SharedWorker → 自动降级到 per-tab WebSocket（不阻断功能）
- [ ] 服务端 ws-gateway 的连接限流要预留多 tab × 多用户 × N 倍

---

## 5. Ubuntu 物理机环境前提（用户接管前已就绪）

> 这部分**不是** Agent 要做的，是用户那边 Ubuntu 物理机上需要的前置条件。三人在 README / runbook 中向用户说明。

### 5.1 系统层
- Ubuntu 22.04 LTS 或 24.04 LTS（推荐 24.04）
- Docker + Docker Compose
- Python 3.12+（建议 `pyenv` 或 `uv` 自管）
- Node.js 20+ + pnpm 9+
- libvirt-daemon-system + qemu-kvm（VM 用）
- v4l-utils（摄像头）
- nginx 或 caddy（serve apps/web/dist + reverse proxy）
- systemd（默认有）

### 5.2 GPU 驱动
- NVIDIA：装官方驱动（如有）；驱动版本 ≥ 535
- AMD：mesa-vulkan-drivers ≥ 24（保证 WebGL 2 + 教室 3D 能跑）
- Intel iGPU：mesa-va-drivers + libva 即可

### 5.3 网络
- Home Assistant 在同一局域网，HA URL + Long-lived Token 配置在 `/etc/javis/env`
- NAS 走 SMB / NFS，挂载点固定（用户在 fstab 配置）
- 出网白名单（防火墙）：MiniMax API、用户 RSS 源、cubism CDN

### 5.4 数据
- PG 数据卷持久化在 `/var/lib/javis/postgres`
- Redis 持久化 `/var/lib/javis/redis`
- agent workspace 与用户 memory：`/var/lib/javis/workspace`、`/var/lib/javis/memory`
- 资产（live2d / scenes）：`/var/lib/javis/assets`（B 在 deploy 脚本里 symlink 进 nginx serve 路径）

---

## 6. 真机联调测试用例（三人接力跑）

按顺序跑，前一个不过不进下一个：

### 6.1 冒烟（30 分钟）
- [ ] `deploy-linux.sh` 一键起服务
- [ ] 浏览器打开 `https://<host>` → 看到 login 页
- [ ] 登录 → 进 home → 6 个页面都显示真数据（哪怕是空状态）

### 6.2 阿洛娜对话（1 小时）
- [ ] 文字对话："今天天气怎么样" → LLM 回复正常
- [ ] 触发 schedule 创建：「明天下午三点提醒我开会」→ schedule 表多一条 + 前端列表自动刷新
- [ ] 触发 RSS：「订阅 https://...` → feed 表多一条
- [ ] 触发 memory：「记下我喜欢拿铁」→ memory_entry 多一条
- [ ] 触发 system：「电脑现在怎么样」→ 看到真 CPU / 内存数据

### 6.3 形象联动（30 分钟）
- [ ] 切到 Arona 主题 → BA 教室加载 + 阿洛娜出现
- [ ] 跟阿洛娜说"开心"语境 → 看到星星眼表情
- [ ] 切回 Studio → 资源释放（任务管理器 GPU 内存下降）

### 6.4 VM 控制（1 小时）
- [ ] 在用户的一台 VM 内装 qemu-guest-agent + 启用
- [ ] 前端给该 VM 打勾"允许阿洛娜执行命令"
- [ ] 「看一下 VM-build 最近的输出」→ 控制台日志展示
- [ ] 「在 VM-build 里跑 df -h」→ 阿洛娜确认 → 用户同意 → 执行 + 输出
- [ ] 注入 `rm -rf /` → 黑名单拒绝
- [ ] 跨用户尝试 → 403

### 6.5 HA 控制（30 分钟）
- [ ] 「打开客厅灯」→ 真灯亮
- [ ] 「关闭所有灯」→ 真灯灭
- [ ] HA token 错误时 → 错误提示

### 6.6 面孔识别 + 唤醒（1 小时）
- [ ] 摄像头探测到注册用户 → WS push wake 事件
- [ ] 串口写入舵机控制（B 验证字节流正确）
- [ ] 离开后 leave countdown

### 6.7 性能 / 长跑（24 小时）
- [ ] 让屏幕常亮 24h，CPU 平均占用 < 20%
- [ ] 内存无持续增长
- [ ] 风扇转速正常
- [ ] systemd 自动重启过 → 无丢数据

---

## 7. 回滚预案

### 7.1 一键回滚
```bash
infra/scripts/deploy-linux.sh --rollback
# 等价于：
# 1. systemctl stop studio-javis-*
# 2. git checkout <last-known-good-tag>
# 3. alembic downgrade <prev-revision> 或 restore from dump
# 4. systemctl start studio-javis-*
```

### 7.2 部分回滚
- 只回前端：`apps/web/dist` 用上次 release tarball 替换
- 只回 schema：`alembic downgrade -1`
- 只回 agent：systemctl restart 旧 docker image

---

## 8. Ubuntu 上的常见坑（提前写进 runbook）

| 坑 | 缓解 |
|---|---|
| Snap 装的 Chromium 启动慢 / 权限怪 | 用 deb 版或 Chrome 官方包 |
| 中文显示口字 | `apt install fonts-noto-cjk fonts-noto-cjk-extra` |
| 摄像头 `/dev/video0` 权限拒绝 | `usermod -aG video javis` |
| WebGL 报"软件渲染" | 检查 `glxinfo | grep "OpenGL renderer"`，装 GPU 驱动 |
| 串口 `/dev/ttyUSB0` 拒绝 | `usermod -aG dialout javis` |
| libvirt 拒绝 | `usermod -aG libvirt javis` + relogin |
| Docker 端口冲突 | `infra/compose` 里所有端口都通过 `.env` 可调 |
| systemd 起服务失败但 journalctl 看不出 | 加 `Environment="PYTHONUNBUFFERED=1"` |
| nginx 反代 SSE 缓冲 | `proxy_buffering off; proxy_cache off; proxy_read_timeout 1d;` |
| WebSocket 反代 | `proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";` |

---

## 9. 交接信号

三人共同 review 本文件，确认：

- [ ] §1 通用约定全员通过
- [ ] §2 A 项全部 ✅
- [ ] §3 B 项全部 ✅
- [ ] §4 C 项全部 ✅

全部勾上后，任一人在 PR 里写：

> @用户：Phase 5 三人冲刺已收尾，Ubuntu 真机联调清单全部就绪。可以接管 SSH 联调。建议从 §6.1 冒烟开始，遇到问题对照 §8 常见坑。

完成。
