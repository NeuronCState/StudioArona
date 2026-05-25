"""Mock NetworkScanner — returns 12 fake devices.

Mac default. Randomly sets some devices offline.
"""

from __future__ import annotations

import random
import time

import structlog

from app.core.network.base import DeviceDetail, NetworkDevice

logger = structlog.get_logger(subsystem="network")

_MOCK_DEVICES = [
    {"ip": "192.168.1.1", "mac": "AA:BB:CC:DD:EE:01", "hostname": "router", "vendor": "TP-Link"},
    {"ip": "192.168.1.10", "mac": "AA:BB:CC:DD:EE:10", "hostname": "zhang-mbp", "vendor": "Apple"},
    {"ip": "192.168.1.11", "mac": "AA:BB:CC:DD:EE:11", "hostname": "li-desktop", "vendor": "Dell"},
    {"ip": "192.168.1.12", "mac": "AA:BB:CC:DD:EE:12", "hostname": "wang-laptop", "vendor": "Lenovo"},
    {"ip": "192.168.1.20", "mac": "AA:BB:CC:DD:EE:20", "hostname": "nas-synology", "vendor": "Synology"},
    {"ip": "192.168.1.21", "mac": "AA:BB:CC:DD:EE:21", "hostname": "vm-host", "vendor": "Dell"},
    {"ip": "192.168.1.30", "mac": "AA:BB:CC:DD:EE:30", "hostname": "printer-ricoh", "vendor": "Ricoh"},
    {"ip": "192.168.1.31", "mac": "AA:BB:CC:DD:EE:31", "hostname": "camera-entrance", "vendor": "Hikvision"},
    {"ip": "192.168.1.40", "mac": "AA:BB:CC:DD:EE:40", "hostname": "pi-display", "vendor": "Raspberry Pi"},
    {"ip": "192.168.1.41", "mac": "AA:BB:CC:DD:EE:41", "hostname": "esp32-sensor", "vendor": "Espressif"},
    {"ip": "192.168.1.50", "mac": "AA:BB:CC:DD:EE:50", "hostname": "ha-server", "vendor": "Intel NUC"},
    {"ip": "192.168.1.100", "mac": "AA:BB:CC:DD:EE:FF", "hostname": "javis-main", "vendor": "Custom"},
]


class MockNetworkScanner:
    """Mock network scanner for Mac."""

    async def scan(self) -> list[NetworkDevice]:
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        devices = []
        for d in _MOCK_DEVICES:
            online = random.random() > 0.15  # 85% chance online
            devices.append(
                NetworkDevice(
                    ip=d["ip"],
                    mac=d["mac"],
                    hostname=d["hostname"],
                    vendor=d["vendor"],
                    online=online,
                    last_seen=now,
                )
            )
        logger.info("network_mock_scan", total=len(devices), online=sum(1 for d in devices if d.online))
        return devices

    async def device_info(self, ip: str) -> DeviceDetail:
        dev = next((d for d in _MOCK_DEVICES if d["ip"] == ip), None)
        if dev is None:
            raise KeyError(f"Device {ip} not found")
        return DeviceDetail(
            ip=dev["ip"],
            mac=dev["mac"],
            hostname=dev["hostname"],
            vendor=dev["vendor"],
            online=True,
            open_ports=[22, 80],
            os_guess="Linux",
        )
