"""Presence state machine — computes user presence from face tracking.

Phase M1: fixed mock state output. Will be driven by FaceLoop
tracking state in M3 when real camera integration lands.

State machine:
  unknown → near (someone approaching)
  near → engaged (face recognized + tracking)
  engaged → near (face lost but still close)
  near → away (no one present)
"""

from __future__ import annotations

import asyncio
from contextlib import suppress
from enum import StrEnum
from typing import Any

import structlog

from app.ws.publisher import EventPublisher

logger = structlog.get_logger(subsystem="presence")


class PresenceState(StrEnum):
    UNKNOWN = "unknown"
    NEAR = "near"
    ENGAGED = "engaged"
    AWAY = "away"


class PresenceEngine:
    """Tracks presence state and publishes WS events at 1Hz."""

    def __init__(self, publisher: EventPublisher, mock: bool = True) -> None:
        self._publisher = publisher
        self._mock = mock
        self._state = PresenceState.AWAY
        self._running = False
        self._task: asyncio.Task | None = None
        # For mock: cycle states on a timer
        self._mock_cycle_index = 0
        self._mock_states = [
            PresenceState.AWAY,
            PresenceState.NEAR,
            PresenceState.ENGAGED,
            PresenceState.NEAR,
            PresenceState.AWAY,
        ]
        self._mock_hold_ticks = 5  # hold each mock state for 5 ticks

    @property
    def state(self) -> PresenceState:
        return self._state

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info("presence_loop_started", mock=self._mock)

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            with suppress(asyncio.CancelledError):
                await self._task
        logger.info("presence_loop_stopped")

    async def _run_loop(self) -> None:
        with suppress(asyncio.CancelledError):
            while self._running:
                try:
                    await self._tick()
                except Exception as e:
                    logger.warning("presence_tick_error", error=str(e))
                await asyncio.sleep(1.0)  # 1Hz

    async def _tick(self) -> None:
        new_state = self._mock_tick() if self._mock else self._state

        if new_state != self._state:
            prev = self._state
            self._state = new_state
            logger.info("presence_changed", previous=prev, current=new_state)
            await self._publish_transition(prev, new_state)

    def _mock_tick(self) -> PresenceState:
        idx = (self._mock_cycle_index // self._mock_hold_ticks) % len(self._mock_states)
        self._mock_cycle_index += 1
        return self._mock_states[idx]

    async def _publish_transition(
        self, prev: PresenceState, current: PresenceState
    ) -> None:
        event: dict[str, Any] | None = None

        if current == PresenceState.NEAR:
            event = {"type": "presence.near", "distance": 1.5, "user_id": None}
        elif current == PresenceState.ENGAGED:
            event = {"type": "presence.engaged", "user_id": "mock-user-1"}
        elif current == PresenceState.AWAY:
            event = {"type": "presence.away", "user_id": None}

        if event:
            await self._publisher.publish(event)
