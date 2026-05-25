# C · W5 Network Skill 与周期采集

> 完成时间：2026-05-21

## 交付物

### 1. Network Skill（2 个）

| Skill | 说明 | 三件套 |
|-------|------|--------|
| network.list_devices | 列出局域网设备（12 台 mock） | skill.md + handler.py + schema.json |
| network.device_detail | 查看设备详情（端口/OS） | skill.md + handler.py + schema.json |

### 2. 周期采集 Worker

| Worker | 功能 | 默认间隔 |
|--------|------|----------|
| MetricsLoop | 硬件快照 → WS metrics_update | 30s |
| VMStatusLoop | VM 状态轮询 | 10s |

### 3. 测试覆盖（10 个）

| 测试 | 覆盖 |
|------|------|
| test_list_devices_mock | 12 台设备 |
| test_list_devices_has_required_fields | 字段完整性 |
| test_list_devices_some_offline | 随机离线 |
| test_device_detail_known_ip | 已知 IP |
| test_device_detail_unknown_ip | 未知 IP 兜底 |
| test_device_detail_no_ip | 缺少参数 |
| test_metrics_loop_collect_once | 单次采集 |
| test_metrics_loop_start_stop | 启停控制 |
| test_vm_status_loop_poll_once | 空轮询 |
| test_vm_status_loop_with_vms | 有 VM 时轮询 |

### 4. 验收结果

- [x] network.list_devices / device_detail Skill
- [x] MetricsLoop / VMStatusLoop 周期采集
- [x] training_jobs 假数据已在 Mac metrics mock 中
- [x] 85 个测试全绿
