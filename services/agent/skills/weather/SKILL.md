---
name: weather
description: "查询当前天气：温度、湿度、风力、体感温度、紫外线指数。基于 IP 自动定位。"
metadata:
  openclaw:
    emoji: "🌤️"
---

# 天气查询

查询工作室所在地的实时天气。数据来源 Open-Meteo，IP 自动定位（ip-api.com）。

## 命令

### 查询天气

```bash
curl -s "http://localhost:8080/api/weather"
```

## 返回字段
- `city` — 城市
- `temperature` — 温度 (°C)
- `condition` — 天气状况（Clear/Partly Cloudy/Rain/Snow 等）
- `humidity` — 湿度 (%)
- `wind_speed` — 风速
- `wind_direction` — 风向（N/NE/E/SE/S/SW/W/NW）
- `feels_like` — 体感温度 (°C)
- `uv_index` — 紫外线指数（Low/Moderate/High/Very High/Extreme）

## 触发示例

- "今天天气怎么样"
- "外面冷不冷"
- "需要带伞吗"
- "紫外线强吗"

## 注意

- 免费 API，无需密钥
- IP 定位在本地开发环境可能不准确（显示默认城市）
