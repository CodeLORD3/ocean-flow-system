import { addDays, format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

/**
 * Inköpsdagen för en butiksbeställning.
 *
 * Varje beställd rad blir ett inköpsbehov hos inköp. Hela varor som är färdiga
 * för direkt försäljning (till exempel färska räkor) köps samma dag som de ska
 * levereras. Skaldjur och fisk som kokas eller filéas måste köpas dagen innan,
 * eftersom beredningen sker dagen före leverans (till exempel havskräftor till
 * onsdag som köps på tisdag).
 *
 * Antalet dagar styrs per vara av products.purchase_lead_days. Saknas fältet i
 * urvalet används varans "kräver hantering" som fallback.
 */
export type PurchaseLeadProduct = {
  purchase_lead_days?: number | null;
  requires_processing?: boolean | null;
} | null | undefined;

export function purchaseLeadDays(product: PurchaseLeadProduct | number | null | undefined): number {
  if (typeof product === "number") return Math.max(0, Math.round(product));
  if (product?.purchase_lead_days != null) return Math.max(0, Math.round(Number(product.purchase_lead_days)));
  return product?.requires_processing ? 1 : 0;
}

/** Inköpsdatum (yyyy-MM-dd) för en leveransdag och en vara. */
export function purchaseDateFor(
  deliveryDate: string | Date | null | undefined,
  product: PurchaseLeadProduct | number | null | undefined,
): string | null {
  if (!deliveryDate) return null;
  const base = typeof deliveryDate === "string" ? parseISO(deliveryDate) : deliveryDate;
  if (Number.isNaN(base.getTime())) return null;
  return format(addDays(base, -purchaseLeadDays(product)), "yyyy-MM-dd");
}

/** Kort förklaring till varför varan köps tidigare, eller null när den köps samma dag. */
export function purchaseLeadLabel(days: number): string | null {
  if (days <= 0) return null;
  if (days === 1) return "Köps dagen innan (kokas/filéas)";
  return `Köps ${days} dagar innan`;
}

/** Hämtar inköpsdagar per vara för de varor som ska beställas. */
export async function fetchPurchaseLeadDays(productIds: string[]): Promise<Map<string, number>> {
  const ids = Array.from(new Set(productIds.filter(Boolean)));
  const map = new Map<string, number>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase
    .from("products")
    .select("id, purchase_lead_days, requires_processing")
    .in("id", ids);
  if (error) return map;
  for (const row of data || []) map.set((row as any).id, purchaseLeadDays(row as any));
  return map;
}
