import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  performTransformation,
  performTransformationBatch,
  type TransformBatchInput,
  type TransformInput,
} from "@/lib/stockTransform";

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

/** Utför en omvandling med ett eller flera utfall (t.ex. burkar + lösvara). */
export function usePerformTransformationBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TransformBatchInput) => performTransformationBatch(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["product_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
      qc.invalidateQueries({ queryKey: ["stock_transformations"] });
      qc.invalidateQueries({ queryKey: ["lots"] });
    },
  });
}

export interface TransformPreset {
  id: string;
  source_product_id: string;
  target_product_id: string | null;
  label: string;
  pack_size: number | null;
  transform_kind: string;
  use_count: number;
  target: { id: string; name: string; sku: string; unit: string } | null;
}

/** Snabbval (vanliga omvandlingar) för en produkt, mest använda först. */
export function useTransformPresets(sourceProductId?: string | null) {
  return useQuery({
    queryKey: ["transformation_presets", sourceProductId ?? "none"],
    enabled: !!sourceProductId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transformation_presets")
        .select("*, target:products!transformation_presets_target_product_id_fkey(id, name, sku, unit)")
        .eq("source_product_id", sourceProductId!)
        .order("use_count", { ascending: false })
        .order("created_at");
      if (error) throw error;
      return (data || []) as unknown as TransformPreset[];
    },
  });
}

/** Sparar en omvandling som snabbval, eller räknar upp ett befintligt. */
export function useSaveTransformPreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      sourceProductId: string;
      targetProductId: string;
      label: string;
      packSize?: number | null;
      transformKind: string;
      storeId?: string | null;
    }) => {
      const { data: existing } = await supabase
        .from("transformation_presets")
        .select("id, use_count")
        .eq("source_product_id", input.sourceProductId)
        .eq("target_product_id", input.targetProductId)
        .maybeSingle();
      if (existing) {
        const { error } = await supabase
          .from("transformation_presets")
          .update({ use_count: (Number((existing as any).use_count) || 0) + 1, label: input.label })
          .eq("id", (existing as any).id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("transformation_presets").insert({
        source_product_id: input.sourceProductId,
        target_product_id: input.targetProductId,
        label: input.label,
        pack_size: input.packSize ?? null,
        transform_kind: input.transformKind,
        store_id: input.storeId ?? null,
        use_count: 1,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transformation_presets"] }),
  });
}

/** Tar bort ett snabbval. */
export function useDeleteTransformPreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("transformation_presets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transformation_presets"] }),
  });
}
