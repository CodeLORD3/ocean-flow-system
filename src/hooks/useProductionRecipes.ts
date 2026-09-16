import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Produktionsrecepten: hur vi tillagar och producerar våra egna produkter,
 * t.ex. fiskgratäng, vitfiskbiffar, fisksoppa och kokning av skaldjur.
 * Varje recept kan kopplas till en produkt i produktregistret.
 */
export interface RecipeIngredient {
  name: string;
  amount: string;
  note?: string;
}

export interface RecipeStep {
  text: string;
  image?: string;
}

export interface ProductionRecipe {
  id: string;
  name: string;
  product_id: string | null;
  category: string;
  batch_yield: string | null;
  prep_minutes: number | null;
  temperature: string | null;
  shelf_life_days: number | null;
  allergens: string | null;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  tips: string | null;
  image_url: string | null;
  active: boolean;
  updated_at: string;
  product?: { id: string; sku: string; name: string; unit: string | null } | null;
}

/** Grupperna vi samlar produktionen i. Fritext är tillåtet vid behov. */
export const RECIPE_CATEGORIES = [
  "Varmrätter",
  "Biffar & färs",
  "Soppor & såser",
  "Kokning skaldjur",
  "Sallader & röror",
  "Rökt & gravat",
  "Övrigt",
];

const parseList = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function fromRow(r: any): ProductionRecipe {
  return {
    ...r,
    ingredients: parseList<RecipeIngredient>(r.ingredients),
    steps: parseList<RecipeStep>(r.steps),
  } as ProductionRecipe;
}

export function useProductionRecipes() {
  return useQuery({
    queryKey: ["production_recipes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_recipes")
        .select("*, product:products(id, sku, name, unit)")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data || []).map(fromRow);
    },
  });
}

/** Recepten för en enskild produkt — används från produktregistret. */
export function useProductRecipes(productId?: string | null) {
  return useQuery({
    queryKey: ["production_recipes", "product", productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_recipes")
        .select("*, product:products(id, sku, name, unit)")
        .eq("product_id", productId!)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data || []).map(fromRow);
    },
  });
}

export function useSaveProductionRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<ProductionRecipe> & { name: string }) => {
      const payload: Record<string, unknown> = {
        name: row.name.trim(),
        product_id: row.product_id || null,
        category: row.category || "Övrigt",
        batch_yield: row.batch_yield || null,
        prep_minutes: row.prep_minutes ?? null,
        temperature: row.temperature || null,
        shelf_life_days: row.shelf_life_days ?? null,
        allergens: row.allergens || null,
        ingredients: (row.ingredients ?? []).filter((i) => i.name.trim()),
        steps: (row.steps ?? []).filter((s) => s.text.trim() || s.image),
        tips: row.tips || null,
        image_url: row.image_url || null,
      };
      if (row.id) {
        const { error } = await supabase.from("production_recipes").update(payload as any).eq("id", row.id);
        if (error) throw error;
        return row.id;
      }
      const { data, error } = await supabase
        .from("production_recipes")
        .insert(payload as any)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["production_recipes"] }),
  });
}

export function useDeleteProductionRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("production_recipes").update({ active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["production_recipes"] }),
  });
}
