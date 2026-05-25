# C · W4 VM 生命周期管理

> 完成时间：2026-05-21

## 交付物

### 1. VM Skill 全套（6 个）

| Skill | 说明 | risk | 三件套 |
|-------|------|------|--------|
| vm.list | 列出 VM | low | skill.md + handler.py + schema.json |
| vm.create | 创建 VM | high | skill.md + handler.py + schema.json |
| vm.start | 启动 VM | low | skill.md + handler.py + schema.json |
| vm.stop | 停止 VM | low | skill.md + handler.py + schema.json |
| vm.destroy | 销毁 VM（需 confirm） | high | skill.md + handler.py + schema.json |
| vm.upload_archive | 上传文件到 VM | medium | skill.md + handler.py + schema.json |

### 2. VM Mock 状态机

- creating → running（模拟 8 秒延迟）
- running → stopped → running
- any → destroyed（不可逆）
- upload 存到 `tmp/vm-uploads/`

### 3. Upload 安全校验

- 文件大小限制：100MB
- 文件存在性检查
- risk=high 操作需 confirm=true

### 4. 测试覆盖（12 个）

| 测试 | 覆盖 |
|------|------|
| test_vm_list_mock | mock 列表 |
| test_vm_list_filter_owner | 按 owner 过滤 |
| test_vm_create_mock | 创建参数 |
| test_vm_create_no_name | 缺少必填 |
| test_vm_start_mock | 启动状态 |
| test_vm_start_no_id | 缺少 vm_id |
| test_vm_stop_mock | 停止状态 |
| test_vm_destroy_no_confirm | 未确认被拒 |
| test_vm_destroy_with_confirm | 确认销毁 |
| test_upload_mock | mock 上传 |
| test_upload_file_not_found | 文件不存在 |
| test_upload_no_vm_id | 缺少 vm_id |

### 5. 验收结果

- [x] VM mock 状态机完整
- [x] 6 个 VM Skill 全部可用
- [x] risk=high 需二次确认
- [x] 75 个测试全绿
