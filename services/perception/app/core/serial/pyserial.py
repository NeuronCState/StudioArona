"""Linux SerialPort implementation — pyserial.

Placeholder for Linux stage.
"""

from __future__ import annotations


class PyserialPort:
    """Real serial port via pyserial. Not yet implemented."""

    async def open(self, port: str, baud: int = 115200) -> None:
        raise NotImplementedError("Linux serial: pyserial implementation pending Linux stage")

    async def write(self, payload: bytes) -> None:
        raise NotImplementedError("Linux serial: pyserial implementation pending Linux stage")

    async def read(self, n: int, timeout_ms: int = 1000) -> bytes:
        raise NotImplementedError("Linux serial: pyserial implementation pending Linux stage")

    async def close(self) -> None:
        pass
