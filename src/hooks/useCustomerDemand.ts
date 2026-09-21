import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CustomerDemand = {
  productId: string;
  productName: string;
  unit: string;
  category: string | null;
  imageUrl: string | null;
  /** Kundbeställd mängd som ännu inte täcks av en butiksbeställning. */
  quantity: number;
  customers: string[];
  /** Tidigaste önskade dagen bland kundbeställningarna. */
  earliestDate: string | null;
  /** Sant när en kundbeställning har en önskad dag före valt leveransdatum. */
  late: boolean;
};

const CLOSED = ["Levererad", "Avbruten", "Arkiverad"];

/**
 * Kundbeställd mängd per vara för en butik till och med valt leveransdatum,
 * minus det butiken redan har beställt hos grossisten för samma period.
 *
 * Underlaget används för att fylla butikens beställning till grossisten direkt,
 * så att kundernas varor aldrig behöver skrivas in två gånger.
 */
export function useCustomerDemand(storeId?: string | null, deliveryDate?: string | null) {
  return useQuery<Map<string, CustomerDemand>>({
    queryKey: ["customer-demand", storeId, deliveryDate],
    enabled: !!storeId && !!deliveryDate,
    staleTime: 30_000,
    queryFn: async () => {
      const result = new Map<string, CustomerDemand>();
      if (!storeId || !deliveryDate) return result;

      // 1. Öppna kundbeställningar med önskad dag till och med valt datum.
      const { data: orders, error: oErr } = await supabase
        .from("customer_orders")
        .select("id, status, customer_name, wanted_date")
        .eq("store_id", storeId)
        .lte("wanted_date", deliveryDate)
        .limit(2000);
      if (oErr) throw oErr;

      const open = (orders || []).filter((o: any) => !CLOSED.includes(o.status || ""));
      if (open.length === 0) return result;
      const orderById = new Map(open.map((o: any) => [o.id, o]));

      const { data: lines, error: lErr } = await supabase
        .from("customer_order_lines")
        .select("customer_order_id, product_id, quantity_ordered, unit, products(name, unit, category, image_url)")
        .in("customer_order_id", open.map((o: any) => o.id))
        .limit(5000);
      if (lErr) throw lErr;

      for (const l of (lines || []) as any[]) {
        if (!l.product_id) continue; // fritextrader kan inte beställas automatiskt
        const qty = Number(l.quantity_ordered) || 0;
        if (qty <= 0) continue;
        const order = orderById.get(l.customer_order_id) as any;
        const entry =
          result.get(l.product_id) ??
          ({
            productId: l.product_id,
            productName: l.products?.name || "Okänd vara",
            unit: l.unit || l.products?.unit || "kg",
            category: l.products?.category ?? null,
            imageUrl: l.products?.image_url ?? null,
            quantity: 0,
            customers: [],
            earliestDate: null,
            late: false,
          } as CustomerDemand);
        entry.quantity += qty;
        if (order?.customer_name && !entry.customers.includes(order.customer_name)) {
          entry.customers.push(order.customer_name);
        }
        if (order?.wanted_date) {
          if (!entry.earliestDate || order.wanted_date < entry.earliestDate) entry.earliestDate = order.wanted_date;
          if (order.wanted_date < deliveryDate) entry.late = true;
        }
        result.set(l.product_id, entry);
      }
      if (result.size === 0) return result;

      // 2. Dra bort det butiken redan beställt hos grossisten för samma period.
      const { data: shopOrders, error: sErr } = await supabase
        .from("shop_orders")
        .select("id, status, desired_delivery_date, shop_order_lines(product_id, quantity_ordered, delivery_date)")
        .eq("store_id", storeId)
        .limit(500);
      if (sErr) throw sErr;

      for (const so of (shopOrders || []) as any[]) {
        if (so.status === "Arkiverad" || so.status === "Avbruten") continue;
        for (const sl of so.shop_order_lines || []) {
          const day = sl.delivery_date || so.desired_delivery_date;
          if (!day || day > deliveryDate) continue;
          const entry = result.get(sl.product_id);
          if (!entry) continue;
          entry.quantity -= Number(sl.quantity_ordered) || 0;
        }
      }

      for (const [id, entry] of result) {
        entry.quantity = Math.round(entry.quantity * 10) / 10;
        if (entry.quantity <= 0) result.delete(id);
      }
      return result;
    },
  });
}
