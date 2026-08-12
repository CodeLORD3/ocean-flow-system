import { supabase } from "@/integrations/supabase/client";

/**
 * Priskälla för marginal- och utprisberäkningar.
 * - `day_price`: produktens dagspris (viktat snitt av aktiva partier).
 * - `cost_price`: manuellt "Reservpris" på produkten, används bara när dagspris saknas.
 */
export type CostSource = "day_price" | "cost_price";

export interface EffectiveCost {
  /** Gällande pris per enhet som all prissättning utgår från. */
  value: number;
  source: CostSource;
  /** Antal aktiva partier bakom dagspriset (0 när reservpris används). */
  lots: number;
}

export const COST_SOURCE_LABEL: Record<CostSource, string> = {
  day_price: "Dagspris",
  cost_price: "Reservpris",
};

/**
 * Dagspriset gäller när produkten har aktivt dagspris (fler än 0 aktiva partier).
 * Annars faller vi tillbaka på det manuella reservpriset (`cost_price`).
 */
export function effectiveCost(p: any): EffectiveCost {
  const dayPrice = Number(p?.day_price ?? 0);
  const lots = Number(p?.day_price_lots ?? 0);
  if (dayPrice > 0 && lots > 0) {
    return { value: dayPrice, source: "day_price", lots };
  }
  return { value: Number(p?.cost_price ?? 0), source: "cost_price", lots: 0 };
}

export function effectiveCostLabel(p: any): string {
  return COST_SOURCE_LABEL[effectiveCost(p).source];
}

/**
 * Hämtar gällande pris för ett antal produkter — används när orderrader skapas,
 * så att priset kan låsas på raden vid ordertillfället.
 */
export async function fetchEffectiveCosts(
  productIds: (string | null | undefined)[],
): Promise<Map<string, EffectiveCost>> {
  const ids = Array.from(new Set(productIds.filter(Boolean) as string[]));
  const map = new Map<string, EffectiveCost>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase
    .from("products")
    .select("id, cost_price, day_price, day_price_lots")
    .in("id", ids);
  if (error) return map;
  for (const row of (data ?? []) as any[]) {
    map.set(row.id, effectiveCost(row));
  }
  return map;
}
