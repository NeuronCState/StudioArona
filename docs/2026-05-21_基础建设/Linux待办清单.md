# Linux 待办清单

> 本文件列出 Mac 阶段完成后，Linux 阶段需要做的所有事项。
> 由 C（系统集成工程师）维护。

---

## 1. 硬件适配

### 1.1 摄像头
- [ ] V4L2 设备路径确认（`/dev/video0`）
- [ ] 摄像头物理安装 + 视场对工作室桌面适配
- [ ] 分辨率 / FPS 验证
- [ ] 摄像头权限（`/dev/video0` 权限 + docker `--device`）

### 1.2 串口
- [ ] 真串口连接（`/dev/ttyUSB0`）
- [ ] 与张洪瀚组联调机械臂
- [ ] 波特率 / 协议冻结版验证
- [ ] 串口权限（dialout 组）

### 1.3 屏幕
- [ ] `wlr-randr` 或 `xrandr` 真实旋屏
- [ ] 物理屏幕兼容性测试
- [ ] 旋屏 + WS 事件联调

---

## 2. GPU 与推理

### 2.1 CUDA 环境
- [ ] NVIDIA Container Toolkit 安装
- [ ] Docker `--gpus all` 验证
- [ ] CUDA 12.x + cuDNN 版本确认

### 2.2 模型推理
- [ ] InsightFace buffalo_l 在 CUDA 下加载
- [ ] ArcFace embedding 性能（目标 ≥30 fps）
- [ ] YOLO 检测 CUDA 推理
- [ ] GPU 显存占用监控

### 2.3 训练任务识别
- [ ] nvidia-smi 进程解析
- [ ] GPU 进程归类到用户
- [ ] training_jobs 真实数据接入

---

## 3. 系统监控

### 3.1 硬件指标
- [ ] psutil + nvidia-smi 真实数据
- [ ] GPU 温度 / 功耗 / 显存
- [ ] 磁盘 I/O 监控

### 3.2 Metrics 写库
- [ ] system_metrics_snapshot 表创建（D 的 alembic）
- [ ] 周期采集写入策略（每 30s）
- [ ] 数据保留策略（待 D 确认）

---

## 4. 虚拟机

### 4.1 VBoxManage
- [ ] VirtualBox 安装 + 配置
- [ ] VM 创建 / 启动 / 停止 / 销毁
- [ ] 网络配置（NAT / host-only）
- [ ] 快照策略
- [ ] ttyd SSH web 终端

### 4.2 Upload
- [ ] VBoxManage guestcontrol 文件上传
- [ ] 大小 / 类型限制
- [ ] zip-slip 防护

---

## 5. 网络扫描

### 5.1 nmap
- [ ] nmap 安装 + 权限（sudo 或 capabilities）
- [ ] ping scan + ARP 表
- [ ] 端口扫描

### 5.2 SNMP
- [ ] 交换机 SNMP 配置（要管理员协调）
- [ ] 端口映射查询

---

## 6. NAS 与 HomeAssistant

### 6.1 NAS
- [ ] Samba / NFS 挂载点配置
- [ ] 真实查询接口
- [ ] 文件搜索（文件名 + 内容）

### 6.2 HomeAssistant
- [ ] 长期 Access Token 获取
- [ ] REST API 接入
- [ ] 设备列表 / 状态查询 / 切换

---

## 7. 安全

- [ ] Skill 沙箱（nsjail / firejail）
- [ ] 网络扫描权限边界
- [ ] 串口访问权限控制
- [ ] 摄像头隐私保护（帧不落盘验证）

---

## 8. Docker 部署

- [ ] Dockerfile.perception 构建
- [ ] GPU 直通（`--gpus all`）
- [ ] 摄像头直通（`--device /dev/video0`）
- [ ] 串口直通（`--device /dev/ttyUSB0`）
- [ ] 环境变量配置（`.env.production`）

---

## 9. 性能调优

- [ ] 人脸检测 FPS（目标 ≥30 fps CUDA）
- [ ] 指标采集延迟（目标 <100ms）
- [ ] 内存占用优化
- [ ] 模型预加载策略

---

## 10. 联调

- [ ] A：face_track / wake / leave 事件联调
- [ ] A：rotate_screen 事件联调
- [ ] B：Skill handler 调用联调
- [ ] D：api-gateway 反代 + WS 事件转发
- [ ] D：metrics 写库联调
- [ ] 张洪瀚组：串口协议 + 机械臂联调
