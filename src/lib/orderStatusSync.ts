import { supabase } from "@/integrations/supabase/client";
import { activeLocationsForLevel } from "@/lib/locations";

const GROSSIST_FLYTANDE_ID = "5da57ad6-f72c-4a84-9873-87174d194e10";

/**
 * Legacy function — no longer auto-promotes to Pågående.
 * Kept for API compatibility.
 */
export async function markOrderLinesBehandlas(_productIds: string[]) {
  // No-op: status stays as "Ny" until manually changed
}

/**
 * Legacy function — no longer auto-promotes to Pågående from Grossist Flytande stock.
 * Kept for API compatibility.
 */
export async function syncBehandlasFromStock() {
  // No-op: statuses stay as "Ny" until manually changed
}

/**
 * Packningsstatus styrs manuellt i det förenklade flödet: lagret rör sig först
 * när ordern sätts till "Skickad". Funktionerna finns kvar som no-op så
 * anropande kod inte behöver ändras.
 */
export async function revertOrderLinesIfStockGone() {
  // No-op: status sätts av personalen, inte av saldot.
}

export async function markOrderLinesPackad(_productIds: string[], _targetLocationId: string) {
  // No-op: status sätts av personalen, inte av saldot.
}
