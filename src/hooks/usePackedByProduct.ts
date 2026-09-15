import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSite } from "@/contexts/SiteContext";

/**
 * Packat per produkt — varan finns kvar fysiskt men är redan packad till en
 * order och håller på att byta plats. Används för den gula andelen i
 * lagerstapeln.
 *
 * Grossistens kunder är butikerna: där räknas packade butiksorderrader
 * (shop_order_lines). I butiksportalen är kunden privatkunden: där räknas
 * packat på kundbeställningarna (customer_order_lines).
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

/** Butiksorderrader som är packade men ännu inte levererade. */
const PACKED_LINE_STATUSES = ["Packad", "Skickad"];
/** Ordrar som fortfarande står kvar i lagret trots att de är packade. */
const CLOSED_SHOP_ORDER_STATUSES = ["Avbruten", "Levererad", "Klar / Levererad", "Arkiverad"];
const OPEN_CUSTOMER_STATUSES = ["ny", "bekraftad", "packad"];

function add(map: Map<string, PackedProduct>, productId: string, unit: string, qty: number, ref: PackedOrderRef) {
  const entry = map.get(productId) ?? { packed: 0, unit, orders: [] };
  entry.packed += qty;
  entry.orders.push(ref);
  map.set(productId, entry);
}

export function usePackedByProduct(storeId?: string | null) {
  const { site } = useSite();
  const wholesale = site !== "shop";

  return useQuery({
    queryKey: ["packed-by-product", wholesale ? "wholesale" : "shop", storeId ?? "all"],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Map<string, PackedProduct>> => {
      const map = new Map<string, PackedProduct>();

      if (wholesale) {
        const { data, error } = await supabase
          .from("shop_order_lines")
          .select(
            "product_id, quantity_ordered, quantity_delivered, unit, status, delivery_date, products(unit), shop_orders!inner(id, status, store_id, desired_delivery_date, stores(name))",
          )
          .in("status", PACKED_LINE_STATUSES);
        if (error) throw error;
        for (const r of (data || []) as any[]) {
          if (!r.product_id) continue;
          const o = r.shop_orders || {};
          if (CLOSED_SHOP_ORDER_STATUSES.includes(o.status)) continue;
          const qty = Number(r.quantity_ordered || 0) - Number(r.quantity_delivered || 0);
          if (qty <= 0.005) continue;
          const unit = r.unit || r.products?.unit || "kg";
          add(map, r.product_id, unit, qty, {
            orderId: o.id,
            orderNumber: o.id ? String(o.id).slice(0, 8) : "",
            customerName: o.stores?.name || "Butik",
            wantedDate: r.delivery_date ?? o.desired_delivery_date ?? null,
            quantity: qty,
            unit,
            status: r.status || "",
          });
        }
      } else {
        let q = supabase
          .from("customer_order_lines")
          .select(
            "product_id, quantity_packed, unit, customer_orders!inner(id, order_number, status, store_id, wanted_date, customer_name_snapshot, customers_retail(name))",
          )
          .in("customer_orders.status", OPEN_CUSTOMER_STATUSES)
          .gt("quantity_packed", 0);
        if (storeId) q = q.eq("customer_orders.store_id", storeId);
        const { data, error } = await q;
        if (error) throw error;
        for (const r of (data || []) as any[]) {
          if (!r.product_id) continue;
          const qty = Number(r.quantity_packed || 0);
          if (qty <= 0.005) continue;
          const o = r.customer_orders || {};
          const unit = r.unit || "kg";
          add(map, r.product_id, unit, qty, {
            orderId: o.id,
            orderNumber: o.order_number || "",
            customerName: o.customers_retail?.name || o.customer_name_snapshot || "Kund",
            wantedDate: o.wanted_date ?? null,
            quantity: qty,
            unit,
            status: o.status || "",
          });
        }
      }

      for (const e of map.values())
        e.orders.sort((a, b) => (a.wantedDate || "").localeCompare(b.wantedDate || ""));
      return map;
    },
  });
}
