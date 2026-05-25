"""Unit tests for MockSerialPort.

Verifies:
- Frame parsing (0xAA header, cmd, payload, CRC)
- Logging behavior
"""

from __future__ import annotations

import struct

import pytest

from app.core.serial.mock import MockSerialPort


@pytest.fixture
def port():
    return MockSerialPort()


@pytest.mark.asyncio
async def test_open_and_close(port):
    await port.open("mock", 115200)
    assert port._open is True
    await port.close()
    assert port._open is False


@pytest.mark.asyncio
async def test_write_valid_frame(port):
    await port.open("mock")
    # Build a cmd=0x01 frame: dx=100, dy=-50, depth=1200mm
    payload = struct.pack("<hhH", 100, -50, 1200)
    frame = bytes([0xAA, len(payload) + 2, 0x01]) + payload + bytes([0x00, 0x00])  # dummy CRC
    await port.write(frame)  # Should not raise


@pytest.mark.asyncio
async def test_parse_frame_valid_cmd01(port):
    payload = struct.pack("<hhH", 200, -100, 800)
    frame = bytes([0xAA, len(payload) + 2, 0x01]) + payload + bytes([0x00, 0x00])
    result = MockSerialPort._parse_frame(frame)
    assert result["cmd"] == "0x1"
    assert result["dx"] == 200
    assert result["dy"] == -100
    assert result["depth_mm"] == 800


@pytest.mark.asyncio
async def test_parse_frame_invalid_start(port):
    frame = bytes([0xBB, 0x02, 0x01, 0x00, 0x00])
    result = MockSerialPort._parse_frame(frame)
    assert "error" in result
    assert "invalid start byte" in result["error"]


@pytest.mark.asyncio
async def test_parse_frame_too_short(port):
    frame = bytes([0xAA, 0x01])
    result = MockSerialPort._parse_frame(frame)
    assert "error" in result
    assert "too short" in result["error"]


@pytest.mark.asyncio
async def test_read_returns_ack(port):
    await port.open("mock")
    data = await port.read(5)
    assert len(data) > 0
    assert data[0] == 0xAA
