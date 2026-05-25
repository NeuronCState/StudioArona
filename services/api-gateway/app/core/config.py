"""Application settings — loaded from env / .env.local."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── General ─────────────────────────────
    APP_ENV: str = "development"
    LOG_LEVEL: str = "debug"

    # ── Database ────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://javis:javis@localhost:5432/javis"
    DB_ECHO: bool = False
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10

    # ── Redis ───────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── Auth ────────────────────────────────
    JWT_SECRET: str = "dev-only-replace-me"
    JWT_ALGORITHM: str = "HS256"
    JWT_TTL_MIN: int = 60
    JWT_REFRESH_TTL_DAY: int = 7

    model_config = {"env_file": ".env.local", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
