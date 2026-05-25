---
name: vm.upload_archive
version: 0.1.0
owner: C
scopes: [vm.write]
mac_mock: true
inputs:
  vm_id: { type: string, required: true }
  file_path: { type: string, required: true }
  dst_path: { type: string, default: /tmp/upload }
outputs:
  ok: { type: boolean }
  filename: { type: string }
risk: medium
timeout_ms: 30000
rate_limit: 5/min
---
# 上传文件到虚拟机

上传压缩包或文件到运行中的虚拟机。

## 触发示例
- "上传文件到虚拟机"
- "把代码传到服务器"
- "upload to vm"

## 注意
- Mac 阶段：mock 存到 tmp/vm-uploads/。
- Linux 阶段：通过 VBoxManage guestcontrol 上传。
- 文件大小限制 100MB。
- 压缩包会自动解压前扫描（zip-slip 防护）。
