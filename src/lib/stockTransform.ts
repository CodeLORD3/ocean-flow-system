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

/** Ett utfall i en omvandling: en målprodukt med mängd och ev. antal förpackningar. */
export interface TransformOutput {
  productId: string;
  productName?: string | null;
  /** Total mängd av målprodukten (samma enhet som lagret räknar i, dvs kg). */
  quantity: number;
  packages?: number | null;
  packSize?: number | null;
  bestBefore?: string | null;
}

export interface TransformBatchInput {
  storeId?: string | null;
  locationId: string;
  sourceProductId: string;
  sourceProductName?: string | null;
  sourceLotId: string | null;
  /** Mängd som tas ur källan (utfall + svinn + ev. lösvara). */
  sourceQuantity: number;
  sourceUnitCost?: number | null;
  kind: TransformKind;
  outputs: TransformOutput[];
  wasteQuantity?: number;
  wasteReason?: string | null;
  performedAt?: string | null;
  performedByName?: string | null;
  note?: string | null;
}

export interface TransformBatchResult {
  sourceQuantity: number;
  outputQuantity: number;
  yieldPct: number;
  targetLotIds: string[];
}

/**
 * Omvandling med flera utfall: källan tas ut en gång och varje utfall får ett
 * eget parti, en egen inleverans och en egen spårbarhetslänk tillbaka till
 * källpartiet. Personalen behöver därför aldrig göra manuella justeringar —
 * massbalansen (källa = utfall + svinn) sköts av flödet.
 */
export async function performTransformationBatch(
  input: TransformBatchInput,
): Promise<TransformBatchResult> {
  const amount = round3(Math.abs(Number(input.sourceQuantity) || 0));
  const waste = round3(Math.abs(Number(input.wasteQuantity) || 0));
  const outputs = (input.outputs || [])
    .map((o) => ({ ...o, quantity: round3(Math.abs(Number(o.quantity) || 0)) }))
    .filter((o) => o.productId && o.quantity > 0);

  if (!input.locationId) throw new Error("Välj lagerplats.");
  if (!input.sourceProductId) throw new Error("Välj produkt att omvandla.");
  if (amount <= 0) throw new Error("Ange mängd att omvandla.");
  if (!outputs.length && waste <= 0) throw new Error("Ange vad omvandlingen gav.");

  const balances = await lotBalancesAtLocation(input.sourceProductId, input.locationId);
  const available = input.sourceLotId
    ? balances.find((b) => b.lotId === input.sourceLotId)?.quantityKg ?? 0
    : balances.reduce((s, b) => s + b.quantityKg, 0);
  if (available + 0.001 < amount) {
    throw new Error(
      `Otillräckligt saldo: ${available.toLocaleString("sv-SE")} tillgängligt, ${amount.toLocaleString("sv-SE")} behövs.`,
    );
  }

  const sourceCost = Number(input.sourceUnitCost) || 0;
  const outTotal = round3(outputs.reduce((s, o) => s + o.quantity, 0));
  const kindLabel = transformKindLabel(input.kind);
  const label = `${kindLabel}: ${input.sourceProductName || "källa"}`;
  const performedAt = input.performedAt || new Date().toISOString();
  const staffId = await currentStaffId();

  // 1. Källan ut — hela den förbrukade mängden i en rörelse.
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

  // 2. Svinn bokförs separat så det syns i svinnrapporten.
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

  const targetLotIds: string[] = [];
  for (const [i, out] of outputs.entries()) {
    const unitCost = out.quantity > 0 ? round3((amount * sourceCost) / Math.max(outTotal, 0.001)) : 0;
    const lotId = await createOutputLot(
      input.sourceLotId,
      {
        productId: out.productId,
        quantityKg: out.quantity,
        unitCost: unitCost || null,
        detailName: out.productName || null,
        bestBefore: out.bestBefore ?? null,
        lotCode: "OMV",
      },
      "omvandling",
      i + 1,
    );
    if (lotId) targetLotIds.push(lotId);

    await recordMovement({
      productId: out.productId,
      locationId: input.locationId,
      quantityKg: out.quantity,
      movementType: "tillverkning_in",
      lotId,
      unitCost: unitCost || null,
      referenceType: "omvandling",
      note: `${label} → ${out.productName || "utfall"}`,
    });

    if (input.sourceLotId && lotId) {
      await recordLotTransformation({
        fromLotId: input.sourceLotId,
        toLotId: lotId,
        quantityInKg: amount,
        quantityOutKg: out.quantity,
      });
    }

    const { error } = await supabase.from("stock_transformations").insert({
      store_id: input.storeId ?? null,
      location_id: input.locationId,
      transform_kind: input.kind,
      source_product_id: input.sourceProductId,
      source_lot_id: input.sourceLotId,
      // Källmängden fördelas per utfall så historiken summerar rätt.
      source_quantity: round3((amount * out.quantity) / Math.max(outTotal, 0.001)),
      target_product_id: out.productId,
      target_lot_id: lotId,
      target_quantity: out.quantity,
      target_packages: out.packages ?? null,
      yield_pct: amount > 0 ? Math.round((outTotal / amount) * 1000) / 10 : 0,
      waste_quantity: i === 0 ? waste : 0,
      waste_reason: i === 0 ? input.wasteReason?.trim() || null : null,
      note: input.note?.trim() || null,
      performed_at: performedAt,
      performed_by: staffId,
      performed_by_name: input.performedByName?.trim() || null,
    } as any);
    if (error) throw error;
  }

  // Bara svinn (inget utfall) loggas ändå som en rad i historiken.
  if (!outputs.length && waste > 0) {
    const { error } = await supabase.from("stock_transformations").insert({
      store_id: input.storeId ?? null,
      location_id: input.locationId,
      transform_kind: input.kind,
      source_product_id: input.sourceProductId,
      source_lot_id: input.sourceLotId,
      source_quantity: amount,
      target_product_id: input.sourceProductId,
      target_quantity: 0,
      yield_pct: 0,
      waste_quantity: waste,
      waste_reason: input.wasteReason?.trim() || null,
      performed_at: performedAt,
      performed_by: staffId,
      performed_by_name: input.performedByName?.trim() || null,
    } as any);
    if (error) throw error;
  }

  return {
    sourceQuantity: amount,
    outputQuantity: outTotal,
    yieldPct: amount > 0 ? Math.round((outTotal / amount) * 1000) / 10 : 0,
    targetLotIds,
  };
}
