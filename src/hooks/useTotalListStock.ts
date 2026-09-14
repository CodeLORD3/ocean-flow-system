import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { OPEN_SHOP_ORDER_STATUSES, matchKey } from "@/lib/purchaseReconciliation";

const db = supabase as any;

export interface StockLookupEntry {
  productId: string | null;
  name: string;
  unit: string;
  quantity: number;
}

/**
 * Butikens lagersaldo per produkt, summerat över butikens lagerplatser.
 * Endast läsning — inga skrivningar mot lagret sker här.
 */
export function useStoreStockByProduct(storeId: string | null | undefined) {
  return useQuery({
    queryKey: ["total_list_store_stock", storeId ?? "all"],
    enabled: !!storeId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<StockLookupEntry[]> => {
      const { data, error } = await db
        .from("product_stock_locations")
        .select(
          "product_id, quantity, products(name, unit), storage_locations!inner(store_id, active)",
        )
        .eq("storage_locations.store_id", storeId);
      if (error) throw error;
      const map = new Map<string, StockLookupEntry>();
      for (const r of (data ?? []) as any[]) {
        const key = r.product_id ?? matchKey(r.products?.name);
        if (!key) continue;
        const cur =
          map.get(key) ??
          ({
            productId: r.product_id ?? null,
            name: r.products?.name ?? "",
            unit: r.products?.unit ?? "st",
            quantity: 0,
          } as StockLookupEntry);
        cur.quantity += Number(r.quantity || 0);
        map.set(key, cur);
      }
      return [...map.values()];
    },
  });
}

export interface ShopOrderOutstanding {
  productId: string | null;
  name: string;
  unit: string;
  category: string | null;
  imageUrl: string | null;
  quantity: number;
  /** Effektivt leveransdatum, för placering i rätt dag/vecka. */
  date: string | null;
  storeId: string;
  orderStatus: string;
}

/**
 * Utestående grossistorderrader med produktnamn, kategori och bild — så de kan
 * visas i totallistan även när ingen kund har beställt varan.
 */
export function useOutstandingShopOrderLines() {
  return useQuery({
    queryKey: ["total_list_shop_order_lines"],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<ShopOrderOutstanding[]> => {
      const { data, error } = await db
        .from("shop_order_lines")
        .select(
          "product_id, quantity_ordered, quantity_delivered, unit, delivery_date, products(name, unit, category, image_url), shop_orders!inner(status, store_id, desired_delivery_date)",
        );
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        productId: r.product_id ?? null,
        name: r.products?.name ?? "",
        unit: r.unit ?? r.products?.unit ?? "st",
        category: r.products?.category ?? null,
        imageUrl: r.products?.image_url ?? null,
        quantity: Number(r.quantity_ordered || 0) - Number(r.quantity_delivered || 0),
        date: r.delivery_date ?? r.shop_orders?.desired_delivery_date ?? null,
        storeId: r.shop_orders?.store_id ?? "",
        orderStatus: r.shop_orders?.status ?? "Ny",
      }));
    },
  });
}

export interface TotalListExtras {
  /** Lagersaldo per product_id. */
  stockById: Map<string, number>;
  /** Lagersaldo per normaliserat varunamn (fallback när produkt saknas). */
  stockByName: Map<string, number>;
  /** Utestående grossistorder per product_id. */
  orderedById: Map<string, number>;
  /** Utestående grossistorder per normaliserat varunamn. */
  orderedByName: Map<string, number>;
  /** Beställda varor i perioden, för rader som saknar kundbeställning. */
  orderedRows: ShopOrderOutstanding[];
  isLoading: boolean;
}

/**
 * Lager och utestående grossistorder för Totallistan. Ordermängden räknas som
 * beställt minus levererat på öppna grossistordrar med effektivt leveransdatum
 * inom totallistans intervall.
 */
export function useTotalListExtras({
  storeId,
  fromDate,
  toDate,
  enabled = true,
}: {
  storeId: string | null;
  fromDate: string;
  toDate: string;
  enabled?: boolean;
}): TotalListExtras {
  const { data: stock = [], isLoading: stockLoading } = useStoreStockByProduct(
    enabled ? storeId : null,
  );
  const { data: shopLines = [], isLoading: linesLoading } = useOutstandingShopOrderLines();

  return useMemo(() => {
    const stockById = new Map<string, number>();
    const stockByName = new Map<string, number>();
    for (const s of stock) {
      if (s.productId) stockById.set(s.productId, (stockById.get(s.productId) ?? 0) + s.quantity);
      const k = matchKey(s.name);
      if (k) stockByName.set(k, (stockByName.get(k) ?? 0) + s.quantity);
    }

    const orderedById = new Map<string, number>();
    const orderedByName = new Map<string, number>();
    const orderedRows: ShopOrderOutstanding[] = [];
    if (enabled) {
      // Butikens egen öppna beställning räknas också med — den är lagd men
      // ännu inte skickad till grossisten.
      const open = new Set<string>([
        ...(OPEN_SHOP_ORDER_STATUSES as readonly string[]),
        "Öppen",
      ]);
      for (const l of shopLines) {
        if (!open.has(l.orderStatus)) continue;
        if (storeId && l.storeId !== storeId) continue;
        // Rader utan leveransdatum räknas alltid med; annars måste datumet
        // ligga inom totallistans intervall.
        if (l.date && (l.date < fromDate || l.date > toDate)) continue;
        if (l.quantity <= 0.005) continue;
        if (l.productId)
          orderedById.set(l.productId, (orderedById.get(l.productId) ?? 0) + l.quantity);
        const k = matchKey(l.name);
        if (k) orderedByName.set(k, (orderedByName.get(k) ?? 0) + l.quantity);
        orderedRows.push(l);
      }
    }

    return {
      stockById,
      stockByName,
      orderedById,
      orderedByName,
      orderedRows,
      isLoading: enabled ? stockLoading || linesLoading : false,
    };
  }, [stock, shopLines, storeId, fromDate, toDate, enabled, stockLoading, linesLoading]);
}
