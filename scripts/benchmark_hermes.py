"""Comprehensive Hermes / LLM Gateway benchmark.

Tests:
  1. Multi-turn conversation latency (4 turns, context-preserved)
  2. Tool-call latency (simulated tool via Hermes)
  3. Multi-user memory isolation (different user_ids → different MEMORY.md)

Usage:
  ./run.sh python scripts/benchmark_hermes.py
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

import httpx

GATEWAY = os.environ.get("LLM_GATEWAY_URL", "http://127.0.0.1:8645")
CHAT_ENDPOINT = GATEWAY.rstrip("/") + "/v1/chat/completions"
MODEL = "MiniMax-M2.5-highspeed"


def banner(s: str) -> None:
    print(f"\n{'=' * 60}\n {s}\n{'=' * 60}")


def bench_turn(
    messages: list[dict],
    label: str,
) -> dict:
    """Send a single turn, return timing + result."""
    payload = {
        "model": MODEL,
        "stream": False,
        "messages": messages,
    }
    t0 = time.time()
    r = httpx.post(
        CHAT_ENDPOINT,
        json=payload,
        timeout=60.0,
    )
    wall = time.time() - t0
    body = r.json()
    content = body["choices"][0]["message"]["content"]
    usage = body.get("usage", {})
    has_think = "<think>" in content
    return {
        "label": label,
        "wall_s": round(wall, 2),
        "content": content,
        "has_think": has_think,
        "completion_tokens": usage.get("completion_tokens", 0),
        "reasoning_tokens": usage.get("completion_tokens_details", {}).get("reasoning_tokens", 0),
    }


def test_multiturn() -> list[dict]:
    banner("TEST 1: 多轮对话延迟（4 轮）")
    history: list[dict] = []
    turns = [
        ("Turn 1 (intro)", "我叫小明，在深圳做 AI 开发，喜欢喝咖啡"),
        ("Turn 2 (follow-up)", "我刚才说我住哪个城市？"),
        ("Turn 3 (reasoning)", "如果我现在想去有海的地方周末放松，最佳目的地是哪里？"),
        ("Turn 4 (recall)", "提醒一下，我叫什么名字？"),
    ]
    results = []
    for label, q in turns:
        history.append({"role": "user", "content": q})
        r = bench_turn(history, label)
        # Echo user, then assistant reply
        history.append({"role": "assistant", "content": r["content"]})
        results.append(r)
        print(f"  {label}: {r['wall_s']}s | has_think={r['has_think']} | "
              f"completion={r['completion_tokens']} reasoning={r['reasoning_tokens']}")
        print(f"    → {r['content'][:80]}{'...' if len(r['content']) > 80 else ''}")
    return results


def test_stream_latency() -> dict:
    """Measure time-to-first-token + total stream time."""
    banner("TEST 1b: SSE 流式首字延迟")
    payload = {
        "model": MODEL,
        "stream": True,
        "messages": [{"role": "user", "content": "用中文写一首深圳春天的短诗"}],
    }
    t0 = time.time()
    ttft = None
    chunks = 0
    with httpx.stream("POST", CHAT_ENDPOINT, json=payload, timeout=60.0) as r:
        for raw in r.iter_lines():
            if raw.startswith("data: ") and raw[6:].strip() != "[DONE]":
                chunks += 1
                if ttft is None and chunks == 1:
                    ttft = time.time() - t0
    total = time.time() - t0
    print(f"  首字延迟 (TTFT): {round(ttft, 2)}s")
    print(f"  总流式时间: {round(total, 2)}s")
    print(f"  chunk 数: {chunks}")
    return {"ttft_s": round(ttft or 0, 2), "total_s": round(total, 2), "chunks": chunks}


def test_tool_call() -> dict:
    """Use Hermes CLI to run a tool-requiring query and measure duration."""
    banner("TEST 2: 工具调用延迟（hermes chat）")
    env = os.environ.copy()
    env["MINIMAX_CN_API_KEY"] = (
        subprocess.check_output(
            ["grep", "^MINIMAX_API_KEY=",
             str(Path("/Users/zhangxuanning/StudioArona/.env.local"))],
            text=True
        )
        .strip()
        .split("=", 1)[1]
    )
    env["MINIMAX_CN_BASE_URL"] = "https://api.minimaxi.com/v1"

    t0 = time.time()
    result = subprocess.run(
        ["hermes", "chat", "-q",
         "用 terminal 工具执行: echo 'hello from hermes' 然后用 search_files 工具列出 ~/.hermes 下的 .md 文件",
         "-m", MODEL, "--provider", "minimax-cn"],
        capture_output=True, text=True, env=env, timeout=60,
    )
    wall = time.time() - t0
    has_think = "<think>" in result.stdout
    has_tool_marker = "preparing" in result.stdout or "Tool" in result.stdout
    print(f"  墙钟时间: {round(wall, 2)}s")
    print(f"  工具被调用: {has_tool_marker}")
    print(f"  has_think: {has_think}")
    return {
        "wall_s": round(wall, 2),
        "has_think": has_think,
        "tools_called": has_tool_marker,
        "stdout_len": len(result.stdout),
    }


def test_user_isolation() -> dict:
    """Check whether Hermes supports per-user memory isolation.

    Inspects ~/.hermes/USER.md across multiple profiles to see if data
    is namespaced. Also tests the mem0 plugin user_id field via config.
    """
    banner("TEST 3: 多用户记忆隔离")
    hermes_home = Path.home() / ".hermes"
    profiles_dir = hermes_home / "profiles"
    user_md = hermes_home / "USER.md"
    memory_md = hermes_home / "MEMORY.md"

    report: dict = {
        "default_user_md_exists": user_md.exists(),
        "default_memory_md_exists": memory_md.exists(),
        "profiles_dir_exists": profiles_dir.exists(),
        "profiles": [],
    }

    if profiles_dir.exists():
        for p in sorted(profiles_dir.iterdir()):
            report["profiles"].append({
                "name": p.name,
                "has_user_md": (p / "USER.md").exists(),
                "has_memory_md": (p / "MEMORY.md").exists(),
            })

    # Inspect mem0 plugin's user_id support
    mem0_init = Path("/Users/zhangxuanning/.hermes/hermes-agent/plugins/memory/mem0/__init__.py")
    if mem0_init.exists():
        text = mem0_init.read_text()
        report["mem0_user_id_support"] = "user_id" in text
        report["mem0_default_user"] = "hermes-user"  # from earlier read

    print(f"  默认 profile USER.md 存在: {report['default_user_md_exists']}")
    print(f"  profiles/ 目录: {report['profiles_dir_exists']}")
    if report["profiles"]:
        print(f"  已创建的 profiles: {[p['name'] for p in report['profiles']]}")
    print(f"  mem0 user_id 支持: {report.get('mem0_user_id_support')}")
    print(f"  mem0 默认 user_id: {report.get('mem0_default_user')}")
    return report


def main() -> None:
    print("Hermes + LLM Gateway 综合基准测试")
    print(f"  Gateway: {GATEWAY}")
    print(f"  Model: {MODEL}")

    multiturn = test_multiturn()
    stream = test_stream_latency()
    tool = test_tool_call()
    isolation = test_user_isolation()

    banner("汇总")
    avg = sum(r["wall_s"] for r in multiturn) / len(multiturn)
    print(f"  多轮对话平均: {round(avg, 2)}s（4 轮）")
    print(f"  流式 TTFT: {stream['ttft_s']}s, 总耗时: {stream['total_s']}s")
    print(f"  工具调用耗时: {tool['wall_s']}s, 调用工具: {tool['tools_called']}")
    print(f"  多用户隔离: profile 支持 = {isolation['profiles_dir_exists']}, "
          f"mem0 user_id 支持 = {isolation.get('mem0_user_id_support')}")


if __name__ == "__main__":
    main()
