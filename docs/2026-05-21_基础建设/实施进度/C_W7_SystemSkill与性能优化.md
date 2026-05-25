# C · W7 System Skill 与性能优化

> 完成时间：2026-05-21

## 交付物

### 1. System Skill（2 个）

| Skill | 说明 | 三件套 |
|-------|------|--------|
| system.metrics_snapshot | 硬件监控快照 | skill.md + handler.py + schema.json |
| system.list_training_jobs | 训练任务列表 | skill.md + handler.py + schema.json |

### 2. ScreenOrientation WS 集成

- MockScreenOrientation 支持 EventPublisher 注入
- `set("portrait")` → 自动推 `screen_changed` 事件
- A 收到事件后可触发前端旋屏

### 3. 性能测试脚本

```
tests/perf/
├── face_fps.py           # 人脸检测 FPS（目标 ≥15）
└── metrics_latency.py    # 指标采集延迟（目标 <100ms）
```

### 4. 性能优化

- `psutil.cpu_percent(interval=0)` — 非阻塞，使用缓存值
- 优化前：P95 110ms → 优化后：P95 0.4ms

### 5. 测试覆盖（+8 个）

| 测试 | 覆盖 |
|------|------|
| test_metrics_snapshot | 指标快照 |
| test_metrics_gpu_is_v100 | GPU mock |
| test_list_training_jobs | 训练任务 |
| test_default_orientation | 默认横屏 |
| test_set_portrait | 切竖屏 |
| test_set_landscape | 切横屏 |
| test_publisher_integration | WS 事件 |
| test_set_publisher_later | 延迟注入 |

### 6. 性能基线

| 指标 | 目标 | 实测 | 状态 |
|------|------|------|------|
| Metrics P95 延迟 | < 100ms | 0.4ms | ✅ PASS |
| Face FPS (Mac) | ≥ 15 fps | 待测（需真实摄像头） | - |

### 7. 验收结果

- [x] system.metrics_snapshot / list_training_jobs Skill
- [x] ScreenOrientation WS 事件集成
- [x] 性能测试脚本
- [x] Metrics 延迟 < 100ms
- [x] 105 个测试全绿

## 累计 Skill 清单（15 个）

| 域 | Skill | 数量 |
|----|-------|------|
| system | metrics_snapshot, list_training_jobs | 2 |
| vm | list, create, start, stop, destroy, upload_archive | 6 |
| network | list_devices, device_detail | 2 |
| nas | list_recent, search | 2 |
| ha | list_devices, toggle | 2 |
| face | enroll | 1 |
| **合计** | | **15** |
