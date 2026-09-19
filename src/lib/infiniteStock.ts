import { supabase } from "@/integrations/supabase/client";

/**
 * Uppstartsläge: lagret behandlas som obegränsat (∞) så att orderflödet
 * — packa, skicka, ta emot — kan köras innan riktiga saldon är inlästa.
 * Styrs av system_settings-nyckeln `infinite_stock` ({ enabled: boolean }).
 * Saknas raden är läget AV: riktiga saldon gäller, annars skulle lagret tyst
 * fyllas på med justeringar utan underlag.
 */
export const INFINITE_STOCK_KEY = "infinite_stock";

let cached: boolean | undefined;

export async function isInfiniteStock(): Promise<boolean> {
  if (cached !== undefined) return cached;
  const { data } = await supabase
    .from("system_settings" as any)
    .select("value")
    .eq("key", INFINITE_STOCK_KEY)
    .maybeSingle();
  const enabled = (data as any)?.value?.enabled;
  cached = enabled === true;
  return cached;
}

/** Nollställer cachen (används när inställningen ändras). */
export function resetInfiniteStockCache() {
  cached = undefined;
}
