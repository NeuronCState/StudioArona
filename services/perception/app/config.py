"""Perception service configuration.

All env vars match .env.example exactly — no renaming.
"""

from __future__ import annotations

import os
from enum import Enum
from typing import Literal

from pydantic import BaseModel


class Platform(str, Enum):
    MAC = "mac"
    LINUX = "linux"
    WINDOWS = "windows"


def _detect_platform() -> str:
    """Auto-detect platform from sys.platform."""
    import sys
    if sys.platform == "darwin":
        return "mac"
    elif sys.platform == "win32":
        return "windows"
    return "linux"


class Settings(BaseModel):
    """Perception service settings loaded from environment."""

    platform: Literal["mac", "linux", "windows", "auto"] = "auto"
    camera_device: int | str = 0
    face_threshold: float = 0.62
    track_fps: int = 15
    serial_port: str = "mock"
    vm_backend: str = "mock"

    # Mock switches
    mock_nas: bool = True
    mock_ha: bool = True
    mock_vm: bool = True
    mock_hardware: bool = True
    mock_serial: bool = True

    # Speech
    speech_provider: str = "mock"
    speech_model: str = "iic/SenseVoiceSmall"
    speech_device: str = "cpu"

    # Service
    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "debug"

    # api-gateway URL for WS event push
    gateway_url: str = "http://localhost:8080"

    @classmethod
    def from_env(cls) -> Settings:
        raw_platform = os.getenv("PERCEPTION_PLATFORM", "auto")
        if raw_platform == "auto":
            raw_platform = _detect_platform()
        return cls(
            platform=raw_platform,  # type: ignore[arg-type]
            camera_device=_parse_camera_device(os.getenv("PERCEPTION_CAMERA_DEVICE", "0")),
            face_threshold=float(os.getenv("PERCEPTION_FACE_THRESHOLD", "0.62")),
            track_fps=int(os.getenv("PERCEPTION_TRACK_FPS", "15")),
            serial_port=os.getenv("PERCEPTION_SERIAL_PORT", "mock"),
            vm_backend=os.getenv("PERCEPTION_VM_BACKEND", "mock"),
            mock_nas=os.getenv("MOCK_NAS", "true").lower() == "true",
            mock_ha=os.getenv("MOCK_HA", "true").lower() == "true",
            mock_vm=os.getenv("MOCK_VM", "true").lower() == "true",
            mock_hardware=os.getenv("MOCK_HARDWARE", "true").lower() == "true",
            mock_serial=os.getenv("MOCK_SERIAL", "true").lower() == "true",
            speech_provider=os.getenv("PERCEPTION_SPEECH_PROVIDER", "mock"),
            speech_model=os.getenv("PERCEPTION_SPEECH_MODEL", "iic/SenseVoiceSmall"),
            speech_device=os.getenv("PERCEPTION_SPEECH_DEVICE", "cpu"),
            host=os.getenv("PERCEPTION_HOST", "0.0.0.0"),
            port=int(os.getenv("PERCEPTION_PORT", "8000")),
            log_level=os.getenv("LOG_LEVEL", "debug"),
            gateway_url=os.getenv("PERCEPTION_GATEWAY_URL", "http://localhost:8080"),
        )


def _parse_camera_device(raw: str) -> int | str:
    try:
        return int(raw)
    except ValueError:
        return raw


settings = Settings.from_env()
