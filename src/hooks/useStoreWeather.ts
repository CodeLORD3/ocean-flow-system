import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface StoreWeatherDay {
  weather_date: string;
  temp_max: number | null;
  temp_min: number | null;
  precipitation_mm: number | null;
  windspeed_max: number | null;
  weather_code: number | null;
  weather_text: string | null;
  source: string;
}

/** "Klart, 24°C" — eller "—" om dagen saknar väderdata. */
export function weatherLabel(day?: StoreWeatherDay | null) {
  if (!day) return "—";
  const text = day.weather_text ?? "";
  const temp = day.temp_max == null ? null : `${Math.round(Number(day.temp_max))}°C`;
  return [text, temp].filter(Boolean).join(", ") || "—";
}

/**
 * Väder per dag för en butik. Läser cachen direkt och triggar samtidigt
 * backend-funktionen som fyller på saknade dagar (arkiv eller prognos).
 */
export function useStoreWeather(storeId?: string | null, from?: string, to?: string) {
  return useQuery({
    queryKey: ["store-weather", storeId, from, to],
    enabled: !!storeId && !!from && !!to,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("store-weather", {
        body: { store_id: storeId, start_date: from, end_date: to },
      });
      if (error) {
        // Väder är extra information — rapporten ska aldrig falla på detta.
        console.warn("Kunde inte hämta väder", error);
        const fallback = await (supabase as any)
          .from("store_weather_daily")
          .select("weather_date, temp_max, temp_min, precipitation_mm, windspeed_max, weather_code, weather_text, source")
          .eq("store_id", storeId)
          .gte("weather_date", from)
          .lte("weather_date", to);
        return new Map<string, StoreWeatherDay>(
          ((fallback.data ?? []) as StoreWeatherDay[]).map((d) => [d.weather_date, d]),
        );
      }
      const days = ((data as any)?.days ?? []) as StoreWeatherDay[];
      return new Map<string, StoreWeatherDay>(days.map((d) => [d.weather_date, d]));
    },
  });
}
