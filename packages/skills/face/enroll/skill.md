---
name: face.enroll
version: 0.1.0
owner: C
scopes: [face.write]
mac_mock: true
inputs:
  user_id: { type: string, required: true }
  action: { type: string, enum: [start, add_frame, finalize, cancel], required: true }
outputs:
  ok: { type: boolean }
  status: { type: string }
  frames_collected: { type: integer }
risk: medium
timeout_ms: 30000
rate_limit: 5/min
---
# 人脸录入

注册新成员的人脸到系统。

## 流程
1. `start` — 开始录入（传入 user_id）
2. `add_frame` — 添加摄像头帧（多次调用，收集 5-10 张）
3. `finalize` — 完成录入，计算平均 embedding 并存储
4. `cancel` — 取消录入

## 触发示例
- "录入我的人脸"
- "注册新成员"
- "添加人脸识别"

## 注意
- Mac 阶段使用真实 InsightFace 模型。
- 只存储 embedding 向量，不存储人脸图像（隐私保护）。
- 每位成员需要 5-10 张不同角度的正面照。
- 录入后可通过 wake 事件识别该成员。
