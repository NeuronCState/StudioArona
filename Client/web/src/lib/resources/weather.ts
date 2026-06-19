import { useQuery } from "@tanstack/react-query";
import * as storage from "@/lib/storage";
import type { LocalWeather } from "@/lib/db";
import type { GeoCoords } from "@/hooks/useGeolocation";

// ─── WMO weather code → 中文描述 ─────────────────────────────────
// 来源: https://open-meteo.com/en/docs (WMO Weather interpretation codes)
const WMO_CODE_ZH: Record<number, string> = {
  0: "晴",
  1: "大致晴朗",
  2: "局部多云",
  3: "阴",
  45: "雾",
  48: "冻雾",
  51: "轻度毛毛雨",
  53: "中度毛毛雨",
  55: "浓毛毛雨",
  56: "冻毛毛雨",
  57: "强冻毛毛雨",
  61: "小雨",
  63: "中雨",
  65: "大雨",
  66: "冻雨",
  67: "强冻雨",
  71: "小雪",
  73: "中雪",
  75: "大雪",
  77: "雪粒",
  80: "阵雨",
  81: "强阵雨",
  82: "剧烈阵雨",
  85: "阵雪",
  86: "强阵雪",
  95: "雷暴",
  96: "雷暴伴小冰雹",
  99: "雷暴伴大冰雹",
};

function formatUvIndex(uv: number): string {
  if (!uv || uv <= 0) return "0 (Low)";
  if (uv < 3) return `${uv} (Low)`;
  if (uv < 6) return `${uv} (Moderate)`;
  if (uv < 8) return `${uv} (High)`;
  if (uv < 11) return `${uv} (Very High)`;
  return `${uv} (Extreme)`;
}

function degToDirection(deg: number): string {
  // 16 方位
  const dirs = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
  ];
  return dirs[Math.round(deg / 22.5) % 16];
}

/**
 * Open-Meteo — 免 API key, CORS 友好, 当前天气一次性返回.
 * 不带城市名, 城市名由 reverseGeocode 单独拉.
 */
async function fetchOpenMeteo(
  coords: GeoCoords,
): Promise<{
  temperature: number;
  humidity: number;
  windSpeed: number;
  windDirection: string;
  feelsLike: number;
  uvIndex: number;
  condition: string;
} | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${coords.latitude}` +
    `&longitude=${coords.longitude}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m` +
    `&wind_speed_unit=kmh&timezone=auto`;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn(`[open-meteo] HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    const cur = data?.current;
    if (!cur) return null;
    const code = Number(cur.weather_code);
    return {
      temperature: Number(cur.temperature_2m),
      humidity: Number(cur.relative_humidity_2m),
      windSpeed: Number(cur.wind_speed_10m),
      windDirection: degToDirection(Number(cur.wind_direction_10m)),
      feelsLike: Number(cur.apparent_temperature),
      uvIndex: 0, // current 字段没有 uv_index, 留给 future 字段 (先不取)
      condition: WMO_CODE_ZH[code] ?? `Code ${code}`,
    };
  } catch (e) {
    console.warn(
      `[open-meteo] failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  }
}

/**
 * Nominatim 反向地理 — 把经纬度转成市级名字 ("通化市" / "沈阳市" / "深圳市" / "上海市").
 *
 * Nominatim 对中国城市字段映射很反直觉, 不能直接信 `city` 字段:
 *   - 沈阳的 city = "沈河区" (区级)
 *   - 北京的 city = "东城区"
 *   - 深圳的 city = "福田区"
 *   - 上海的 city = "上海市"  ← 直辖市这个反而对
 *   - 通化的 city = 空, 城市名在 `region` = "通化市"
 *   - 长春的 city = "长春市"  ← 这种直接对
 *
 * 策略: 优先级
 *   1. address.city 以"市"结尾 → 直接返回 (上海/长春/省会等)
 *   2. address.region 以"市"结尾 → 中国地级市 (通化/沈阳等 Nominatim 不填 city 但填 region)
 *   3. address.town (欧美)
 *   4. 拆 display_name 找第一个 "市/州/盟/地区/特别行政区" 的段
 *   5. 兜底县区 + 省
 */
function pickCityName(
  address: Record<string, string | undefined>,
  displayName: string | undefined,
): string {
  if (address.city?.endsWith("市")) return address.city;
  if (address.region?.endsWith("市")) return address.region;
  if (address.town) return address.town;
  if (displayName) {
    const part = displayName
      .split(",")
      .map((s) => s.trim())
      .find(
        (p) => /市|州|盟|地区|特别行政区/.test(p) && p !== "中国",
      );
    if (part) return part;
  }
  if (address.county || address.district) {
    const d = address.county || address.district!;
    if (address.state) return `${d} · ${address.state}`;
    return d;
  }
  if (address.state) return address.state;
  return "当前位置";
}

/**
 * Nominatim 反向地理 — 必须带 User-Agent (Nominatim 政策), 限流 1 req/s.
 * zoom=10 (city 级别) 拿到的 display_name 包含市/省段, 对中国市级稳定.
 */
async function reverseGeocode(coords: GeoCoords): Promise<string> {
  const url =
    `https://nominatim.openstreetmap.org/reverse` +
    `?format=json&lat=${coords.latitude}&lon=${coords.longitude}` +
    `&accept-language=zh&zoom=10`;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "StudioArona/1.0 (https://github.com/)" },
    });
    if (!res.ok) return "当前位置";
    const data = await res.json();
    return pickCityName(data?.address ?? {}, data?.display_name);
  } catch {
    return "当前位置";
  }
}

function toLocalWeather(
  city: string,
  data: NonNullable<Awaited<ReturnType<typeof fetchOpenMeteo>>>,
): LocalWeather {
  return {
    id: city,
    city,
    temperature: data.temperature,
    condition: data.condition,
    humidity: data.humidity,
    windSpeed: `${data.windSpeed.toFixed(1)} km/h ${data.windDirection}`,
    windDirection: data.windDirection,
    feelsLike: data.feelsLike,
    uvIndex: formatUvIndex(data.uvIndex),
    updatedAt: Date.now(),
  };
}

/**
 * 首页天气 hook.
 *
 * 接收 coords 作为参数 (由 useGeolocation 提供). 这样 StudioHomePage 调
 * useGeolocation 拿 coords + refresh, 把同一个 coords 传给本 hook, refresh 后
 * 两边状态同步, 瓦片能跟着更新.
 *
 * 数据流:
 * 1. coords 非 null → Open-Meteo 拉天气 + Nominatim 反向地理拉城市名
 * 2. 任一失败 → 返回 null, 瓦片显示"未授权/无法获取"
 * 3. coords 为 null → enabled: false, 瓦片显示明确的"未授权"占位
 * 4. 不再有 "defaultCity=沈阳" 假数据兜底 — 浏览器返回什么就用什么, null 就 null
 */
export function useDashboardWeather(coords: GeoCoords | null) {
  return useQuery({
    queryKey: [
      "weather",
      "open-meteo",
      coords ? `${coords.latitude.toFixed(3)},${coords.longitude.toFixed(3)}` : "no-coords",
    ] as const,
    enabled: coords !== null,
    queryFn: async () => {
      if (!coords) return null;
      // 并行: 天气 + 反向地理 (互不依赖)
      const [weather, city] = await Promise.all([
        fetchOpenMeteo(coords),
        reverseGeocode(coords),
      ]);
      if (!weather) return null;
      const local = toLocalWeather(city, weather);
      await storage.put(
        "weather",
        local as unknown as Record<string, unknown>,
      );
      console.warn(`[weather] OK city="${city}" temp=${local.temperature}°C`);
      return local;
    },
    staleTime: 30 * 60 * 1000,
  });
}
