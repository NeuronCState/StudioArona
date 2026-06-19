import base64
from pathlib import Path

import pytest

from api.routes import chat


def test_materialize_attachments_preserves_relative_path(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(chat, "UPLOAD_ROOT", tmp_path)
    paths = chat._materialize_attachments(
        [
            {
                "name": "readme.txt",
                "relative_path": "notes/readme.txt",
                "size": 2,
                "content_base64": base64.b64encode(b"hi").decode(),
            }
        ],
        "session-1",
    )

    assert len(paths) == 1
    assert paths[0].read_bytes() == b"hi"
    assert paths[0].parts[-2:] == ("notes", "readme.txt")


@pytest.mark.parametrize("relative_path", ["../secret.txt", "/tmp/secret.txt", "a/../b.txt"])
def test_materialize_attachments_rejects_unsafe_paths(tmp_path: Path, monkeypatch, relative_path):
    monkeypatch.setattr(chat, "UPLOAD_ROOT", tmp_path)
    with pytest.raises(ValueError, match="路径无效"):
        chat._materialize_attachments(
            [
                {
                    "name": "secret.txt",
                    "relative_path": relative_path,
                    "size": 1,
                    "content_base64": base64.b64encode(b"x").decode(),
                }
            ],
            "session-1",
        )
