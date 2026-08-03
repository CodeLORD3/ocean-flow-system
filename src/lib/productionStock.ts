import { recordMovement, currentBalance } from "@/lib/stockLedger";
import { GROSSIST_FLYTANDE_ID } from "@/lib/locations";

/** Grossist Flytande — lagerplatsen där råvara och tillverkade detaljer ligger. */
export { GROSSIST_FLYTANDE_ID };

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
