"""MemoryEntry model — cross-session user memory."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


class MemoryEntry(Base):
    __tablename__ = "memory_entry"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    tags: Mapped[list[str] | None] = mapped_column(ARRAY(Text), nullable=True)
    source_msg_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("chat_messages.id", ondelete="SET NULL"),
        nullable=True,
    )
    weight: Mapped[float] = mapped_column(
        Float, nullable=False, server_default="1.0",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
