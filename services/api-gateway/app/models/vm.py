"""VM model — virtual machine registry with control surface."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


class Vm(Base):
    __tablename__ = "vm"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    hypervisor: Mapped[str] = mapped_column(Text, nullable=False)
    spec_cpu: Mapped[int | None] = mapped_column(Integer, nullable=True)
    spec_ram_mb: Mapped[int | None] = mapped_column(Integer, nullable=True)
    spec_disk_gb: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="stopped",
    )
    ip: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    console_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    guest_agent_ok: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false",
    )
    exec_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("user_id", "name"),
    )
