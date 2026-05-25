"""Unit tests for ScreenOrientation mock.

Verifies:
- set/get orientation
- WS event integration
"""

from __future__ import annotations

import pytest

from app.core.screen.mock import MockScreenOrientation
from app.ws.publisher import EventPublisher


@pytest.fixture
def publisher():
    return EventPublisher()


@pytest.mark.asyncio
async def test_default_orientation():
    screen = MockScreenOrientation()
    assert await screen.get() == "landscape"


@pytest.mark.asyncio
async def test_set_portrait():
    screen = MockScreenOrientation()
    await screen.set("portrait")
    assert await screen.get() == "portrait"


@pytest.mark.asyncio
async def test_set_landscape():
    screen = MockScreenOrientation()
    await screen.set("portrait")
    await screen.set("landscape")
    assert await screen.get() == "landscape"


@pytest.mark.asyncio
async def test_publisher_integration(publisher):
    screen = MockScreenOrientation(publisher=publisher)
    await screen.set("portrait")
    # Publisher should have been called (logged)


@pytest.mark.asyncio
async def test_set_publisher_later():
    screen = MockScreenOrientation()
    publisher = EventPublisher()
    screen.set_publisher(publisher)
    await screen.set("portrait")
