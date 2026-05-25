"""Aggregate all SQLAlchemy models for Alembic autogenerate.

Import this in env.py so Alembic can discover all tables.
"""

from app.models.base import Base  # noqa: F401
from app.models.user import User, UserPreference, UserFaceEmbedding  # noqa: F401
from app.models.audit import AuditLog  # noqa: F401
from app.models.chat import ChatSession, ChatMessage  # noqa: F401
from app.models.schedule import Schedule  # noqa: F401
from app.models.feed import Feed, FeedItem  # noqa: F401
from app.models.memory import MemoryEntry  # noqa: F401
from app.models.vm import Vm  # noqa: F401
