"""Per-agent-turn Studio Center authentication context."""

from contextvars import ContextVar, Token

center_access_token: ContextVar[str] = ContextVar("center_access_token", default="")
center_base_url: ContextVar[str] = ContextVar("center_base_url", default="http://127.0.0.1:8080")


def set_center_context(access_token: str, base_url: str) -> tuple[Token, Token]:
    return center_access_token.set(access_token), center_base_url.set(base_url.rstrip("/"))


def reset_center_context(tokens: tuple[Token, Token]) -> None:
    center_access_token.reset(tokens[0])
    center_base_url.reset(tokens[1])
