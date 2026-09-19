import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Nätförsäljning (Shopify) per butik och dag.
 *
 * Webbordern räknas på LEVERANSDAGEN (wanted_date) och på den butik kunden
 * hämtar i, precis som butikens övriga arbete. Siffran är en egen kolumn vid
 * sidan av kassans dagsrapport — den skrivs aldrig in i dagsrapporten och
 * påverkar inte låsningen av veckorapporter.
 */
export type WebSalesDay = { amount: number; orders: number };
export type WebSalesMap = Map<string, WebSalesDay>;

/** Nyckel: butik + datum. */
export const webKey = (storeId: string, date: string) => `${storeId}|${date}`;

const CANCELLED = new Set(["makulerad", "avbruten", "annullerad"]);

export function useWebSales(from?: string | null, to?: string | null, storeId?: string | null) {
  return useQuery<WebSalesMap>({
    queryKey: ["web-sales", from ?? "", to ?? "", storeId ?? "all"],
    enabled: !!from && !!to,
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
      const map: WebSalesMap = new Map();
      (data ?? []).forEach((o: any) => {
        if (!o.store_id || !o.wanted_date) return;
        if (CANCELLED.has(String(o.status ?? "").toLowerCase())) return;
        const amount = Number(o.paid_total ?? o.total_incl_vat ?? o.estimated_total ?? 0);
        if (!Number.isFinite(amount)) return;
        const key = webKey(o.store_id, o.wanted_date);
        const prev = map.get(key) ?? { amount: 0, orders: 0 };
        map.set(key, { amount: prev.amount + amount, orders: prev.orders + 1 });
      });
      return map;
    },
  });
}

/** Summerar webbförsäljningen för en butik över ett antal dagar. */
export function webTotal(map: WebSalesMap | undefined, storeId: string, days: string[]): WebSalesDay {
  return (days ?? []).reduce<WebSalesDay>(
    (acc, d) => {
      const row = map?.get(webKey(storeId, d));
      return row ? { amount: acc.amount + row.amount, orders: acc.orders + row.orders } : acc;
    },
    { amount: 0, orders: 0 },
  );
}
