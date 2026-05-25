# C · W3 人脸识别与录入

> 完成时间：2026-05-20

## 交付物

### 1. 模型下载

| 模型 | 路径 | 用途 |
|------|------|------|
| InsightFace buffalo_l | `models/models/buffalo_l/` | 检测 + ArcFace 识别 |
| det_10g.onnx | buffalo_l 子目录 | 人脸检测 |
| w600k_r50.onnx | buffalo_l 子目录 | ArcFace embedding (512 维) |
| YOLOv8n | `yolov8n.pt` | 备用检测器 |

### 2. 人脸识别器

`app/core/face/recognizer.py`：
- InsightFace 提取 512 维 embedding
- 余弦相似度匹配，阈值 ≥ 0.62 = 匹配
- 支持多用户注册
- 平均 embedding 策略（5-10 帧取平均）

### 3. 人脸录入

`app/core/face/enrollment.py`：
- 流程：start → add_frame × N → finalize
- 最少 5 帧，最多 10 帧
- 只存 embedding，不存图像（隐私保护）

### 4. face.enroll Skill

```
packages/skills/face/enroll/
├── skill.md        # 定义 + 触发示例
├── handler.py      # mock + real 实现
└── schema.json     # 输入输出 schema
```

### 5. 更新 face_loop

- 集成 FaceRecognizer
- wake 事件带 user_id + confidence
- 识别到已注册用户 → `wake(user_id="alice", confidence=0.85)`

### 6. 测试覆盖

| 测试文件 | 数量 | 覆盖 |
|----------|------|------|
| test_face_recognizer.py | 8 | 注册、识别、阈值、多用户、删除、平均 |
| test_face_enrollment.py | 7 | 录入流程、帧数要求、取消 |
| **合计** | **15** | |

### 7. 验收结果

- [x] InsightFace buffalo_l 模型下载完成
- [x] ArcFace 识别（余弦相似度 ≥ 0.62）
- [x] 人脸录入流程（5-10 帧 → 平均 embedding）
- [x] wake 事件带 user_id + confidence
- [x] 隐私保护：只存 embedding
- [x] 63 个测试全绿
