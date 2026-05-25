# Perception Service Runbook

> 运维手册：部署、监控、故障排查

---

## 1. 服务概述

**perception** 是 Studio Javis 的"身体"服务，负责：
- 人脸检测 / 识别 / 跟踪
- 硬件监控（CPU/GPU/内存/磁盘）
- 虚拟机管理
- 局域网设备扫描
- 串口通信（机械臂）
- 屏幕方向控制

**技术栈**：Python 3.12 + FastAPI + OpenCV + InsightFace + ultralytics

**端口**：8000（内部），由 api-gateway 反代

---

## 2. 部署

### Mac 本地开发

```bash
cd studio-javis
uv pip install -e "services/perception[dev]"
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Docker（Linux 生产）

```bash
docker build -f infra/docker/Dockerfile.perception -t studio-javis/perception:v0.1.0 .
docker run -d \
  --name perception \
  --gpus all \
  --device /dev/video0 \
  --device /dev/ttyUSB0 \
  -p 8000:8000 \
  -e PERCEPTION_PLATFORM=linux \
  -e PERCEPTION_CAMERA_DEVICE=/dev/video0 \
  -e PERCEPTION_SERIAL_PORT=/dev/ttyUSB0 \
  studio-javis/perception:v0.1.0
```

### Compose

```bash
docker compose -f infra/compose/docker-compose.prod.yml up -d perception
```

---

## 3. 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PERCEPTION_PLATFORM` | `mac` | `mac` 或 `linux` |
| `PERCEPTION_CAMERA_DEVICE` | `0` | 摄像头设备号或路径 |
| `PERCEPTION_FACE_THRESHOLD` | `0.62` | 人脸识别阈值 |
| `PERCEPTION_TRACK_FPS` | `15` | 跟踪帧率 |
| `PERCEPTION_SERIAL_PORT` | `mock` | `mock` 或 `/dev/ttyUSB0` |
| `PERCEPTION_VM_BACKEND` | `mock` | `mock` 或 `vbox` |
| `MOCK_NAS` | `true` | NAS mock 开关 |
| `MOCK_HA` | `true` | HomeAssistant mock 开关 |

---

## 4. 健康检查

```bash
curl http://localhost:8000/health
# {"status":"ok","service":"perception","platform":"mac"}
```

---

## 5. API 端点

| Method | Path | 说明 |
|--------|------|------|
| GET | `/health` | 健康检查 |
| GET | `/api/system/metrics` | 硬件指标快照 |
| GET | `/api/vms` | VM 列表 |
| POST | `/api/vms` | 创建 VM |
| DELETE | `/api/vms/{id}` | 销毁 VM |
| POST | `/api/vms/{id}/upload` | 上传文件到 VM |
| GET | `/api/network/devices` | 网络设备列表 |

---

## 6. 监控

### 日志

structlog JSON 格式，关键字段：
- `service=perception`
- `subsystem=face|serial|vm|hardware|network|screen`
- `latency_ms`
- `event`

### 关键指标

| 指标 | 告警阈值 |
|------|----------|
| 人脸检测 FPS | < 10 fps |
| 指标采集延迟 | > 200ms |
| 摄像头帧读取失败率 | > 5% |
| 串口写入失败 | 任何一次 |

---

## 7. 故障排查

### 7.1 摄像头无法打开

```bash
# 检查设备是否存在
ls -la /dev/video*

# 检查权限
sudo usermod -aG video $USER

# Docker 中检查设备直通
docker exec perception ls -la /dev/video0
```

### 7.2 人脸识别不工作

```bash
# 检查模型文件
ls services/perception/models/models/buffalo_l/

# 检查 InsightFace 加载
uv run python -c "from insightface.app import FaceAnalysis; app = FaceAnalysis(name='buffalo_l', root='./services/perception/models'); app.prepare(ctx_id=-1)"
```

### 7.3 GPU 不可用

```bash
# 检查 NVIDIA 驱动
nvidia-smi

# 检查 Docker GPU 支持
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi
```

### 7.4 串口通信失败

```bash
# 检查串口设备
ls -la /dev/ttyUSB*

# 检查权限
sudo usermod -aG dialout $USER

# 测试通信
uv run python -c "
from app.core.serial.protocol import encode_target
frame = encode_target(100, -50, 1200)
print(frame.hex())
"
```

### 7.5 VM 管理不工作

```bash
# 检查 VirtualBox
VBoxManage list vms

# 检查 VBoxManage 权限
VBoxManage startvm test-vm --type headless
```

---

## 8. 回滚

```bash
# Docker 回滚
docker compose -f infra/compose/docker-compose.prod.yml pull perception
docker compose -f infra/compose/docker-compose.prod.yml up -d perception

# 指定版本
docker tag studio-javis/perception:v0.0.9 studio-javis/perception:latest
docker compose -f infra/compose/docker-compose.prod.yml up -d perception
```

---

## 9. 性能基线

| 指标 | Mac 目标 | Linux 目标 |
|------|----------|-----------|
| 人脸检测 FPS | ≥ 15 | ≥ 30 |
| 指标采集 P95 | < 100ms | < 100ms |
| API p95 延迟 | < 200ms | < 200ms |
| 内存占用 | < 500MB | < 1GB |

---

## 10. 测试

```bash
# 全量测试
uv run pytest services/perception/

# 带覆盖率
uv run pytest services/perception/ --cov=services/perception/app

# 性能测试
uv run python services/perception/tests/perf/face_fps.py
uv run python services/perception/tests/perf/metrics_latency.py
```
