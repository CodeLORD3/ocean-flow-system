import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStores } from "@/hooks/useStores";

/**
 * Nätförsäljning (Shopify: fiskskaldjur.se och fiskskaldjur.ch) per butik och dag.
 *
 * Webbordern är förbetald och syns aldrig i kassans Z-rapport. Den räknas därför
 * IN i butikens omsättning, på leveransdagen (wanted_date) och på den butik kunden
 * hämtar i, med en egen underrad "varav webbshop".
 *
 * Beloppen i customer_orders är med moms. Butikernas rapporter visar netto, så
 * webben räknas om till netto med butikens momssats: 6 % i Sverige, 2,6 % i
 * Schweiz. Dagsrapporterna själva rörs aldrig — tillägget sker i rapportvyn.
 */
export type WebSalesDay = { gross: number; net: number; orders: number };
export type WebSalesMap = Map<string, WebSalesDay>;

/** Nyckel: butik + datum. */
export const webKey = (storeId: string, date: string) => `${storeId}|${date}`;

const CANCELLED = new Set(["makulerad", "avbruten", "annullerad"]);

/** Momssats på fisk och skaldjur: Sverige 6 %, Schweiz 2,6 %. */
export const webVatRate = (currency?: string | null) =>
  String(currency ?? "SEK").toUpperCase() === "CHF" ? 0.026 : 0.06;

export function useWebSales(from?: string | null, to?: string | null, storeId?: string | null) {
  const { data: stores = [] } = useStores();
  const ready = stores.length > 0;

  return useQuery<WebSalesMap>({
    queryKey: ["web-sales", from ?? "", to ?? "", storeId ?? "all", ready],
    enabled: !!from && !!to && ready,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      let q = (supabase as any)
        .from("customer_orders")
        .select("store_id, wanted_date, status, currency, paid_total, total_incl_vat, estimated_total")
        .eq("source", "shopify")
        .gte("wanted_date", from)
        .lte("wanted_date", to);
      if (storeId) q = q.eq("store_id", storeId);
      const { data, error } = await q;
      if (error) {
        console.error("[webbförsäljning] kunde inte läsas", error);
        return new Map();
      }
      const curOf = new Map(stores.map((s: any) => [s.id, String(s.currency ?? "SEK").toUpperCase()]));
      const map: WebSalesMap = new Map();
      (data ?? []).forEach((o: any) => {
        if (!o.store_id || !o.wanted_date) return;
        if (CANCELLED.has(String(o.status ?? "").toLowerCase())) return;
        const gross = Number(o.paid_total ?? o.total_incl_vat ?? o.estimated_total ?? 0);
        if (!Number.isFinite(gross) || gross === 0) return;
        const cur = String(o.currency ?? curOf.get(o.store_id) ?? "SEK").toUpperCase();
        const net = gross / (1 + webVatRate(cur));
        const key = webKey(o.store_id, o.wanted_date);
        const prev = map.get(key) ?? { gross: 0, net: 0, orders: 0 };
        map.set(key, { gross: prev.gross + gross, net: prev.net + net, orders: prev.orders + 1 });
      });
      return map;
    },
  });
}

const EMPTY: WebSalesDay = { gross: 0, net: 0, orders: 0 };

/** Summerar webbförsäljningen för en butik över ett antal dagar. */
export function webTotal(map: WebSalesMap | undefined, storeId: string, days: string[]): WebSalesDay {
  return (days ?? []).reduce<WebSalesDay>((acc, d) => {
    const row = map?.get(webKey(storeId, d));
    return row
      ? { gross: acc.gross + row.gross, net: acc.net + row.net, orders: acc.orders + row.orders }
      : acc;
  }, EMPTY);
}

/** Summerar webbförsäljningen för flera butiker inom ett datumintervall. */
export function webRangeTotal(
  map: WebSalesMap | undefined,
  storeIds: Iterable<string>,
  from: string,
  to: string,
): WebSalesDay {
  const ids = new Set(storeIds);
  let acc = { ...EMPTY };
  map?.forEach((row, key) => {
    const [sid, date] = key.split("|");
    if (!ids.has(sid) || date < from || date > to) return;
    acc = { gross: acc.gross + row.gross, net: acc.net + row.net, orders: acc.orders + row.orders };
  });
  return acc;
}
