import { CloudSun, CloudRain, Sun, Cloud, CloudSnow, CloudLightning } from 'lucide-react';
import { useT } from '@/lib/i18n';

interface WeatherTileProps {
  city?: string;
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed?: string;
  windDirection?: string;
  feelsLike: number;
  uvIndex?: string;
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
  temperature, condition, humidity, feelsLike,
}: WeatherTileProps) {
  const t = useT();
  const key = condition.toLowerCase().includes('rain') ? 'rainy'
    : condition.toLowerCase().includes('snow') ? 'snowy'
    : condition.toLowerCase().includes('storm') ? 'stormy'
    : condition.toLowerCase().includes('cloud') || condition.toLowerCase().includes('partly') ? 'partlyCloudy'
    : condition.toLowerCase().includes('overcast') ? 'cloudy'
    : 'sunny';

  const WeatherIcon = iconMap[key] ?? Sun;

  return (
    <div className="studio-tile h-full">
      <div className="studio-tile-inner tile-anim-2">
        <div className="studio-tile-header">
          <h3>
            <CloudSun size={15} className="text-sky-500" />
            {t('weather.title')}
          </h3>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center py-1">
          <div className="weather-icon-large mb-1">
            <WeatherIcon size={36} className="text-amber-500" />
          </div>
          <p className="text-4xl font-bold tabular-nums tracking-tight text-stone-800" style={{ fontFamily: 'var(--studio-font-serif)' }}>
            {temperature}°
          </p>
          <p className="text-[13px] text-stone-500">{condition}</p>
        </div>

        <div className="mt-auto flex items-center justify-center gap-8 border-t border-stone-100 pt-2">
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-stone-400">{t('weather.humidity')}</span>
            <span className="text-[11px] font-medium text-stone-600">{humidity}%</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-stone-400">{t('weather.feelsLike')}</span>
            <span className="text-[11px] font-medium text-stone-600">{feelsLike}°C</span>
          </div>
        </div>

        <p className="mt-1.5 text-center text-[11px] text-stone-400">沈阳</p>
      </div>
    </div>
  );
}
