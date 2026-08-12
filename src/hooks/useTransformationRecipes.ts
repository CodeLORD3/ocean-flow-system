import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Omvandlingsregistret: en råvaru-SKU blir en färdigvaru-SKU (i första hand
 * kokning av skaldjur) med ett utbyte i procent och ett förädlingspåslag.
 */
export interface TransformationRecipe {
  id: string;
  raw_product_id: string;
  output_product_id: string;
  yield_pct: number;
  transform_type: string;
  surcharge_per_kg: number;
  active: boolean;
  notes: string | null;
  raw?: { id: string; sku: string; name: string } | null;
  output?: { id: string; sku: string; name: string; shelf_life_days: number | null } | null;
}

export const TRANSFORM_TYPES = [{ value: "kokning", label: "Kokning" }];

export function useTransformationRecipes() {
  return useQuery({
    queryKey: ["transformation_recipes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transformation_recipes")
        .select(
          "*, raw:products!transformation_recipes_raw_product_id_fkey(id, sku, name), output:products!transformation_recipes_output_product_id_fkey(id, sku, name, shelf_life_days)",
        )
        .order("created_at");
      if (error) throw error;
      return (data || []) as unknown as TransformationRecipe[];
    },
  });
}

export function useUpsertTransformationRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<TransformationRecipe> & { raw_product_id: string; output_product_id: string }) => {
      const payload = {
        id: row.id,
        raw_product_id: row.raw_product_id,
        output_product_id: row.output_product_id,
        yield_pct: Number(row.yield_pct) || 90,
        transform_type: row.transform_type || "kokning",
        surcharge_per_kg: Number(row.surcharge_per_kg ?? 35),
        active: row.active ?? true,
        notes: row.notes ?? null,
      };
      if (!payload.id) delete (payload as any).id;
      const { error } = await supabase
        .from("transformation_recipes")
        .upsert(payload as any, { onConflict: "raw_product_id,output_product_id,transform_type" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transformation_recipes"] }),
  });
}

export function useDeleteTransformationRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("transformation_recipes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transformation_recipes"] }),
  });
}
