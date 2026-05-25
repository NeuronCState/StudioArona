"""{{skill_name}} Skill handler."""

from dataclasses import dataclass
from typing import Any


@dataclass
class Context:
    is_mock: bool = False
    mock_data_path: str = ""


@dataclass
class Result:
    ok: bool
    data: dict[str, Any] | None = None
    error: str | None = None


async def handler(ctx: Context, **inputs: Any) -> Result:
    """Skill 实现入口。

    Args:
        ctx: 由 Agent runtime 注入的执行上下文
        **inputs: 从 skill.md frontmatter inputs 映射来的参数

    Returns:
        Result
    """
    if ctx.is_mock:
        return Result(ok=True, data={"message": "mock"})

    # TODO: 真实实现
    return Result(ok=True, data={})
