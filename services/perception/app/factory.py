"""Factory for switching between Mac/Linux implementations.

Iron rule: api/workers layers ONLY import from this module or base modules.
Never import mac.py / linux.py directly in api or workers.
"""

from __future__ import annotations

from typing import Any

from app.config import settings


def create_camera() -> Any:
    """Create CameraSource based on platform."""
    if settings.platform == "mac":
        from app.core.camera.mac import MacCameraSource

        return MacCameraSource()
    else:
        from app.core.camera.linux import LinuxCameraSource

        return LinuxCameraSource()


def create_metrics_provider() -> Any:
    """Create MetricsProvider based on platform."""
    if settings.platform == "mac":
        from app.core.hardware.mac import MacMetricsProvider

        return MacMetricsProvider()
    else:
        from app.core.hardware.linux import LinuxMetricsProvider

        return LinuxMetricsProvider()


def create_serial_port() -> Any:
    """Create SerialPort based on config."""
    if settings.serial_port == "mock":
        from app.core.serial.mock import MockSerialPort

        return MockSerialPort()
    else:
        from app.core.serial.pyserial import PyserialPort

        return PyserialPort()


def create_screen_orientation() -> Any:
    """Create ScreenOrientation based on platform."""
    if settings.platform == "mac":
        from app.core.screen.mock import MockScreenOrientation

        return MockScreenOrientation()
    else:
        from app.core.screen.linux import LinuxScreenOrientation

        return LinuxScreenOrientation()


def create_vm_backend() -> Any:
    """Create VMBackend based on config."""
    if settings.vm_backend == "mock":
        from app.core.vm.mock import MockVMBackend

        return MockVMBackend()
    else:
        from app.core.vm.vboxmanage import VBoxManageBackend

        return VBoxManageBackend()


def create_speech_engine() -> Any:
    """Create SpeechEngine based on config."""
    if settings.speech_provider == "mock":
        from app.core.speech.mock import MockSpeechEngine

        return MockSpeechEngine()
    else:
        from app.core.speech.funasr_engine import FunASREngine

        return FunASREngine(
            model=settings.speech_model,
            device=settings.speech_device,
        )


def create_network_scanner() -> Any:
    """Create NetworkScanner based on platform."""
    if settings.platform == "mac":
        from app.core.network.mock import MockNetworkScanner

        return MockNetworkScanner()
    else:
        from app.core.network.scanner import LinuxNetworkScanner

        return LinuxNetworkScanner()
