"""Weather endpoint: GET /api/weather — IP geolocation + Open-Meteo."""

import time

import httpx
from fastapi import APIRouter, Query, Request

router = APIRouter(tags=["Weather"])

# In-memory cache: ip → (lat, lon, city, expiry)
_ip_cache: dict[str, tuple[float, float, str, float]] = {}
_CACHE_TTL = 600  # 10 min

# Beijing fallback
DEFAULT_LAT = 41.8057
DEFAULT_LON = 123.4315
DEFAULT_CITY = "Shenyang"

WMO_CODES: dict[int, str] = {
    0: "Clear", 1: "Partly Cloudy", 2: "Partly Cloudy", 3: "Partly Cloudy",
    45: "Foggy", 48: "Foggy",
    51: "Drizzle", 53: "Drizzle", 55: "Drizzle",
    61: "Rain", 63: "Rain", 65: "Rain",
    71: "Snow", 73: "Snow", 75: "Snow", 77: "Snow",
    80: "Rain Showers", 81: "Rain Showers", 82: "Rain Showers",
    85: "Snow Showers", 86: "Snow Showers",
    95: "Thunderstorm", 96: "Thunderstorm", 99: "Thunderstorm",
}


def uv_label(uvi: float) -> str:
    if uvi <= 2: return "Low"
    if uvi <= 5: return "Moderate"
    if uvi <= 7: return "High"
    if uvi <= 10: return "Very High"
    return "Extreme"


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip
    host = request.client.host if request.client else "127.0.0.1"
    # Use a public IP lookup for localhost in dev
    if host in ("127.0.0.1", "::1", "localhost"):
        return ""
    return host


async def _geolocate(ip: str) -> tuple[float, float, str]:
    """Resolve IP → (lat, lon, city) via ip-api.com (free, no key)."""
    if not ip:
        return DEFAULT_LAT, DEFAULT_LON, DEFAULT_CITY

    now = time.time()
    if ip in _ip_cache:
        lat, lon, city, expiry = _ip_cache[ip]
        if now < expiry:
            return lat, lon, city

    try:
        async with httpx.AsyncClient(timeout=5, trust_env=False) as client:
            resp = await client.get(f"http://ip-api.com/json/{ip}?fields=lat,lon,city,country")
            if resp.status_code == 200:
                data = resp.json()
                lat = data.get("lat", DEFAULT_LAT)
                lon = data.get("lon", DEFAULT_LON)
                city = data.get("city") or DEFAULT_CITY
                _ip_cache[ip] = (lat, lon, city, now + _CACHE_TTL)
                return lat, lon, city
    except Exception:
        pass

    return DEFAULT_LAT, DEFAULT_LON, DEFAULT_CITY


@router.get("/api/weather")
async def get_weather(request: Request):
    ip = _client_ip(request)
    lat, lon, city = await _geolocate(ip)

    url = (
        f"https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lon}"
        f"&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,weather_code,uv_index"
    )
    async with httpx.AsyncClient(timeout=10, trust_env=False) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()

    current = data["current"]
    wmo = current["weather_code"]
    condition = WMO_CODES.get(wmo, "Clear")
    uvi = current["uv_index"]
    wind_kmh = current["wind_speed_10m"]
    wind_dir = current.get("wind_direction_10m", 0)

    def wind_direction_label(deg: float) -> str:
        dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
        idx = round(deg / 45) % 8
        return dirs[idx]

    return {
        "city": city,
        "temperature": round(current["temperature_2m"]),
        "condition": condition,
        "humidity": current["relative_humidity_2m"],
        "wind_speed": f"{wind_kmh:.0f} km/h",
        "wind_direction": wind_direction_label(wind_dir),
        "feels_like": round(current["apparent_temperature"]),
        "uv_index": uv_label(uvi),
    }
