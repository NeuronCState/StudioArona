#!/usr/bin/env python3
"""Weather Fetcher Daemon — periodic weather prefetch via wttr.in.

Run as a long-lived child of start.py. Every 5 minutes:
  1. Resolve which cities to fetch: per-user USER.md "city:" / "住在X" + default
  2. Hit wttr.in in parallel (国内可达，无需 key)
  3. Persist to ~/.studioarona/weather_cache.json (atomic write)

The web weather endpoint reads this file synchronously — user-facing requests
never block on an external API. Cache TTL is 6 minutes.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx

CACHE_DIR = Path(os.environ.get("STUDIOARONA_HOME", str(Path.home() / ".studioarona")))
CACHE_FILE = CACHE_DIR / "weather_cache.json"
CACHE_TTL = 360  # 6 min (5 min fetch + 1 min slack)
FETCH_INTERVAL = 300  # 5 min

# 已知城市 → (lat, lon) — 内部去重用
KNOWN_CITIES: Dict[str, Tuple[float, float]] = {
    "shanghai": (31.2304, 121.4737), "上海": (31.2304, 121.4737),
    "beijing": (39.9042, 116.4074), "北京": (39.9042, 116.4074),
    "shenzhen": (22.5431, 114.0579), "深圳": (22.5431, 114.0579),
    "guangzhou": (23.1291, 113.2644), "广州": (23.1291, 113.2644),
    "hangzhou": (30.2741, 120.1551), "杭州": (30.2741, 120.1551),
    "chengdu": (30.5728, 104.0668), "成都": (30.5728, 104.0668),
    "xian": (34.3416, 108.9398), "西安": (34.3416, 108.9398),
    "nanjing": (32.0603, 118.7969), "南京": (32.0603, 118.7969),
    "shenyang": (41.8057, 123.4315), "沈阳": (41.8057, 123.4315),
    "wuhan": (30.5928, 114.3055), "武汉": (30.5928, 114.3055),
    "tianjin": (39.3434, 117.3616), "天津": (39.3434, 117.3616),
    "qingdao": (36.0671, 120.3826), "青岛": (36.0671, 120.3826),
    "dalian": (38.9140, 121.6147), "大连": (38.9140, 121.6147),
}

# wttr.in weatherCode → 我们的 condition 字符串
WTTR_CODES: Dict[str, str] = {
    "113": "Clear", "116": "Partly Cloudy", "119": "Cloudy", "122": "Overcast",
    "143": "Mist", "176": "Patchy Rain", "179": "Patchy Snow", "182": "Patchy Sleet",
    "185": "Patchy Freezing", "200": "Thundery", "227": "Blowing Snow", "230": "Blizzard",
    "248": "Foggy", "260": "Freezing Fog", "263": "Patchy Drizzle", "266": "Drizzle",
    "281": "Freezing Drizzle", "284": "Heavy Freezing", "293": "Patchy Rain",
    "296": "Light Rain", "299": "Rain", "302": "Moderate Rain", "305": "Heavy Rain",
    "308": "Heavy Rain", "311": "Freezing Rain", "314": "Heavy Freezing Rain",
    "317": "Sleet", "320": "Light Sleet", "323": "Patchy Snow", "326": "Light Snow",
    "329": "Patchy Snow", "332": "Moderate Snow", "335": "Heavy Snow", "338": "Blizzard",
    "350": "Ice Pellets", "353": "Light Rain", "356": "Moderate Rain", "359": "Heavy Rain",
    "362": "Light Sleet", "365": "Moderate Sleet", "368": "Light Snow", "371": "Moderate Snow",
    "374": "Ice Pellets", "377": "Heavy Ice", "386": "Patchy Rain w/ Snow", "389": "Rain w/ Snow",
    "392": "Patchy Snow", "395": "Heavy Snow",
}


def uv_label(uvi: float) -> str:
    if uvi <= 2: return "Low"
    if uvi <= 5: return "Moderate"
    if uvi <= 7: return "High"
    if uvi <= 10: return "Very High"
    return "Extreme"


def _wind_dir(deg: float) -> str:
    dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    return dirs[round(deg / 45) % 8]


def load_cache() -> Dict[str, Any]:
    if not CACHE_FILE.exists():
        return {"cities": {}, "updated_at": 0}
    try:
        return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"cities": {}, "updated_at": 0}


def save_cache(data: Dict[str, Any]) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = CACHE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(CACHE_FILE)


def extract_user_cities() -> List[Tuple[str, float, float]]:
    """扫描 ~/.hermes/profiles/*/USER.md，提取 city 字段。"""
    cities: List[Tuple[str, float, float]] = []
    seen: set = set()
    hermes_home = Path(os.environ.get("HERMES_BASE_HOME", str(Path.home() / ".hermes")))
    profiles_dir = hermes_home / "profiles"
    if not profiles_dir.exists():
        return cities
    for user_dir in profiles_dir.iterdir():
        if not user_dir.is_dir():
            continue
        user_md = user_dir / "USER.md"
        if not user_md.exists():
            continue
        text = user_md.read_text(encoding="utf-8", errors="ignore")
        # 匹配 "city: 上海" / "城市: 北京"
        m = re.search(r'(?:^|\n)\s*(?:city|城市|location|所在地)\s*[:：]\s*([^\n]+)', text, re.IGNORECASE)
        city_str = None
        if m:
            city_str = m.group(1).strip()
        else:
            # 兜底："住在上海" / "located in Berlin"
            m2 = re.search(r'住在\s*([\u4e00-\u9fff\w]+)', text)
            if m2:
                city_str = m2.group(1).strip()
            else:
                m3 = re.search(r'located in\s+([\w\s]+?)(?:\.|,|\n|$)', text, re.IGNORECASE)
                if m3:
                    city_str = m3.group(1).strip()
        if not city_str:
            continue
        key = city_str.lower().strip()
        if key in seen:
            continue
        if key in KNOWN_CITIES:
            lat, lon = KNOWN_CITIES[key]
            cities.append((city_str, lat, lon))
            seen.add(key)
    return cities


def discover_cities() -> List[Tuple[str, float, float]]:
    cities = extract_user_cities()
    if not cities:
        cities.append(("上海", 31.2304, 121.4737))
    seen: set = set()
    out: List[Tuple[str, float, float]] = []
    for name, lat, lon in cities:
        key = (round(lat, 2), round(lon, 2))
        if key in seen:
            continue
        seen.add(key)
        out.append((name, lat, lon))
    return out


async def fetch_one(client: httpx.AsyncClient, name: str, lat: float, lon: float) -> Optional[Dict[str, Any]]:
    # wttr.in 直接接 lat,lon
    url = f"https://wttr.in/{lat},{lon}?format=j1"
    try:
        resp = await client.get(url, timeout=10.0, headers={"Accept-Language": "en"})
        resp.raise_for_status()
        data = resp.json()
        cur = data["current_condition"][0]
        desc = cur["weatherDesc"][0]["value"]
        code = cur["weatherCode"]
        # 风速：wttr.in 是 kmph
        wind_kmh = float(cur.get("windspeedKmph", 0))
        wind_deg = float(cur.get("winddirDegree", 0))
        return {
            "city": name,
            "latitude": lat,
            "longitude": lon,
            "temperature": int(float(cur["temp_C"])),
            "condition": WTTR_CODES.get(code, desc),
            "humidity": int(cur["humidity"]),
            "wind_speed": f"{wind_kmh:.0f} km/h",
            "wind_direction": _wind_dir(wind_deg),
            "feels_like": int(float(cur["FeelsLikeC"])),
            "uv_index": uv_label(float(cur.get("uvIndex", 0))),
            "fetched_at": time.time(),
        }
    except Exception as e:
        print(f"[weather_fetcher] failed {name}: {e}", flush=True)
        return None


async def fetch_all() -> Dict[str, Any]:
    cities = discover_cities()
    if not cities:
        return {"cities": {}, "updated_at": time.time()}
    async with httpx.AsyncClient(timeout=10.0, trust_env=False) as client:
        results = await asyncio.gather(
            *(fetch_one(client, n, la, lo) for n, la, lo in cities),
        )
    cities_dict: Dict[str, Any] = {}
    for r in results:
        if r is None:
            continue
        key = f"{round(r['latitude'], 2)},{round(r['longitude'], 2)}"
        cities_dict[key] = r
    return {"cities": cities_dict, "updated_at": time.time()}


async def main() -> None:
    print(f"[weather_fetcher] started; cache={CACHE_FILE} interval={FETCH_INTERVAL}s", flush=True)
    while True:
        try:
            data = await fetch_all()
            save_cache(data)
            print(f"[weather_fetcher] refreshed {len(data['cities'])} cities at {time.strftime('%H:%M:%S')}", flush=True)
        except Exception as e:
            print(f"[weather_fetcher] cycle error: {e}", flush=True)
        await asyncio.sleep(FETCH_INTERVAL)


if __name__ == "__main__":
    asyncio.run(main())
