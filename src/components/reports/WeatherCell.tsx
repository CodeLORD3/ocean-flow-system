import {
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Cloud,
  CloudSun,
  Sun,
  Wind,
  type LucideIcon,
} from "lucide-react";
import type { StoreWeatherDay } from "@/hooks/useStoreWeather";

/** WMO-kod → ikon. */
export function weatherIcon(code?: number | null): LucideIcon {
  if (code == null) return Cloud;
  if (code === 0) return Sun;
  if (code <= 2) return CloudSun;
  if (code === 3) return Cloud;
  if (code === 45 || code === 48) return CloudFog;
  if (code >= 51 && code <= 57) return CloudDrizzle;
  if (code >= 61 && code <= 67) return CloudRain;
  if (code >= 71 && code <= 77) return CloudSnow;
  if (code >= 80 && code <= 82) return CloudRain;
  if (code >= 85 && code <= 86) return CloudSnow;
  if (code >= 95) return CloudLightning;
  return Cloud;
}

/** Symmetrisk vädercell: ikon, text och temperatur i fasta kolumner. */
export function WeatherCell({
  day,
  loading,
}: {
  day?: StoreWeatherDay | null;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-[1rem_1fr_3.25rem] items-center gap-1.5 text-muted-foreground">
        <span className="h-4 w-4 animate-pulse rounded-full bg-muted" />
        <span className="h-2.5 w-16 animate-pulse rounded bg-muted" />
        <span />
      </div>
    );
  }
  if (!day) {
    return (
      <div className="grid grid-cols-[1rem_1fr_3.25rem] items-center gap-1.5 text-muted-foreground">
        <span />
        <span>—</span>
        <span />
      </div>
    );
  }

  const Icon = weatherIcon(day.weather_code);
  const windy = Number(day.windspeed_max ?? 0) > 30;
  const temp = day.temp_max == null ? null : `${Math.round(Number(day.temp_max))}°`;

  return (
    <div className="grid grid-cols-[1rem_1fr_3.25rem] items-center gap-1.5">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="flex min-w-0 items-center gap-1 truncate">
        <span className="truncate">{day.weather_text ?? "—"}</span>
        {windy && <Wind className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Blåsigt" />}
      </span>
      <span className="text-right font-mono tabular-nums text-muted-foreground">{temp ?? "—"}</span>
    </div>
  );
}
