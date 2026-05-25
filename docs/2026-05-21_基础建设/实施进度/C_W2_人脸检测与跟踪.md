# C · W2 人脸检测与跟踪

> 完成时间：2026-05-20

## 交付物

### 1. 人脸检测器

`app/core/face/detector.py` — 三级降级：
- 优先：InsightFace buffalo_l（检测 + embedding 一体）
- 备选：YOLOv8n
- 兜底：OpenCV Haar cascade

### 2. 人脸跟踪器

`app/core/face/tracker.py` — 低通滤波 + P 控制：
- α = 0.6（滤波系数）
- kp = 0.04（P 控制增益）
- 唤醒：连续 10 帧检测到 → wake 事件
- 离开：连续 30 帧无人脸 → leave 事件
- 抗抖：滑窗投票（80% 阈值）

### 3. 串口协议

`app/core/serial/protocol.py`：
- 帧格式：`[0xAA][len][cmd][payload...][crc16]`
- cmd=0x01：设置目标偏移（dx:2, dy:2, depth:2）
- CRC16-CCITT（0xFFFF init, poly 0x1021）

### 4. 摄像头主循环

`app/workers/face_loop.py`：
```
frame → detect → track → serial write + WS push
```
- face_track 事件（x, y, size）
- wake/leave 事件（状态转换时）
- 串口下发（cmd=0x01 + CRC）

### 5. 测试覆盖

| 测试文件 | 数量 | 覆盖 |
|----------|------|------|
| test_face_detector.py | 4 | 模型加载、空帧、结构、排序 |
| test_face_tracker.py | 8 | 滤波平滑、唤醒、离开、抗抖、偏移 |
| test_serial_protocol.py | 11 | 帧结构、CRC、往返、错误检测 |
| **合计** | **23** | |

### 6. 验收结果

- [x] 人脸检测器（Haar cascade 可用，InsightFace/YOLO 可选）
- [x] 低通滤波平滑（导数 L2 < 原始 70%）
- [x] 串口协议编解码 + CRC16 已知向量验证
- [x] wake/leave 滑窗投票抗抖
- [x] 48 个测试全绿（含 W1 的 25 个）
