"""ha.list_devices Skill handler."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class Context:
    is_mock: bool = False
    ha_client: Any = None


@dataclass
class Result:
    ok: bool
    data: dict[str, Any] | None = None
    error: str | None = None


_MOCK_DEVICES = [
    {"entity_id": "light.studio_main", "name": "工作室主灯", "state": "on", "type": "light"},
    {"entity_id": "light.studio_accent", "name": "氛围灯", "state": "off", "type": "light"},
    {"entity_id": "switch.studio_projector", "name": "投影仪", "state": "off", "type": "switch"},
    {"entity_id": "climate.studio_ac", "name": "空调", "state": "cooling", "type": "climate"},
    {"entity_id": "sensor.studio_temp", "name": "温度传感器", "state": "24.5", "type": "sensor"},
    {"entity_id": "sensor.studio_humidity", "name": "湿度传感器", "state": "55", "type": "sensor"},
    {"entity_id": "cover.studio_blinds", "name": "窗帘", "state": "open", "type": "cover"},
    {"entity_id": "media_player.studio_speaker", "name": "音箱", "state": "idle", "type": "media_player"},
    {"entity_id": "camera.studio_entrance", "name": "入口摄像头", "state": "recording", "type": "camera"},
    {"entity_id": "lock.studio_door", "name": "门锁", "state": "locked", "type": "lock"},
]


async def handler(ctx: Context, **inputs: Any) -> Result:
    if ctx.is_mock:
        return Result(ok=True, data={"devices": _MOCK_DEVICES})

    if ctx.ha_client is None:
        return Result(ok=False, error="HomeAssistant client not available")

    try:
        devices = await ctx.ha_client.list_devices()
        return Result(ok=True, data={"devices": devices})
    except Exception as e:
        return Result(ok=False, error=str(e))
