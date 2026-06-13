"""Security scanner for skill files."""
from __future__ import annotations

import re
from dataclasses import dataclass


DANGEROUS_PATTERNS = [
    (r"os\.system\s*\(", "os.system call"),
    (r"subprocess\.(call|run|Popen|check_output|check_call)\s*\(", "subprocess execution"),
    (r"\beval\s*\(", "eval() call"),
    (r"\bexec\s*\(", "exec() call"),
    (r"__import__\s*\(", "dynamic import"),
    (r"rm\s+-rf", "recursive delete"),
    (r"curl\s+.*\|\s*(bash|sh)", "remote code execution"),
    (r"wget\s+.*\|\s*(bash|sh)", "remote code execution"),
    (r"chmod\s+777", "unsafe permissions"),
    (r"rm\s+.*\*", "wildcard delete"),
]


@dataclass
class ScanResult:
    safe: bool
    reason: str = ""
    warnings: list[str] | None = None


def scan_skill_content(content: str) -> ScanResult:
    """Scan skill content for dangerous patterns."""
    for pattern, desc in DANGEROUS_PATTERNS:
        if re.search(pattern, content, re.IGNORECASE):
            return ScanResult(safe=False, reason=f"检测到危险模式: {desc}")

    warnings: list[str] = []
    suspicious_imports = ["subprocess", "os", "shutil", "socket"]
    for imp in suspicious_imports:
        if re.search(rf"^import\s+{imp}\b", content, re.MULTILINE):
            warnings.append(f"导入了系统模块: {imp}")

    return ScanResult(safe=True, warnings=warnings)


def scan_skill_files(files: dict[str, str]) -> ScanResult:
    """Scan multiple skill files for security issues."""
    for filename, content in files.items():
        result = scan_skill_content(content)
        if not result.safe:
            return ScanResult(
                safe=False,
                reason=f"文件 {filename}: {result.reason}",
            )

    return ScanResult(safe=True)
