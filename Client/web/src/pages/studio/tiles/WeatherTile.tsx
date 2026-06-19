import {
  CloudSun,
  CloudRain,
  Sun,
  Cloud,
  CloudSnow,
  CloudLightning,
  Locate,
  LocateFixed,
} from "lucide-react";
import { useT } from "@/lib/i18n";

interface WeatherTileProps {
  city?: string;
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed?: string;
  windDirection?: string;
  feelsLike: number;
  uvIndex?: string;
  /** 用户点 "重新定位" 按钮时的回调 */
  onRelocate?: () => void;
  /** 是否正在重新申请定位 */
  isRelocating?: boolean;
}

const iconMap: Record<string, typeof Sun> = {
  sunny: Sun,
  cloudy: Cloud,
  partlyCloudy: CloudSun,
  rainy: CloudRain,
  snowy: CloudSnow,
  stormy: CloudLightning,
};

export function WeatherTile({
  city,
  temperature,
  condition,
  humidity,
  feelsLike,
  onRelocate,
  isRelocating,
}: WeatherTileProps) {
  const t = useT();
  const key = condition.toLowerCase().includes("rain")
    ? "rainy"
    : condition.toLowerCase().includes("snow")
      ? "snowy"
      : condition.toLowerCase().includes("storm")
        ? "stormy"
        : condition.toLowerCase().includes("cloud") ||
            condition.toLowerCase().includes("partly")
          ? "partlyCloudy"
          : condition.toLowerCase().includes("overcast")
            ? "cloudy"
            : "sunny";

  const WeatherIcon = iconMap[key] ?? Sun;

  return (
    <div className="studio-tile h-full">
      <div className="studio-tile-inner tile-anim-2">
        <div className="studio-tile-header">
          <h3>
            <CloudSun size={15} className="text-sky-500" />
            {t("weather.title")}
          </h3>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center py-1">
          <div className="weather-icon-large mb-1">
            <WeatherIcon size={36} className="text-amber-500" />
          </div>
          <p
            className="text-4xl font-bold tabular-nums tracking-tight text-stone-800"
            style={{ fontFamily: "var(--studio-font-serif)" }}
          >
            {temperature}°
          </p>
          <p className="text-[13px] text-stone-500">{condition}</p>
        </div>

        <div className="mt-auto flex items-center justify-center gap-8 border-t border-stone-100 pt-2">
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-stone-400">
              {t("weather.humidity")}
            </span>
            <span className="text-[11px] font-medium text-stone-600">
              {humidity}%
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-stone-400">
              {t("weather.feelsLike")}
            </span>
            <span className="text-[11px] font-medium text-stone-600">
              {feelsLike}°C
            </span>
          </div>
        </div>

        <p className="mt-1.5 flex items-center justify-center gap-1.5 text-center text-[11px] text-stone-400">
          <span>{city ?? "—"}</span>
          {onRelocate ? (
            <button
              type="button"
              onClick={onRelocate}
              disabled={isRelocating}
              title="重新申请定位"
              aria-label="重新申请定位"
              className="inline-flex h-4 w-4 items-center justify-center rounded text-stone-400 transition hover:bg-stone-100 hover:text-stone-600 disabled:opacity-50"
            >
              {isRelocating ? (
                <LocateFixed size={11} className="animate-pulse" />
              ) : (
                <Locate size={11} />
              )}
            </button>
          ) : null}
        </p>
      </div>
    </div>
  );
}
