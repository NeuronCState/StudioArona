"""User, user_preferences, user_face_embeddings models."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, LargeBinary, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


def generate_uuid() -> str:
    return str(uuid.uuid4())


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=generate_uuid
    )
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(128), nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(
        String(16), nullable=False, default="member"
    )  # admin / member
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    profile_json: Mapped[str] = mapped_column(
        Text, nullable=False, default="{}", server_default="{}"
    )
    settings_json: Mapped[str] = mapped_column(
        Text, nullable=False, default="{}", server_default="{}"
    )
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    memory_db_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    invitation_code: Mapped[str | None] = mapped_column(String(64), nullable=True)

    preferences: Mapped[list["UserPreference"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    face_embeddings: Mapped[list["UserFaceEmbedding"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class UserPreference(Base, TimestampMixin):
    __tablename__ = "user_preferences"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=generate_uuid
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    key: Mapped[str] = mapped_column(String(128), nullable=False)
    value_json: Mapped[str] = mapped_column(Text, nullable=False)  # JSON string

    user: Mapped["User"] = relationship(back_populates="preferences")


class UserFaceEmbedding(Base):
    __tablename__ = "user_face_embeddings"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=generate_uuid
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    embedding: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    source: Mapped[str] = mapped_column(
        String(64), nullable=False, default="camera"
    )  # camera / upload
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="face_embeddings")
