import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fxKey, type FxRateMap } from "@/lib/fxRates";

/**
 * Dagliga kurser mot SEK från och med ett datum. Används för att visa
 * schweizisk omsättning (CHF) i kronor med respektive dags kurs.
 */
export function useFxRates(from?: string | null) {
  return useQuery<FxRateMap>({
    queryKey: ["fx-daily-rates", from ?? "all"],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      let q = (supabase as any)
        .from("fx_daily_rates")
        .select("rate_date, base_currency, quote_currency, rate")
        .eq("quote_currency", "SEK");
      if (from) q = q.gte("rate_date", from);
      const { data, error } = await q;
      if (error) {
        console.error("[fx] kunde inte läsa växelkurser", error);
        return new Map();
      }
      const map: FxRateMap = new Map();
      (data ?? []).forEach((r: any) => {
        map.set(fxKey(r.base_currency, r.rate_date), Number(r.rate));
      });
      return map;
    },
  });
}
