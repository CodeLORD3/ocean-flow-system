import { useQuery } from "@tanstack/react-query";

/**
 * Livekurs mot internet för butiker som säljer i annan valuta än SEK
 * (Zollikon säljer i CHF). Kursen hämtas om varje sekund så växlingen som
 * visas vid sidan av CHF-siffrorna alltid är dagsaktuell.
 *
 * Primär källa: Frankfurter (ECB-kurser). Reserv: open.er-api.com.
 * SEK-siffror räknas aldrig om — CHF står först, SEK visas som växling.
 */
export type FxRate = { from: string; to: string; rate: number; source: string; fetchedAt: number };

async function fetchRate(from: string, to: string): Promise<FxRate> {
  try {
    const r = await fetch(`https://api.frankfurter.dev/v1/latest?base=${from}&symbols=${to}`);
    if (r.ok) {
      const j = await r.json();
      const rate = Number(j?.rates?.[to]);
      if (Number.isFinite(rate) && rate > 0) {
        return { from, to, rate, source: "Frankfurter (ECB)", fetchedAt: Date.now() };
      }
    }
  } catch (_e) {
    /* faller igenom till reservkällan */
  }
  const r2 = await fetch(`https://open.er-api.com/v6/latest/${from}`);
  if (!r2.ok) throw new Error("Kunde inte hämta valutakurs");
  const j2 = await r2.json();
  const rate = Number(j2?.rates?.[to]);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Valutakurs saknas");
  return { from, to, rate, source: "exchangerate-api", fetchedAt: Date.now() };
}

export function useFxRate(from = "CHF", to = "SEK", enabled = true) {
  return useQuery({
    queryKey: ["fx-rate", from, to],
    enabled: enabled && from.toUpperCase() !== to.toUpperCase(),
    refetchInterval: 1000,
    refetchIntervalInBackground: false,
    staleTime: 1000,
    retry: 1,
    queryFn: () => fetchRate(from.toUpperCase(), to.toUpperCase()),
  });
}
