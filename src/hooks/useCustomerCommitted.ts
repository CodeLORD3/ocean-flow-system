import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Kundbeställd mängd per produkt för en butik.
 *
 * Används för att föreslå hur mycket av en butiksbeställning som är låst till
 * en riktig kund (måste med) och hur mycket som bara är påfyllning till kyldisken.
 * Endast order som ännu inte är levererade eller avbrutna räknas.
 */
export function useCustomerCommitted(storeId?: string | null) {
  return useQuery<Map<string, { quantity: number; unit: string; customers: string[] }>>({
    queryKey: ["customer-committed", storeId],
    enabled: !!storeId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: orders, error: oErr } = await supabase
        .from("customer_orders")
        .select("id, status, customer_name_snapshot, wanted_date")
        .eq("store_id", storeId!)
        .limit(2000);
      if (oErr) throw oErr;

      const open = (orders || []).filter(
        (o: any) => !["Levererad", "Avbruten", "Arkiverad"].includes(o.status || ""),
      );
      if (open.length === 0) return new Map();

      const byId = new Map(open.map((o: any) => [o.id, o]));
      const { data: lines, error: lErr } = await supabase
        .from("customer_order_lines")
        .select("customer_order_id, product_id, quantity_ordered, unit")
        .in(
          "customer_order_id",
          open.map((o: any) => o.id),
        )
        .limit(5000);
      if (lErr) throw lErr;

      const map = new Map<string, { quantity: number; unit: string; customers: string[] }>();
      for (const l of lines || []) {
        if (!l.product_id) continue;
        const entry =
          map.get(l.product_id) ?? { quantity: 0, unit: l.unit || "kg", customers: [] };
        entry.quantity += Number(l.quantity_ordered) || 0;
        const name = (byId.get(l.customer_order_id) as any)?.customer_name_snapshot;
        if (name && !entry.customers.includes(name)) entry.customers.push(name);
        map.set(l.product_id, entry);
      }
      return map;
    },
  });
}
