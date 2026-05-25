"""Mock SerialPort — logs payloads, returns fixed ACK.

Mac default. parseAndLog the frame structure for debugging.
"""

from __future__ import annotations

import struct

import structlog

logger = structlog.get_logger(subsystem="serial")

# Fixed ACK response
_ACK = bytes([0xAA, 0x02, 0x01, 0x00, 0x00])


class MockSerialPort:
    """Mock serial port for Mac development."""

    def __init__(self) -> None:
        self._port: str = ""
        self._baud: int = 0
        self._open: bool = False

    async def open(self, port: str = "mock", baud: int = 115200) -> None:
        self._port = port
        self._baud = baud
        self._open = True
        logger.info("serial_mock_open", port=port, baud=baud)

    async def write(self, payload: bytes) -> None:
        if not self._open:
            raise RuntimeError("Serial port not opened")

        parsed = self._parse_frame(payload)
        logger.info(
            "serial_mock_write",
            port=self._port,
            raw_len=len(payload),
            parsed=parsed,
        )

    async def read(self, n: int, timeout_ms: int = 1000) -> bytes:
        if not self._open:
            raise RuntimeError("Serial port not opened")
        logger.debug("serial_mock_read", requested=n, returning=len(_ACK))
        return _ACK[:n]

    async def close(self) -> None:
        self._open = False
        logger.info("serial_mock_closed", port=self._port)

    @staticmethod
    def _parse_frame(data: bytes) -> dict:
        """Parse protocol frame for logging. Returns dict or error."""
        if len(data) < 5:
            return {"error": "frame too short", "raw_len": len(data)}
        if data[0] != 0xAA:
            return {"error": "invalid start byte", "got": hex(data[0])}

        length = data[1]
        cmd = data[2]
        payload = data[3 : 3 + length - 2]  # length includes cmd + crc
        result: dict = {"cmd": hex(cmd), "length": length}

        if cmd == 0x01 and len(payload) >= 6:
            dx, dy, depth = struct.unpack_from("<hhH", payload, 0)
            result["dx"] = dx
            result["dy"] = dy
            result["depth_mm"] = depth

        return result
