import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PosProduct {
  id: string;
  sku: string;
  name: string;
  category: string;
  vat_rate: number;
  unit_type: "piece" | "kg" | "custom";
  price_ore: number;
  image_url: string | null;
  barcode: string | null;
  active: boolean;
  sort_order: number;
  stock_quantity: number;
}

/**
 * Returnerar de POS-produkter som faktiskt finns i lager för den angivna butiken.
 *
 * Flöde:
 *   pos_products.erp_id  → products.id
 *   products             → product_stock_locations (qty > 0)
 *   product_stock_locations.location_id → storage_locations.store_id = storeId
 *
 * Saknas storeId visas inga produkter (POS måste alltid vara butiksbunden).
 */
export function usePosProducts(storeId: string | null | undefined) {
  return useQuery({
    queryKey: ["pos_products", storeId ?? "none"],
    enabled: !!storeId,
    queryFn: async (): Promise<PosProduct[]> => {
      if (!storeId) return [];

      // 1. Hämta alla lagerplatser i butiken
      const { data: locations, error: locErr } = await (supabase as any)
        .from("storage_locations")
        .select("id")
        .eq("store_id", storeId);
      if (locErr) throw locErr;
      const locationIds = (locations ?? []).map((l: any) => l.id);
      if (locationIds.length === 0) return [];

      // 2. Hämta lager > 0 för dessa platser
      const { data: stock, error: stockErr } = await (supabase as any)
        .from("product_stock_locations")
        .select("product_id, quantity")
        .in("location_id", locationIds)
        .gt("quantity", 0);
      if (stockErr) throw stockErr;

      // Aggregera per produkt
      const stockByProduct = new Map<string, number>();
      for (const row of stock ?? []) {
        stockByProduct.set(
          row.product_id,
          (stockByProduct.get(row.product_id) ?? 0) + Number(row.quantity ?? 0),
        );
      }
      const productIds = Array.from(stockByProduct.keys());
      if (productIds.length === 0) return [];

      // 3. Hämta POS-produkterna som är länkade till dessa ERP-produkter
      const { data: posProducts, error: posErr } = await (supabase as any)
        .from("pos_products")
        .select("*")
        .eq("active", true)
        .in("erp_id", productIds)
        .order("category")
        .order("sort_order");
      if (posErr) throw posErr;

      return (posProducts ?? []).map((p: any) => ({
        ...p,
        stock_quantity: stockByProduct.get(p.erp_id) ?? 0,
      })) as PosProduct[];
    },
    staleTime: 30_000,
  });
}
