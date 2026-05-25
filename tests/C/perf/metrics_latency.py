"""Performance test: metrics snapshot latency.

Target: < 100ms per snapshot

Usage:
    uv run python tests/C/perf/metrics_latency.py
"""

from __future__ import annotations

import asyncio
import time

from app.core.hardware.mac import MacMetricsProvider


async def main():
    provider = MacMetricsProvider()

    # Warmup
    await provider.snapshot()

    # Benchmark
    num_samples = 50
    latencies = []

    for _ in range(num_samples):
        start = time.monotonic()
        await provider.snapshot()
        elapsed_ms = (time.monotonic() - start) * 1000
        latencies.append(elapsed_ms)

    avg_ms = sum(latencies) / len(latencies)
    p95_ms = sorted(latencies)[int(len(latencies) * 0.95)]
    max_ms = max(latencies)

    print(f"Metrics snapshot latency:")
    print(f"  Average: {avg_ms:.1f} ms")
    print(f"  P95:     {p95_ms:.1f} ms")
    print(f"  Max:     {max_ms:.1f} ms")

    target = 100.0
    if p95_ms < target:
        print(f"PASS: P95 {p95_ms:.1f} ms < {target} ms")
    else:
        print(f"FAIL: P95 {p95_ms:.1f} ms >= {target} ms")


if __name__ == "__main__":
    asyncio.run(main())
