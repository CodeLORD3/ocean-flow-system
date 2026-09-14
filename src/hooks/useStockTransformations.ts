import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { performTransformation, type TransformInput } from "@/lib/stockTransform";

export interface TransformationRow {
  id: string;
  store_id: string | null;
  location_id: string | null;
  transform_kind: string;
  source_quantity: number;
  target_quantity: number;
  target_packages: number | null;
  yield_pct: number | null;
  waste_quantity: number;
  waste_reason: string | null;
  note: string | null;
  performed_at: string;
  performed_by_name: string | null;
  source: { name: string; sku: string; unit: string } | null;
  target: { name: string; sku: string; unit: string } | null;
  storage_locations: { name: string } | null;
  source_lot: { lot_number: string } | null;
  target_lot: { lot_number: string } | null;
}

/** Omvandlingshistorik, senaste först. Filtreras per butik/enhet när en är valt. */
export function useStockTransformations(storeId?: string | null) {
  return useQuery({
    queryKey: ["stock_transformations", storeId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("stock_transformations")
        .select(
          "*, source:products!stock_transformations_source_product_id_fkey(name, sku, unit), target:products!stock_transformations_target_product_id_fkey(name, sku, unit), storage_locations(name), source_lot:lots!stock_transformations_source_lot_id_fkey(lot_number), target_lot:lots!stock_transformations_target_lot_id_fkey(lot_number)",
        )
        .order("performed_at", { ascending: false })
        .limit(300);
      if (storeId) q = q.eq("store_id", storeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as TransformationRow[];
    },
  });
}

/** Utför en omvandling och uppdaterar lagersaldon i vyerna. */
export function usePerformTransformation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TransformInput) => performTransformation(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["product_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
      qc.invalidateQueries({ queryKey: ["stock_transformations"] });
      qc.invalidateQueries({ queryKey: ["lots"] });
    },
  });
}
