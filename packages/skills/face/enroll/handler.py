"""face.enroll Skill handler.

Manages face enrollment workflow:
- start: begin enrollment for a user
- add_frame: add a camera frame for embedding extraction
- finalize: compute average embedding and register
- cancel: abort enrollment
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class Context:
    is_mock: bool = False
    mock_data_path: str = ""
    # In production, these would be injected by the Agent runtime
    recognizer: Any = None
    enrollment: Any = None


@dataclass
class Result:
    ok: bool
    data: dict[str, Any] | None = None
    error: str | None = None


async def handler(ctx: Context, **inputs: Any) -> Result:
    """Skill handler for face enrollment.

    Args:
        ctx: Execution context with recognizer/enrollment services
        **inputs: user_id (str), action (start|add_frame|finalize|cancel)
    """
    user_id = inputs.get("user_id")
    action = inputs.get("action")

    if not user_id:
        return Result(ok=False, error="user_id is required")
    if not action:
        return Result(ok=False, error="action is required")

    # Mock mode — simulate enrollment
    if ctx.is_mock:
        return _handle_mock(user_id, action)

    # Real mode — use enrollment service
    if ctx.enrollment is None:
        return Result(ok=False, error="enrollment service not available")

    try:
        if action == "start":
            success = await ctx.enrollment.start_enrollment(user_id)
            return Result(
                ok=success,
                data={"status": "started" if success else "already_in_progress"},
            )
        elif action == "add_frame":
            # In real mode, frame would come from camera
            # This is typically called by the agent after capturing a frame
            count = await ctx.enrollment.add_embedding(user_id, None)
            return Result(
                ok=True,
                data={"status": "frame_added", "frames_collected": count},
            )
        elif action == "finalize":
            success = await ctx.enrollment.finalize(user_id)
            return Result(
                ok=success,
                data={"status": "completed" if success else "insufficient_frames"},
            )
        elif action == "cancel":
            success = await ctx.enrollment.cancel(user_id)
            return Result(
                ok=success,
                data={"status": "cancelled"},
            )
        else:
            return Result(ok=False, error=f"unknown action: {action}")

    except Exception as e:
        return Result(ok=False, error=str(e))


def _handle_mock(user_id: str, action: str) -> Result:
    """Mock handler — returns realistic fake data."""
    if action == "start":
        return Result(ok=True, data={"status": "started", "user_id": user_id})
    elif action == "add_frame":
        return Result(ok=True, data={"status": "frame_added", "frames_collected": 3})
    elif action == "finalize":
        return Result(ok=True, data={"status": "completed", "user_id": user_id})
    elif action == "cancel":
        return Result(ok=True, data={"status": "cancelled"})
    else:
        return Result(ok=False, error=f"unknown action: {action}")
