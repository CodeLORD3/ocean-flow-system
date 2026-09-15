import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Packat per produkt från kundbeställningar som ännu inte lämnat butiken.
 * Används för att visa den gula andelen i lagerstapeln — varan finns kvar
 * fysiskt men är redan packad till en order och håller på att byta plats.
 */
export interface PackedOrderRef {
  orderId: string;
  orderNumber: string;
  customerName: string;
  wantedDate: string | null;
  quantity: number;
  unit: string;
  status: string;
}

export interface PackedProduct {
  /** Summa packat i produktens enhet. */
  packed: number;
  unit: string;
  orders: PackedOrderRef[];
}

/** Ordrar som fortfarande står kvar i lagret trots att de är packade. */
const OPEN_STATUSES = ["ny", "bekraftad", "packad"];

export function usePackedByProduct(storeId?: string | null) {
  return useQuery({
    queryKey: ["packed-by-product", storeId ?? "all"],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Map<string, PackedProduct>> => {
      let q = supabase
        .from("customer_order_lines")
        .select(
          "product_id, quantity_packed, unit, customer_orders!inner(id, order_number, status, store_id, wanted_date, customer_name_snapshot, customers_retail(name))",
        )
        .in("customer_orders.status", OPEN_STATUSES)
        .gt("quantity_packed", 0);
      if (storeId) q = q.eq("customer_orders.store_id", storeId);
      const { data, error } = await q;
      if (error) throw error;

      const map = new Map<string, PackedProduct>();
      for (const r of (data || []) as any[]) {
        if (!r.product_id) continue;
        const qty = Number(r.quantity_packed || 0);
        if (qty <= 0.005) continue;
        const o = r.customer_orders || {};
        const entry =
          map.get(r.product_id) ?? { packed: 0, unit: r.unit || "kg", orders: [] };
        entry.packed += qty;
        entry.orders.push({
          orderId: o.id,
          orderNumber: o.order_number || "",
          customerName: o.customers_retail?.name || o.customer_name_snapshot || "Kund",
          wantedDate: o.wanted_date ?? null,
          quantity: qty,
          unit: r.unit || "kg",
          status: o.status || "",
        });
        map.set(r.product_id, entry);
      }
      for (const e of map.values())
        e.orders.sort((a, b) => (a.wantedDate || "").localeCompare(b.wantedDate || ""));
      return map;
    },
  });
}
