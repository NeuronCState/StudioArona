# C · W1 服务骨架与外设抽象

> 完成时间：2026-05-20

## 交付物

### 1. 服务骨架

```
services/perception/
├── pyproject.toml                      # 依赖配置
├── app/
│   ├── main.py                         # FastAPI 入口 (lifespan)
│   ├── config.py                       # Settings from env
│   ├── api/{system,vms,network}.py     # API 路由
│   ├── core/factory.py                 # 工厂：env → Mac/Linux 切换
│   └── ws/publisher.py                 # 事件发布
└── tests/                              # 25 个测试
```

### 2. 外设抽象层（每个都有 base + mac + linux）

| 资源 | Protocol | Mac 实现 | Linux 占位 |
|------|----------|----------|-----------|
| 摄像头 | CameraSource | OpenCV VideoCapture(0) | V4L2 |
| 硬件监控 | MetricsProvider | psutil + 假 GPU V100 | nvidia-smi |
| 串口 | SerialPort | Mock 打日志 | pyserial |
| 屏幕方向 | ScreenOrientation | Mock + WS 事件 | wlr-randr |
| VM | VMBackend | 内存状态机 (8s 创建) | VBoxManage |
| 网络 | NetworkScanner | 12 台假设备 | nmap + ARP |

### 3. API 端点

- `GET /health` → 健康检查
- `GET /api/system/metrics` → SystemMetrics 快照
- `GET /api/vms` → VM 列表
- `POST /api/vms` → 创建 VM
- `DELETE /api/vms/{id}` → 销毁 VM
- `GET /api/network/devices` → 网络设备列表

### 4. 测试覆盖

| 测试文件 | 数量 | 覆盖 |
|----------|------|------|
| test_hardware_mac.py | 7 | CPU/mem 真, GPU mock V100 |
| test_serial_mock.py | 6 | 帧解析 + 日志 |
| test_vm_mock.py | 6 | 状态机 CRUD |
| test_metrics_api.py | 6 | /api/system/metrics 端到端 |
| **合计** | **25** | |

### 5. 验收结果

- [x] `/api/system/metrics` 返回合法 JSON，匹配 contracts/openapi.yaml
- [x] CPU/mem/disk 为真实 psutil 数据
- [x] GPU 为 mock V100（16GB，~50% 抖动）
- [x] api/workers 层不 import mac/linux 具体实现
- [x] 25 个测试全绿
