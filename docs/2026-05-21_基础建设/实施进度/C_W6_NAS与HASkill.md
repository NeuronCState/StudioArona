# C · W6 NAS 与 HomeAssistant Skill

> 完成时间：2026-05-21

## 交付物

### 1. NAS Skill（2 个）

| Skill | 说明 | 三件套 |
|-------|------|--------|
| nas.list_recent | NAS 最近文件（12 台 mock） | skill.md + handler.py + schema.json |
| nas.search | NAS 搜索（关键词匹配） | skill.md + handler.py + schema.json |

### 2. HomeAssistant Skill（2 个）

| Skill | 说明 | 三件套 |
|-------|------|--------|
| ha.list_devices | HA 设备列表（10 台 mock） | skill.md + handler.py + schema.json |
| ha.toggle | 切换设备开/关 | skill.md + handler.py + schema.json |

### 3. Mock 数据

**NAS mock 文件**（12 个）：
- project-final-v3.zip, training-data-2026.tar.gz, meeting-notes-0520.md
- model-checkpoint-epoch50.pt, poster-draft.pdf, experiment-results.xlsx
- video-demo-cut.mp4, slides-defense.pptx, backup-2026-05-20.tar.gz
- readme-update.md, dataset-v2-cleaned.csv, photo-lab-0520.jpg

**HA mock 设备**（10 个）：
- 工作室主灯、氛围灯、投影仪、空调
- 温度/湿度传感器、窗帘、音箱
- 入口摄像头、门锁

### 4. 测试覆盖（14 个）

| 测试 | 覆盖 |
|------|------|
| test_nas_list_recent | 列表返回 |
| test_nas_list_recent_with_limit | limit 参数 |
| test_nas_list_recent_filter_user | 用户过滤 |
| test_nas_list_recent_has_fields | 字段完整性 |
| test_nas_search | 搜索匹配 |
| test_nas_search_no_query | 缺少 query |
| test_nas_search_has_relevance | relevance 字段 |
| test_ha_list_devices | 设备列表 |
| test_ha_list_devices_has_fields | 字段完整性 |
| test_ha_toggle | 切换状态 |
| test_ha_toggle_no_entity | 缺少 entity_id |
| test_ha_toggle_inverts_state | 状态反转 |

### 5. 验收结果

- [x] nas.list_recent / search Skill
- [x] ha.list_devices / toggle Skill
- [x] Mock 数据有意义（真实文件名/设备名）
- [x] 97 个测试全绿

## 累计 Skill 清单

| 域 | Skill | 状态 |
|----|-------|------|
| system | metrics_snapshot, list_training_jobs | 占位 |
| vm | list, create, start, stop, destroy, upload_archive | ✅ 完成 |
| network | list_devices, device_detail | ✅ 完成 |
| nas | list_recent, search | ✅ 完成 |
| ha | list_devices, toggle | ✅ 完成 |
| face | enroll | ✅ 完成 |
