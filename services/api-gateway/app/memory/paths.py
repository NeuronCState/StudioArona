"""Per-user memory path helpers."""

import os
from pathlib import Path


def get_user_data_dir() -> Path:
    root = os.environ.get("JAVIS_USER_DATA_DIR", os.path.expanduser("~/javis-data"))
    return Path(root)


def get_user_dir(user_id: str) -> Path:
    return get_user_data_dir() / "users" / user_id


def get_user_memory_path(user_id: str) -> Path:
    return get_user_dir(user_id) / "memory.sqlite"


def ensure_user_dir(user_id: str) -> Path:
    p = get_user_dir(user_id)
    p.mkdir(parents=True, exist_ok=True)
    (p / "attachments").mkdir(exist_ok=True)
    return p
