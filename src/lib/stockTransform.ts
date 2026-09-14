import { supabase } from "@/integrations/supabase/client";
import { currentStaffId, lotBalancesAtLocation, recordMovement } from "@/lib/stockLedger";
import { createOutputLot, recordLotTransformation } from "@/lib/lotTransformation";

/**
 * Omvandling i lagret: ett parti av en produkt konsumeras och ett parti av en
 * annan produkt skapas på samma lagerplats. Tre varianter — dela upp i bitar,
 * packa om i annan förpackning och bearbeta (t.ex. koka) — gör i grunden samma
 * sak, men sparas med olika typ så historiken går att läsa.
 *
 * Allt bokförs via stock_movements (enda skrivvägen till saldon) och
 * lot_transformations, så spårbarheten från källpartiet följer med.
 */

export type TransformKind = "dela_upp" | "packa_om" | "bearbeta" | "filetera" | "producera" | "annan";

export const TRANSFORM_KINDS: { value: TransformKind; label: string; hint: string }[] = [
  { value: "packa_om", label: "Packa om", hint: "10 kg-hink → 200 g-burkar" },
  { value: "dela_upp", label: "Dela / portionera", hint: "Hel sida → bitar" },
  { value: "filetera", label: "Filetera", hint: "Hel fisk → filéer" },
  { value: "producera", label: "Producera", hint: "Råvara → tillagad produkt" },
  { value: "bearbeta", label: "Bearbeta", hint: "Rå vara → kokt vara" },
  { value: "annan", label: "Annan omvandling", hint: "Fritt utfall" },
];

/**
 * Vanligaste omvandlingen för en produkt, så personalen slipper välja.
 * Gissningen bygger på produktnamn och kategori — den går alltid att ändra.
 */
export function suggestTransformKind(name?: string | null, category?: string | null): TransformKind {
  const t = `${name ?? ""} ${category ?? ""}`.toLowerCase();
  if (/(hink|kartong|låda|lada|spann|10 ?kg|5 ?kg|bulk|lösvikt|losvikt)/.test(t)) return "packa_om";
  if (/(sida|rökt|rokt|gravad|filé|file|block)/.test(t)) return "dela_upp";
  if (/(hel |helfisk|rensad|orensad|hel$)/.test(t)) return "filetera";
  if (/(rå|ra |levande|färsk fisk|fardig)/.test(t)) return "producera";
  return "packa_om";
}

export const transformKindLabel = (v?: string | null) =>
  TRANSFORM_KINDS.find((k) => k.value === v)?.label ?? "Omvandling";

export interface TransformInput {
  storeId?: string | null;
  locationId: string;
  sourceProductId: string;
  sourceProductName?: string | null;
  sourceLotId: string | null;
  /** Mängd som omvandlas (exkl. svinn). */
  sourceQuantity: number;
  sourceUnitCost?: number | null;
  targetProductId: string;
  targetProductName?: string | null;
  /** Total mängd av målprodukten som skapas. */
  targetQuantity: number;
  targetPackages?: number | null;
  /** Bäst före på det nya partiet. */
  targetBestBefore?: string | null;
  kind: TransformKind;
  /** Spill under omvandlingen, dras utöver den omvandlade mängden. */
  wasteQuantity?: number;
  wasteReason?: string | null;
  /** Tidpunkt (ISO) — visas i historiken. */
  performedAt?: string | null;
  performedByName?: string | null;
  note?: string | null;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export interface TransformResult {
  yieldPct: number;
  targetLotId: string | null;
  historyId: string | null;
}

export async function performTransformation(input: TransformInput): Promise<TransformResult> {
  const amount = round3(Math.abs(Number(input.sourceQuantity) || 0));
  const output = round3(Math.abs(Number(input.targetQuantity) || 0));
  const waste = round3(Math.abs(Number(input.wasteQuantity) || 0));

  if (!input.locationId) throw new Error("Välj lagerplats.");
  if (!input.sourceProductId || !input.targetProductId) throw new Error("Välj källprodukt och målprodukt.");
  if (amount <= 0) throw new Error("Ange mängd att omvandla.");
  if (output <= 0) throw new Error("Ange hur mycket som skapas.");

  // Kontrollera att partiet räcker till mängd + svinn.
  const balances = await lotBalancesAtLocation(input.sourceProductId, input.locationId);
  const available = input.sourceLotId
    ? balances.find((b) => b.lotId === input.sourceLotId)?.quantityKg ?? 0
    : balances.reduce((s, b) => s + b.quantityKg, 0);
  if (available + 0.001 < amount + waste) {
    throw new Error(
      `Otillräckligt saldo: ${available.toLocaleString("sv-SE")} tillgängligt, ${(amount + waste).toLocaleString("sv-SE")} behövs.`,
    );
  }

  const sourceCost = Number(input.sourceUnitCost) || 0;
  const targetCost = output > 0 ? round3(((amount + waste) * sourceCost) / output) : 0;
  const kindLabel = transformKindLabel(input.kind);
  const label = `${kindLabel}: ${input.sourceProductName || "källa"} → ${input.targetProductName || "mål"}`;

  // 1. Råvaran ut.
  await recordMovement({
    productId: input.sourceProductId,
    locationId: input.locationId,
    quantityKg: amount,
    movementType: "tillverkning_ut",
    lotId: input.sourceLotId,
    unitCost: sourceCost || null,
    referenceType: "omvandling",
    note: label,
  });

  // 2. Eventuellt spill som svinn — separat från utbytet.
  if (waste > 0) {
    await recordMovement({
      productId: input.sourceProductId,
      locationId: input.locationId,
      quantityKg: waste,
      movementType: "svinn",
      lotId: input.sourceLotId,
      unitCost: sourceCost || null,
      referenceType: "omvandling",
      note: `Svinn vid omvandling${input.wasteReason ? `: ${input.wasteReason}` : ""}`,
    });
  }

  // 3. Nytt parti för målprodukten — ärver härkomsten från källpartiet.
  const targetLotId = await createOutputLot(
    input.sourceLotId,
    {
      productId: input.targetProductId,
      quantityKg: output,
      unitCost: targetCost || null,
      detailName: input.targetProductName || null,
      bestBefore: input.targetBestBefore ?? null,
      lotCode: "OMV",
    },
    "omvandling",
  );

  // 4. Färdigvaran in.
  await recordMovement({
    productId: input.targetProductId,
    locationId: input.locationId,
    quantityKg: output,
    movementType: "tillverkning_in",
    lotId: targetLotId,
    unitCost: targetCost || null,
    referenceType: "omvandling",
    note: label,
  });

  // 5. Spårbarhetslänken källparti → nytt parti.
  if (input.sourceLotId && targetLotId) {
    await recordLotTransformation({
      fromLotId: input.sourceLotId,
      toLotId: targetLotId,
      quantityInKg: amount,
      quantityOutKg: output,
    });
  }

  const yieldPct = amount > 0 ? Math.round((output / amount) * 1000) / 10 : 0;

  const staffId = await currentStaffId();
  const { data, error } = await supabase
    .from("stock_transformations")
    .insert({
      store_id: input.storeId ?? null,
      location_id: input.locationId,
      transform_kind: input.kind,
      source_product_id: input.sourceProductId,
      source_lot_id: input.sourceLotId,
      source_quantity: amount,
      target_product_id: input.targetProductId,
      target_lot_id: targetLotId,
      target_quantity: output,
      target_packages: input.targetPackages ?? null,
      yield_pct: yieldPct,
      waste_quantity: waste,
      waste_reason: input.wasteReason?.trim() || null,
      note: input.note?.trim() || null,
      performed_at: input.performedAt || new Date().toISOString(),
      performed_by: staffId,
      performed_by_name: input.performedByName?.trim() || null,
    } as any)
    .select("id")
    .maybeSingle();
  if (error) throw error;

  return { yieldPct, targetLotId, historyId: (data as any)?.id ?? null };
}
