import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface StockMovementFilter {
  locationIds?: string[];
  productId?: string;
  lotId?: string;
  movementType?: string;
  limit?: number;
}

/** Lagerrörelser med produkt, lagerplats, parti och användare. */
export function useStockMovements(filter: StockMovementFilter = {}) {
  const { locationIds, productId, lotId, movementType, limit = 200 } = filter;
  return useQuery({
    queryKey: ["stock_movements", locationIds, productId, lotId, movementType, limit],
    queryFn: async () => {
      let q = supabase
        .from("stock_movements")
        .select(
          "*, products(name, sku, unit, image_url), storage_locations(name, store_id, stores!storage_locations_store_id_fkey(name)), lots(lot_number, catch_area, best_before), staff(first_name, last_name)",
        )
        .order("created_at", { ascending: false })
        .limit(limit);
      if (locationIds?.length) q = q.in("location_id", locationIds);
      if (productId) q = q.eq("product_id", productId);
      if (lotId) q = q.eq("lot_id", lotId);
      if (movementType && movementType !== "all") q = q.eq("movement_type", movementType);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

export const MOVEMENT_LABELS: Record<string, string> = {
  inleverans: "Inleverans",
  tillverkning_in: "Tillverkning in",
  tillverkning_ut: "Tillverkning ut",
  overforing_in: "Överföring in",
  overforing_ut: "Överföring ut",
  forsaljning: "Försäljning",
  svinn: "Svinn",
  justering: "Justering",
  inventering: "Inventering",
};
