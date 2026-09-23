import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSite } from "@/contexts/SiteContext";

/**
 * Packat och beställt per produkt — samma bild som Totallistan, men sett från
 * lagret. Packat betyder att varan finns kvar fysiskt men redan är plockad
 * till en order och håller på att byta plats (gul andel i lagerstapeln).
 *
 * Grossistens kunder är butikerna: där räknas butiksorderrader
 * (shop_order_lines). I butiksportalen är kunden privatkunden: där räknas
 * kundbeställningarna (customer_order_lines).
 */
export interface PackedOrderRef {
  orderId: string;
  orderNumber: string;
  customerName: string;
  wantedDate: string | null;
  quantity: number;
  unit: string;
  status: string;
  /** Packat = redan plockat. Beställt = kvar att packa. */
  kind: "packed" | "ordered";
}

export interface PackedProduct {
  /** Summa packat i produktens enhet. */
  packed: number;
  /** Summa beställt som ännu inte är packat. */
  ordered: number;
  unit: string;
  orders: PackedOrderRef[];
}

/** Rader som är plockade men ännu ligger i grossistlagret. */
const PACKED_LINE_STATUS = "Packad";
/** Rader som är beställda men ännu inte plockade. */
const OPEN_LINE_STATUSES = ["", "Ny", "Pågående", "Beställd", "Producerad"];
/** Ordrar som lämnat lagret eller är avslutade. */
const CLOSED_SHOP_ORDER_STATUSES = ["Avbruten", "Levererad", "Klar / Levererad", "Arkiverad", "Skickad"];
const OPEN_CUSTOMER_STATUSES = ["ny", "bekraftad", "packad"];

/** Dagens datum i svensk tid — gamla ordrar ska aldrig visas i lagret. */
function todayIsoSweden() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date());
}

function add(
  map: Map<string, PackedProduct>,
  productId: string,
  unit: string,
  qty: number,
  ref: PackedOrderRef,
) {
  const entry = map.get(productId) ?? { packed: 0, ordered: 0, unit, orders: [] };
  if (ref.kind === "packed") entry.packed += qty;
  else entry.ordered += qty;
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
      const today = todayIsoSweden();

      if (wholesale) {
        const { data, error } = await supabase
          .from("shop_order_lines")
          .select(
            "product_id, quantity_ordered, quantity_delivered, unit, status, delivery_date, products(unit), shop_orders!inner(id, status, store_id, desired_delivery_date, stores(name))",
          );
        if (error) throw error;
        for (const r of (data || []) as any[]) {
          if (!r.product_id) continue;
          const o = r.shop_orders || {};
          if (CLOSED_SHOP_ORDER_STATUSES.includes(o.status)) continue;
          const lineStatus: string = r.status || "";
          const packedLine = lineStatus === PACKED_LINE_STATUS;
          if (!packedLine && !OPEN_LINE_STATUSES.includes(lineStatus)) continue;
          // Bara aktuella leveranser: gamla orderdatum hör till historiken.
          const lineDate: string | null = r.delivery_date ?? o.desired_delivery_date ?? null;
          if (lineDate && lineDate < today) continue;
          const ordered = Number(r.quantity_ordered || 0);
          const delivered = Number(r.quantity_delivered || 0);
          // Packad rad: den plockade kvantiteten ligger i quantity_delivered
          // (faller tillbaka på beställd mängd när inget skrivits in).
          const packedQty = packedLine ? delivered || ordered : 0;
          const restQty = Math.max(0, ordered - packedQty);
          const unit = r.unit || r.products?.unit || "kg";
          const base = {
            orderId: o.id,
            orderNumber: o.id ? String(o.id).slice(0, 8) : "",
            customerName: o.stores?.name || "Butik",
            wantedDate: r.delivery_date ?? o.desired_delivery_date ?? null,
            unit,
            status: lineStatus || o.status || "",
          };
          if (packedQty > 0.005)
            add(map, r.product_id, unit, packedQty, { ...base, quantity: packedQty, kind: "packed" });
          if (restQty > 0.005)
            add(map, r.product_id, unit, restQty, { ...base, quantity: restQty, kind: "ordered" });
        }
      } else {
        let q = supabase
          .from("customer_order_lines")
          .select(
            "product_id, quantity_ordered, quantity_packed, unit, customer_orders!inner(id, order_number, status, store_id, wanted_date, customer_name_snapshot, customers_retail(name))",
          )
          .in("customer_orders.status", OPEN_CUSTOMER_STATUSES);
        if (storeId) q = q.eq("customer_orders.store_id", storeId);
        const { data, error } = await q;
        if (error) throw error;
        for (const r of (data || []) as any[]) {
          if (!r.product_id) continue;
          const packed = Number(r.quantity_packed || 0);
          const rest = Math.max(0, Number(r.quantity_ordered || 0) - packed);
          const o = r.customer_orders || {};
          if (o.wanted_date && o.wanted_date < today) continue;
          const unit = r.unit || "kg";
          const base = {
            orderId: o.id,
            orderNumber: o.order_number || "",
            customerName: o.customers_retail?.name || o.customer_name_snapshot || "Kund",
            wantedDate: o.wanted_date ?? null,
            unit,
            status: o.status || "",
          };
          if (packed > 0.005)
            add(map, r.product_id, unit, packed, { ...base, quantity: packed, kind: "packed" });
          if (rest > 0.005)
            add(map, r.product_id, unit, rest, { ...base, quantity: rest, kind: "ordered" });
        }
      }

      for (const e of map.values())
        e.orders.sort(
          (a, b) =>
            (a.kind === b.kind ? 0 : a.kind === "packed" ? -1 : 1) ||
            (a.wantedDate || "").localeCompare(b.wantedDate || ""),
        );
      return map;
    },
  });
}
