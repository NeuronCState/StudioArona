"""Summarizer — extract structured memory entries from conversation.

Uses LLM with SUMMARIZER.md prompt template.
Supports LLM_PROVIDER=mock for deterministic echo output.
Pure function — no IO side effects.
"""

from __future__ import annotations

import json
import os
import uuid
from pathlib import Path

from app.memory.repository import MemoryEntry

try:
    _WORKSPACE_DIR = Path(__file__).resolve().parents[4] / "services" / "agent" / "workspace"
except IndexError:
    _WORKSPACE_DIR = Path("/app") / "services" / "agent" / "workspace"


def _load_prompt_template() -> str:
    path = _WORKSPACE_DIR / "SUMMARIZER.md"
    if path.exists():
        return path.read_text(encoding="utf-8")
    return ""


def _call_llm(prompt: str) -> str:
    """Call LLM or return mock echo depending on LLM_PROVIDER."""
    provider = os.environ.get("LLM_PROVIDER", "mock")

    if provider == "mock":
        # Deterministic echo: extract potential facts from the conversation
        return _mock_extract(prompt)

    # Real provider — placeholder for future integration (OpenClaw, MiniMax M2.7, etc.)
    raise NotImplementedError(
        f"LLM provider '{provider}' not implemented. Set LLM_PROVIDER=mock for mock mode."
    )


def _mock_extract(prompt: str) -> str:
    """Mock extraction: find quoted names/terms in the conversation and create
    deterministic fact entries."""
    entries: list[dict] = []

    # Extract the conversation part (between <<< and >>>)
    start = prompt.find("<<<")
    end = prompt.find(">>>")
    conversation = prompt[start + 3 : end].strip() if start >= 0 and end >= 0 else prompt

    # Simple heuristic: look for "叫" (name), "喜欢" (like), "是" (is) patterns
    lines = conversation.split("\n")
    for line in lines:
        line = line.strip()
        if not line:
            continue

        if "叫" in line or "叫我" in line:
            entries.append({
                "type": "preference",
                "summary": line[:60],
                "importance": 70,
            })
        elif "喜欢" in line:
            entries.append({
                "type": "preference",
                "summary": line[:60],
                "importance": 60,
            })
        elif "在" in line and ("住在" in line or "在" in line):
            entries.append({
                "type": "fact",
                "summary": line[:60],
                "importance": 50,
            })

    return json.dumps(entries, ensure_ascii=False)


def summarize(conversation: str) -> list[MemoryEntry]:
    """Extract memory entries from a conversation.

    Args:
        conversation: The full conversation text to summarize.

    Returns:
        List of MemoryEntry objects extracted by the LLM.
    """
    if not conversation.strip():
        return []

    template = _load_prompt_template()
    if not template:
        return []

    prompt = template.replace("{conversation}", conversation)
    raw_json = _call_llm(prompt)

    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError:
        return []

    if not isinstance(data, list):
        return []

    entries: list[MemoryEntry] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        entry = MemoryEntry(
            id=str(uuid.uuid4()),
            type=item.get("type", "fact"),
            summary=item.get("summary", ""),
            detail=item.get("detail"),
            importance=item.get("importance", 50),
        )
        entries.append(entry)

    return entries
