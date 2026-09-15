import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PricingStage = "inkop_till_gross" | "gross_till_butik";
export type PricingMethod = "margin_pct" | "markup_pct" | "fixed_price";
export type PricingRounding = "ingen" | "krona" | "krona_5" | "nittio";

export interface PricingRule {
  id: string;
  stage: PricingStage;
  scope_type: "global" | "category" | "product";
  category: string | null;
  product_id: string | null;
  store_id: string | null;
  method: PricingMethod;
  value: number;
  rounding: PricingRounding;
  yield_pct: number | null;
  labour_per_unit: number;
  vat_rate: number;
  active: boolean;
  valid_from: string;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export const STAGE_LABEL: Record<PricingStage, string> = {
  inkop_till_gross: "Inköp → Grossist",
  gross_till_butik: "Grossist → Butik",
};

export const METHOD_LABEL: Record<PricingMethod, string> = {
  margin_pct: "Marginal %",
  markup_pct: "Påslag %",
  fixed_price: "Fast pris",
};

export const ROUNDING_LABEL: Record<PricingRounding, string> = {
  ingen: "Ingen (öre)",
  krona: "Hel krona",
  krona_5: "Närmaste 5 kr",
  nittio: ",90-slut",
};

export function roundPrice(value: number, rounding: PricingRounding): number {
  if (!isFinite(value)) return 0;
  switch (rounding) {
    case "ingen":
      return Math.round(value * 100) / 100;
    case "krona":
      return Math.ceil(value);
    case "krona_5":
      return Math.ceil(value / 5) * 5;
    case "nittio":
      return Math.max(Math.floor(value) - 1, 0) + 0.9;
    default:
      return Math.round(value * 100) / 100;
  }
}

/** Applicerar en regel på ett basvärde: utbyte → arbetskostnad → marginal/påslag → avrundning. */
export function applyRule(base: number | null, rule: PricingRule | undefined): number | null {
  if (!rule) return null;
  if (rule.method === "fixed_price") return roundPrice(Number(rule.value), rule.rounding);
  if (base === null || !isFinite(base)) return null;

  let adjusted = base;
  if (rule.yield_pct && rule.yield_pct > 0) adjusted = adjusted / (rule.yield_pct / 100);
  adjusted += Number(rule.labour_per_unit || 0);

  if (rule.method === "margin_pct") {
    if (Number(rule.value) >= 100) return null;
    return roundPrice(adjusted / (1 - Number(rule.value) / 100), rule.rounding);
  }
  return roundPrice(adjusted * (1 + Number(rule.value) / 100), rule.rounding);
}

/** Väljer regel: produkt+butik → produkt → kategori+butik → kategori → butik → global. */
export function pickRule(
  rules: PricingRule[],
  stage: PricingStage,
  productId: string,
  category: string | null,
  storeId: string | null,
): PricingRule | undefined {
  const candidates = rules.filter(
    (r) =>
      r.active &&
      r.stage === stage &&
      (r.store_id === null || r.store_id === storeId) &&
      ((r.scope_type === "product" && r.product_id === productId) ||
        (r.scope_type === "category" && r.category === category) ||
        r.scope_type === "global"),
  );
  const scopeRank = (r: PricingRule) => (r.scope_type === "product" ? 0 : r.scope_type === "category" ? 1 : 2);
  candidates.sort((a, b) => {
    if (scopeRank(a) !== scopeRank(b)) return scopeRank(a) - scopeRank(b);
    const aStore = a.store_id ? 0 : 1;
    const bStore = b.store_id ? 0 : 1;
    if (aStore !== bStore) return aStore - bStore;
    return b.valid_from.localeCompare(a.valid_from);
  });
  return candidates[0];
}

export function usePricingRules() {
  return useQuery({
    queryKey: ["pricing_rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricing_rules")
        .select("*")
        .order("stage")
        .order("scope_type")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data || []) as PricingRule[];
    },
  });
}

export function useSavePricingRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rule: Partial<PricingRule> & { stage: PricingStage }) => {
      if (rule.id) {
        const { id, created_at, updated_at, ...rest } = rule as any;
        const { error } = await supabase.from("pricing_rules").update(rest).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase.from("pricing_rules").insert(rule as any).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pricing_rules"] }),
  });
}

export function useDeletePricingRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pricing_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pricing_rules"] }),
  });
}
