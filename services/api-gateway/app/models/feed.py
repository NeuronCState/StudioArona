"""Feed & FeedItem models — RSS feed subscriptions and items."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


class Feed(Base):
    __tablename__ = "feed"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    url: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(Text, nullable=True)
    enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true",
    )
    last_fetched_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    items: Mapped[list["FeedItem"]] = relationship(
        back_populates="feed", cascade="all, delete-orphan",
    )

    __table_args__ = (
        UniqueConstraint("user_id", "url"),
    )


class FeedItem(Base):
    __tablename__ = "feed_item"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    feed_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("feed.id", ondelete="CASCADE"),
        nullable=False,
    )
    guid: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    link: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    read: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false",
    )
    starred: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false",
    )
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    feed: Mapped["Feed"] = relationship(back_populates="items")

    __table_args__ = (
        UniqueConstraint("feed_id", "guid"),
    )
