"""Weather endpoint: GET /api/weather — reads cache populated by weather_fetcher daemon.

The weather_fetcher (services/llm_gateway/weather_fetcher.py) is a long-lived
child process that pre-fetches weather for all known cities every 5 minutes
into ~/.studioarona/weather_cache.json. User requests synchronously read this
file — they never block on an external API.

Cache miss fallback: if the daemon hasn't populated the file yet, or the user's
city isn't in the cache, we do a one-shot wttr.in call (no Shenyang hardcode;
default is the first cached city, or Shanghai if cache is empty).
"""
from __future__ import annotations

import asyncio
import json
import os
import time
from pathlib import Path
from typing import Any, Optional, Tuple

import httpx
from fastapi import APIRouter, Request

router = APIRouter(tags=["Weather"])

# Weather fetcher writes here
CACHE_FILE = Path(os.environ.get("STUDIOARONA_HOME", str(Path.home() / ".studioarona"))) / "weather_cache.json"
CACHE_TTL = 360  # 6 min (must match weather_fetcher.py)

# Hard fallback for empty cache / daemon not yet started
DEFAULT_LAT = 31.2304
DEFAULT_LON = 121.4737
DEFAULT_CITY = "上海"


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip
    host = request.client.host if request.client else "127.0.0.1"
    if host in ("127.0.0.1", "::1", "localhost"):
        return ""
    return host


def load_cache() -> dict[str, Any]:
    """Synchronous read of weather cache. Non-blocking (file is small)."""
    if not CACHE_FILE.exists():
        return {"cities": {}, "updated_at": 0}
    try:
        return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"cities": {}, "updated_at": 0}


def _pick_city_for_ip(cities: dict[str, Any], ip: str) -> Optional[dict[str, Any]]:
    """Pick the best cached city for this request. We currently have no
    IP→city mapping in the cache (the daemon fetches by USER.md), so
    just return the first (most recent) city. Multi-user IP routing can
    be added later if needed."""
    if not cities:
        return None
    return next(iter(cities.values()))


async def _fallback_fetch(lat: float, lon: float) -> dict[str, Any]:
    """One-shot wttr.in call when cache is missing/stale. Used only on cold start."""
    url = f"https://wttr.in/{lat},{lon}?format=j1"
    try:
        async with httpx.AsyncClient(timeout=8.0, trust_env=False) as client:
            resp = await client.get(url, headers={"Accept-Language": "en"})
            resp.raise_for_status()
            data = resp.json()
            cur = data["current_condition"][0]
            wind_kmh = float(cur.get("windspeedKmph", 0))
            wind_deg = float(cur.get("winddirDegree", 0))
            desc = cur["weatherDesc"][0]["value"]
            return {
                "city": DEFAULT_CITY,
                "temperature": int(float(cur["temp_C"])),
                "condition": desc,
                "humidity": int(cur["humidity"]),
                "wind_speed": f"{wind_kmh:.0f} km/h",
                "wind_direction": ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][round(wind_deg / 45) % 8],
                "feels_like": int(float(cur["FeelsLikeC"])),
                "uv_index": "Moderate",  # not parsed in fallback
            }
    except Exception:
        return {
            "city": DEFAULT_CITY,
            "temperature": 0,
            "condition": "Unknown",
            "humidity": 0,
            "wind_speed": "—",
            "wind_direction": "—",
            "feels_like": 0,
            "uv_index": "Unknown",
        }


@router.get("/api/weather")
async def get_weather(request: Request):
    # 1. 读 cache
    cache = load_cache()
    cities = cache.get("cities", {})
    cache_age = time.time() - float(cache.get("updated_at", 0))

    # 2. 如果有 cache 且未过期，直接返回（同步、不打外部 API）
    if cities and cache_age < CACHE_TTL:
        ip = _client_ip(request)
        picked = _pick_city_for_ip(cities, ip)
        if picked:
            return _to_frontend_shape(picked)

    # 3. 兜底：cache miss / 过期 → 现 fetch 一次（cold start 容错）
    if not cities:
        return _to_frontend_shape(await _fallback_fetch(DEFAULT_LAT, DEFAULT_LON), default_city=DEFAULT_CITY)

    # 4. Cache 过期但非空：返回 stale 标记（前端可显示）
    ip = _client_ip(request)
    picked = _pick_city_for_ip(cities, ip)
    if picked:
        result = _to_frontend_shape(picked)
        result["_stale"] = cache_age > CACHE_TTL
        return result

    return _to_frontend_shape(await _fallback_fetch(DEFAULT_LAT, DEFAULT_LON), default_city=DEFAULT_CITY)


def _to_frontend_shape(picked: dict[str, Any], *, default_city: str = "上海") -> dict[str, Any]:
    """Convert daemon cache (snake_case) into the WeatherData shape the
    frontend expects (camelCase). Falls back to sane defaults if any field
    is missing from a partially-populated cache entry."""
    return {
        "city": picked.get("city") or default_city,
        "temperature": int(picked.get("temperature", 0)),
        "condition": picked.get("condition", "Unknown"),
        "humidity": int(picked.get("humidity", 0)),
        "windSpeed": picked.get("wind_speed", "—"),
        "windDirection": picked.get("wind_direction", "—"),
        "feelsLike": int(picked.get("feels_like", picked.get("temperature", 0))),
        "uvIndex": picked.get("uv_index", "Unknown"),
    }
