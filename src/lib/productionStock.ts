import { recordMovement, currentBalance, lotBalancesAtLocation } from "@/lib/stockLedger";
import { GROSSIST_FLYTANDE_ID } from "@/lib/locations";

/** Grossist Flytande — lagerplatsen där råvara och tillverkade detaljer ligger. */
export { GROSSIST_FLYTANDE_ID };

/**
 * Drar av kvantitet ur ett specifikt parti. Saldot läses ur rörelseloggen för
 * partiet — inte ur den aggregerade saldotabellen, som kan ligga efter och då
 * tysta ner uttaget till noll.
 */
export async function withdrawLot(
  productId: string,
  lotId: string,
  quantity: number,
  locationId = GROSSIST_FLYTANDE_ID,
  opts?: { unitCost?: number | null; referenceType?: string | null; referenceId?: string | null; note?: string | null },
) {
  const want = Math.abs(Number(quantity) || 0);
  if (!want) return 0;
  const balances = await lotBalancesAtLocation(productId, locationId);
  const available = balances.find((b) => b.lotId === lotId)?.quantityKg ?? 0;
  const take = Math.round(Math.min(want, Math.max(0, available)) * 1000) / 1000;
  if (take <= 0) throw new Error("Partiet har inget saldo kvar på lagerplatsen");
  await recordMovement({
    productId,
    locationId,
    quantityKg: take,
    movementType: "tillverkning_ut",
    unitCost: opts?.unitCost ?? null,
    lotId,
    referenceType: opts?.referenceType ?? "production",
    referenceId: opts?.referenceId ?? null,
    note: opts?.note ?? null,
  });
  return take;
}


/**
 * Lägger till kvantitet på en lagerplats via lagerrörelseloggen.
 * Snittkostpriset räknas om av databastriggern.
 */
export async function addStock(
  productId: string,
  quantity: number,
  unitCost: number,
  locationId = GROSSIST_FLYTANDE_ID,
  opts?: { lotId?: string | null; referenceType?: string | null; referenceId?: string | null; note?: string | null },
) {
  if (!quantity) return;
  await recordMovement({
    productId,
    locationId,
    quantityKg: Math.abs(quantity),
    movementType: "tillverkning_in",
    unitCost: unitCost || null,
    lotId: opts?.lotId ?? null,
    referenceType: opts?.referenceType ?? "production",
    referenceId: opts?.referenceId ?? null,
    note: opts?.note ?? null,
  });
}

/** Drar av kvantitet från en lagerplats (aldrig under noll) via rörelseloggen. */
export async function withdrawStock(
  productId: string,
  quantity: number,
  locationId = GROSSIST_FLYTANDE_ID,
  opts?: { lotId?: string | null; referenceType?: string | null; referenceId?: string | null; note?: string | null },
) {
  if (!quantity) return;
  const { quantity: available, avgCost } = await currentBalance(productId, locationId);
  const take = Math.min(Math.abs(quantity), Math.max(0, available));
  if (take <= 0) return;
  await recordMovement({
    productId,
    locationId,
    quantityKg: take,
    movementType: "tillverkning_ut",
    unitCost: avgCost || null,
    lotId: opts?.lotId ?? null,
    referenceType: opts?.referenceType ?? "production",
    referenceId: opts?.referenceId ?? null,
    note: opts?.note ?? null,
  });
}
