"""English-to-Chinese translation using LLM Gateway."""
from __future__ import annotations

import re


def is_chinese(text: str) -> bool:
    """Check if text is predominantly Chinese."""
    if not text:
        return False
    chinese_chars = len(re.findall(r'[\u4e00-\u9fff]', text))
    return chinese_chars > len(text) * 0.3


async def translate_to_chinese(text: str) -> str:
    """Translate English text to Chinese using LLM Gateway."""
    if not text or is_chinese(text):
        return text

    try:
        import httpx
        import os

        gateway_url = os.getenv(
            "LLM_GATEWAY_SERVICE_URL", "http://127.0.0.1:8645"
        )

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{gateway_url}/v1/chat/completions",
                json={
                    "model": os.getenv("MINIMAX_MODEL", "MiniMax-M2.5-highspeed"),
                    "messages": [
                        {
                            "role": "system",
                            "content": "将以下英文文本翻译为中文，保持专业术语，简洁准确。只输出翻译结果，不要添加解释。",
                        },
                        {"role": "user", "content": text},
                    ],
                    "max_tokens": 500,
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                return data["choices"][0]["message"]["content"]
    except Exception:
        pass

    return text


async def translate_skill_descriptions(
    skills: list[dict],
) -> list[dict]:
    """Translate description fields in a list of skills."""
    for skill in skills:
        if skill.get("description") and not is_chinese(skill["description"]):
            skill["description_zh"] = await translate_to_chinese(skill["description"])
        else:
            skill["description_zh"] = skill.get("description", "")
    return skills
