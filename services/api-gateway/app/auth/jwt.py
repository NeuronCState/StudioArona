"""JWT token creation and verification."""

from datetime import UTC, datetime, timedelta

from jose import JWTError, jwt

from app.core.config import settings


def create_access_token(user_id: str, role: str) -> str:
    expire = datetime.now(UTC) + timedelta(minutes=settings.JWT_TTL_MIN)
    payload = {
        "sub": user_id,
        "role": role,
        "type": "access",
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    expire = datetime.now(UTC) + timedelta(days=settings.JWT_REFRESH_TTL_DAY)
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and verify a JWT. Raises JWTError on failure."""
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])


def verify_access_token(token: str) -> dict | None:
    """Return payload if valid access token, else None."""
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            return None
        return payload
    except JWTError:
        return None


def verify_refresh_token(token: str) -> dict | None:
    """Return payload if valid refresh token, else None."""
    try:
        payload = decode_token(token)
        if payload.get("type") != "refresh":
            return None
        return payload
    except JWTError:
        return None
