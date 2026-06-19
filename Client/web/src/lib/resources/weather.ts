import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import * as storage from "@/lib/storage";
import type { LocalWeather } from "@/lib/db";

function formatUvIndex(uv: number): string {
  if (!uv || uv <= 0) return "0 (Low)";
  if (uv < 3) return `${uv} (Low)`;
  if (uv < 6) return `${uv} (Moderate)`;
  if (uv < 8) return `${uv} (High)`;
  if (uv < 11) return `${uv} (Very High)`;
  return `${uv} (Extreme)`;
}

function toLocalWeather(payload: Record<string, unknown>): LocalWeather {
  const city = String(payload.city ?? "沈阳");
  const windSpeed = Number(payload.windSpeed ?? 0);
  const windDirection = String(payload.windDirection ?? "");
  return {
    id: city,
    city,
    temperature: Number(payload.temperature ?? 0),
    condition: String(payload.condition ?? "Unknown"),
    humidity: Number(payload.humidity ?? 0),
    windSpeed: `${windSpeed} km/h ${windDirection}`.trim(),
    windDirection,
    feelsLike: Number(payload.feelsLike ?? payload.temperature ?? 0),
    uvIndex: formatUvIndex(Number(payload.uvIndex ?? 0)),
    updatedAt: Date.now(),
  };
}

async function fetchWttr(
  city: string,
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(
      `https://wttr.in/${encodeURIComponent(city)}?format=j1`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(6000),
        headers: { Accept: "application/json" },
      },
    );
    if (!response.ok) return null;
    const data = await response.json();
    const current = data?.current_condition?.[0];
    if (!current) return null;
    const parseNumber = (key: string) => Number.parseFloat(current[key]) || 0;
    return {
      city: data?.nearest_area?.[0]?.areaName?.[0]?.value ?? city,
      temperature: parseNumber("temp_C"),
      condition: current.weatherDesc?.[0]?.value ?? "Unknown",
      humidity: parseNumber("humidity"),
      windSpeed: parseNumber("windspeedKmph"),
      windDirection: current.winddir16Point ?? "",
      feelsLike: parseNumber("FeelsLikeC") || parseNumber("temp_C"),
      uvIndex: parseNumber("uvIndex"),
    };
  } catch {
    return null;
  }
}

export function useDashboardWeather(city = "沈阳") {
  return useQuery({
    queryKey: ["weather", city],
    queryFn: async () => {
      const cached = await storage.get<LocalWeather>("weather", city);
      if (cached && Date.now() - cached.updatedAt < 24 * 60 * 60 * 1000)
        return cached;

      let payload: Record<string, unknown> | null = null;
      try {
        payload = await api.get<Record<string, unknown>>(
          `/weather?city=${encodeURIComponent(city)}`,
        );
      } catch {
        payload = await fetchWttr(city);
      }
      if (!payload) return cached ?? null;

      const weather = toLocalWeather(payload);
      await storage.put(
        "weather",
        weather as unknown as Record<string, unknown>,
      );
      return weather;
    },
    staleTime: 24 * 60 * 60 * 1000,
  });
}
