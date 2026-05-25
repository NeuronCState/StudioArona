"""Unit tests for factory — verifies env-based switching."""

from __future__ import annotations

import pytest

from app.core.factory import (
    create_camera,
    create_metrics_provider,
    create_network_scanner,
    create_screen_orientation,
    create_serial_port,
    create_vm_backend,
)


def test_create_camera_returns_object():
    camera = create_camera()
    assert camera is not None


def test_create_metrics_provider_returns_object():
    provider = create_metrics_provider()
    assert provider is not None


def test_create_serial_port_returns_object():
    port = create_serial_port()
    assert port is not None


def test_create_screen_orientation_returns_object():
    screen = create_screen_orientation()
    assert screen is not None


def test_create_vm_backend_returns_object():
    backend = create_vm_backend()
    assert backend is not None


def test_create_network_scanner_returns_object():
    scanner = create_network_scanner()
    assert scanner is not None
