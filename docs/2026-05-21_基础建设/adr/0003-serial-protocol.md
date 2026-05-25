# ADR 0003: 串口协议规范

## Context

Studio Javis 需要通过串口与机械臂通信，传递人脸跟踪的目标偏移量。
需要一个简单的二进制协议，支持可靠传输（CRC 校验）。

## Decision

### 帧格式

```
[0xAA][len][cmd][payload...][crc16]
```

- **0xAA**：起始字节
- **len**：payload 长度 + 2（cmd + crc）
- **cmd**：命令字节
- **payload**：变长数据
- **crc16**：CRC16-CCITT（0xFFFF init, poly 0x1021），小端序

### 命令定义

| cmd | 名称 | payload | 说明 |
|-----|------|---------|------|
| 0x01 | SET_TARGET | int16 dx, int16 dy, uint16 depth_mm | 设置目标偏移 |

### 编码细节

- 所有多字节整数为**小端序**
- dx, dy 为 int16（有符号，单位：像素偏移）
- depth_mm 为 uint16（无符号，单位：毫米）

### 示例

设置 dx=100, dy=-50, depth=1200mm：

```
AA 08 01 64 00 CE FF B8 04 CRC_L CRC_H
│  │  │  └───┘  └───┘  └───┘  └────────┘
│  │  │  dx=100  dy=-50  d=1200  CRC16
│  │  cmd=SET_TARGET
│  len=8 (6 payload + 2 crc)
START
```

## Consequences

### 正面
- 简单紧凑，解析效率高
- CRC16 保证数据完整性
- 支持扩展新 cmd

### 负面
- 无重传机制（依赖应用层）
- 无序列号（无法检测丢帧）

## Alternatives considered

- **Modbus RTU**：太重，机械臂不需要
- **自定义文本协议**：解析慢，不适合实时控制
- **Protobuf**：过度设计，增加依赖

## 状态

**已冻结**（W2 末与张洪瀚组确认）。
