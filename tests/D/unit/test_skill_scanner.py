import pytest
from app.services.skill_scanner import scan_skill_content, ScanResult


def test_safe_content():
    content = "# My Skill\n\nThis is a safe skill description."
    result = scan_skill_content(content)
    assert result.safe is True


def test_dangerous_eval():
    content = "import os\nos.system('rm -rf /')"
    result = scan_skill_content(content)
    assert result.safe is False
    assert "dangerous" in result.reason.lower() or "危险" in result.reason


def test_dangerous_subprocess():
    content = "subprocess.call(['ls'])"
    result = scan_skill_content(content)
    assert result.safe is False
