import { supabase } from "@/integrations/supabase/client";
import {
  GROSSIST_FLYTANDE_ID,
  grossistStoreId,
  tillverkningslagerId,
} from "@/lib/locations";
import {
  currentBalance,
  lotBalancesForReference,
  recordMovement,
  transferStock,
} from "@/lib/stockLedger";
import {
  createOutputLot,
  pickRawLots,
  recordLotTransformation,
  type RawPick,
} from "@/lib/lotTransformation";

/**
 * Externt tillverkningsuppdrag (uppgift 3).
 *
 * Råvaran skickas ut ur grossistlagret och ligger på TILLVERKNINGSLAGRET så
 * länge den är hos leverantören — den är kvar i vår ägo men inte fysiskt hos
 * oss. När returen registreras gäller tre regler:
 *
 *  1. Partiet överlever. Detaljpartier skapas per råvaruparti, med moderns
 *     partinummer i namnet, och ärver fångstområde, fartyg och fångstdatum.
 *     Kommer flera produkter tillbaka ur samma råvara ärver alla samma ursprung.
 *  2. Utbytet mäts, inte antas. Returnerad kvantitet ger faktiskt utbyte, som
 *     jämförs med standardutbytet i yields och sparas i yield_actuals.
 *  3. Arbetskostnaden räknas in i kostpriset:
 *       kostpris per kg = (råvarukostnad + arbetskostnad) / returnerad kvantitet
 */

const round3 = (v: number) => Math.round((Number(v) || 0) * 1000) / 1000;
const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

export interface ExternalPlannedLine {
  productId: string | null;
  detailName: string;
  detailForm: string;
  /** Planerat utbyte i procent av råvaran. */
  plannedPct: number;
}

export interface SendExternalParams {
  rawProductId: string;
  rawName: string;
  rawSku?: string | null;
  rawForm: string;
  speciesGroup?: string | null;
  quantityKg: number;
  supplierName: string;
  supplierId?: string | null;
  /** Förväntat returdatum — krävs av databasen för externa uppdrag. */
  expectedReturnDate: string;
  /** Avtalat pris per kilo för arbetet. */
  pricePerKg: number;
  purchasePricePerKg?: number | null;
  createdBy?: string | null;
  plannedLines: ExternalPlannedLine[];
}

/**
 * Skickar råvara på externt uppdrag. Partierna följer med: varje plockat parti
 * flyttas för sig, så returen kan knytas till rätt ursprung.
 */
export async function sendExternalAssignment(params: SendExternalParams) {
  const qty = round3(Math.abs(params.quantityKg));
  if (!qty) throw new Error("Ange kvantitet att skicka ut.");
  if (!params.supplierName.trim()) throw new Error("Externt uppdrag kräver leverantör.");
  if (!params.expectedReturnDate) throw new Error("Externt uppdrag kräver förväntat returdatum.");
  if (!(Number(params.pricePerKg) > 0))
    throw new Error("Externt uppdrag kräver avtalat pris per kilo för arbetet.");

  const storeId = await grossistStoreId();
  const externalLocationId = await tillverkningslagerId(storeId);

  const available = await currentBalance(params.rawProductId, GROSSIST_FLYTANDE_ID);
  if (available.quantity + 0.0001 < qty)
    throw new Error(
      `Grossistlagret har bara ${available.quantity.toLocaleString("sv-SE")} kg av ${params.rawName}.`,
    );

  const picks = await pickRawLots(params.rawProductId, GROSSIST_FLYTANDE_ID, qty);

  const { data: order, error } = await supabase
    .from("production_orders")
    .insert({
      production_date: new Date().toISOString().slice(0, 10),
      created_by: params.createdBy ?? null,
      species_group: params.speciesGroup ?? null,
      raw_product_id: params.rawProductId,
      raw_sku: params.rawSku ?? null,
      raw_name: params.rawName,
      raw_form: params.rawForm,
      raw_quantity: qty,
      purchase_price_per_kg: params.purchasePricePerKg ?? available.avgCost ?? null,
      order_type: "extern",
      external_supplier_id: params.supplierId ?? null,
      external_supplier_name: params.supplierName.trim(),
      expected_return_date: params.expectedReturnDate,
      external_price_per_kg: Number(params.pricePerKg),
      status: "utskickad",
    } as any)
    .select()
    .single();
  if (error) throw error;

  const lines = params.plannedLines.filter((l) => l.detailName.trim());
  if (lines.length) {
    const { error: lErr } = await supabase.from("production_order_lines").insert(
      lines.map((l, i) => ({
        order_id: (order as any).id,
        product_id: l.productId,
        detail_name: l.detailName,
        detail_form: l.detailForm,
        planned_pct: Number(l.plannedPct) || 0,
        planned_qty: round3((qty * (Number(l.plannedPct) || 0)) / 100),
        margin_weight: 1,
        is_processed: true,
        sort_order: i,
      })) as any,
    );
    if (lErr) throw lErr;
  }

  for (const p of picks) {
    await transferStock({
      productId: params.rawProductId,
      fromLocationId: GROSSIST_FLYTANDE_ID,
      toLocationId: externalLocationId,
      quantityKg: p.quantityKg,
      lotId: p.lotId,
      referenceType: "production_order",
      referenceId: (order as any).id,
      note: `Externt uppdrag — ${params.supplierName.trim()}`,
    });
  }

  return { order: order as any, picks };
}

export interface ReturnLineInput {
  /** Rad på ordern om returen matchar en planerad detalj. */
  lineId?: string | null;
  productId: string;
  detailName: string;
  detailForm: string;
  /** Faktiskt returnerad kvantitet, vägd av leverantören. */
  quantityKg: number;
  /**
   * Kostnadsvikt. 1 för alla rader ger exakt formeln i uppgiften:
   * kostpris/kg = (råvarukostnad + arbetskostnad) / returnerad kvantitet.
   * Lägre vikt används för biprodukter som inte ska bära full råvarukostnad.
   */
  costWeight?: number;
  bestBefore?: string | null;
}

export interface ExternalYieldRow {
  detailForm: string;
  detailName: string;
  quantityOut: number;
  actualPct: number;
  standardPct: number | null;
  deviationPct: number | null;
}

export interface ExternalReturnResult {
  rawQuantityKg: number;
  returnedKg: number;
  yieldPct: number;
  rawCost: number;
  labourCost: number;
  totalCost: number;
  costPerKg: Record<string, number>;
  lotNumbers: string[];
  yields: ExternalYieldRow[];
}

/**
 * Väljer standardutbytet ur en uppsättning yield-rader. Formerna i yields är
 * fritext ("filé utan skinn"), så matchningen tillåter delsträngar och samma
 * regel används i gränssnittet — annars visas en annan standard än den som
 * sparas i yield_actuals.
 */
export function matchStandardYield(
  rows: { species_group?: string | null; from_form?: string | null; to_form?: string | null; yield_pct: number | string }[],
  species: string | null | undefined,
  fromForm: string | null | undefined,
  toForm: string,
): number | null {
  if (!species) return null;
  const want = (toForm || "").trim().toLowerCase();
  if (!want) return null;
  const sp = species.toLowerCase();
  const candidates = rows.filter((r) => {
    if ((r.species_group ?? "").toLowerCase() !== sp) return false;
    const to = (r.to_form ?? "").trim().toLowerCase();
    return to === want || to.includes(want) || want.includes(to);
  });
  if (!candidates.length) return null;
  const from = (fromForm ?? "").trim().toLowerCase();
  const exact =
    candidates.find(
      (r) => (r.to_form ?? "").trim().toLowerCase() === want && (r.from_form ?? "").toLowerCase() === from,
    ) ?? candidates.find((r) => (r.from_form ?? "").toLowerCase() === from);
  const row = exact ?? candidates[0];
  return Number(row.yield_pct);
}

/** Standardutbytet ur yields för art och form (null om det saknas). */
async function standardYieldPct(
  species: string | null,
  fromForm: string | null,
  toForm: string,
): Promise<number | null> {
  if (!species) return null;
  const { data } = await supabase
    .from("yields")
    .select("species_group, yield_pct, from_form, to_form")
    .eq("species_group", species);
  return matchStandardYield((data ?? []) as any[], species, fromForm, toForm);
}



/**
 * Registrerar retur från externt uppdrag. Råvaran skrivs av från
 * tillverkningslagret parti för parti och detaljerna bokförs in i
 * grossistlagret med ärvd härkomst, mätt utbyte och arbetskostnaden inräknad.
 */
export async function registerExternalReturn(params: {
  orderId: string;
  lines: ReturnLineInput[];
  /** Övrig kostnad på uppdraget, t.ex. frakt (kr totalt). */
  extraCost?: number;
  note?: string | null;
}): Promise<ExternalReturnResult> {
  const lines = params.lines.filter((l) => l.productId && Math.abs(l.quantityKg) > 0);
  if (!lines.length) throw new Error("Ange minst en returnerad produkt med kvantitet.");

  const { data: orderRow, error: oErr } = await supabase
    .from("production_orders")
    .select("*")
    .eq("id", params.orderId)
    .maybeSingle();
  if (oErr) throw oErr;
  const order = orderRow as any;
  if (!order) throw new Error("Uppdraget hittades inte.");
  if (order.status === "completed") throw new Error("Uppdraget är redan returregistrerat.");
  if (!order.raw_product_id) throw new Error("Uppdraget saknar råvaruprodukt.");

  const storeId = await grossistStoreId();
  const externalLocationId = await tillverkningslagerId(storeId);

  // Råvaran som ligger ute på uppdraget, per parti.
  const byProduct = await lotBalancesForReference({
    locationId: externalLocationId,
    referenceType: "production_order",
    referenceId: params.orderId,
  });
  const rawEntry = byProduct.find((p) => p.productId === order.raw_product_id);
  const rawPicks: RawPick[] = (rawEntry?.lots ?? []).map((l) => ({
    lotId: l.lotId,
    quantityKg: l.quantityKg,
  }));
  if (!rawPicks.length)
    throw new Error(
      "Ingen råvara ligger kvar på tillverkningslagret för uppdraget — returen är redan registrerad eller råvaran flyttades bort.",
    );

  const rawQty = round3(rawPicks.reduce((s, p) => s + p.quantityKg, 0));
  const rawBalance = await currentBalance(order.raw_product_id, externalLocationId);
  const rawUnitCost = Number(rawBalance.avgCost) || Number(order.purchase_price_per_kg) || 0;

  // 3. Arbetskostnaden ska med: avtalat pris per kilo gäller den utskickade råvaran.
  const labourCost = round2(rawQty * (Number(order.external_price_per_kg) || 0));
  const rawCost = round2(rawQty * rawUnitCost);
  const totalCost = round2(rawCost + labourCost + (Number(params.extraCost) || 0));

  const returnedKg = round3(lines.reduce((s, l) => s + Math.abs(l.quantityKg), 0));
  if (!returnedKg) throw new Error("Returnerad kvantitet måste vara större än noll.");
  if (returnedKg > rawQty + 0.0001)
    throw new Error(
      `Returen (${returnedKg} kg) är större än den utskickade råvaran (${rawQty} kg).`,
    );

  const weightSum = lines.reduce(
    (s, l) => s + Math.abs(l.quantityKg) * (l.costWeight ?? 1),
    0,
  );
  const costPerKg: Record<string, number> = {};
  for (const l of lines) {
    const w = l.costWeight ?? 1;
    costPerKg[l.productId] = weightSum > 0 ? round2((totalCost * w) / weightSum) : 0;
  }

  // 1. Partiet överlever: ett detaljparti per råvaruparti och detalj.
  const lotNumbers: string[] = [];
  for (let pi = 0; pi < rawPicks.length; pi++) {
    const p = rawPicks[pi];
    const share = rawQty > 0 ? p.quantityKg / rawQty : 0;

    await recordMovement({
      productId: order.raw_product_id,
      locationId: externalLocationId,
      quantityKg: p.quantityKg,
      movementType: "tillverkning_ut",
      lotId: p.lotId,
      unitCost: rawUnitCost || null,
      referenceType: "production_order",
      referenceId: params.orderId,
      note: `Retur externt uppdrag — ${order.external_supplier_name ?? "leverantör"}`,
    });

    for (const l of lines) {
      const qty = round3(Math.abs(l.quantityKg) * share);
      if (qty <= 0) continue;
      const outLotId = await createOutputLot(
        p.lotId,
        {
          productId: l.productId,
          quantityKg: qty,
          unitCost: costPerKg[l.productId],
          detailName: l.detailName,
          detailForm: l.detailForm,
          bestBefore: l.bestBefore ?? null,
        },
        params.orderId,
        pi + 1,
      );
      if (outLotId) {
        const { data: lot } = await supabase
          .from("lots")
          .select("lot_number")
          .eq("id", outLotId)
          .maybeSingle();
        if ((lot as any)?.lot_number) lotNumbers.push((lot as any).lot_number);
      }
      await recordMovement({
        productId: l.productId,
        locationId: GROSSIST_FLYTANDE_ID,
        quantityKg: qty,
        movementType: "tillverkning_in",
        lotId: outLotId,
        unitCost: costPerKg[l.productId] || null,
        referenceType: "production_order",
        referenceId: params.orderId,
        note: `${l.detailName} — retur externt uppdrag`,
      });
      await recordLotTransformation({
        fromLotId: p.lotId,
        toLotId: outLotId,
        quantityInKg: p.quantityKg,
        quantityOutKg: qty,
        productionOrderId: params.orderId,
      });
    }
  }

  // 2. Utbytet mäts mot standard och sparas som avvikelse.
  const yieldRows: ExternalYieldRow[] = [];
  const actualRows: any[] = [];
  for (const l of lines) {
    const qty = round3(Math.abs(l.quantityKg));
    const actualPct = rawQty > 0 ? (qty / rawQty) * 100 : 0;
    const standard = await standardYieldPct(order.species_group, order.raw_form, l.detailForm);
    yieldRows.push({
      detailForm: l.detailForm,
      detailName: l.detailName,
      quantityOut: qty,
      actualPct: round2(actualPct),
      standardPct: standard != null ? round2(standard) : null,
      deviationPct: standard != null ? round2(actualPct - standard) : null,
    });
    if (order.species_group) {
      actualRows.push({
        order_id: params.orderId,
        species_group: order.species_group,
        from_form: order.raw_form,
        to_form: l.detailForm,
        quantity_in: rawQty,
        quantity_out: qty,
        actual_pct: round2(actualPct),
        standard_pct: standard != null ? round2(standard) : round2(actualPct),
        deviation_pct: standard != null ? round2(actualPct - standard) : 0,
      });
    }
  }
  if (actualRows.length) {
    const { error: aErr } = await supabase.from("yield_actuals").insert(actualRows as any);
    if (aErr) throw aErr;
  }

  // Orderraderna får faktisk kvantitet och kostpris; saknas planerad rad skapas den.
  for (const l of lines) {
    const payload = {
      actual_qty: round3(Math.abs(l.quantityKg)),
      cost_price: costPerKg[l.productId],
    };
    if (l.lineId) {
      const { error } = await supabase
        .from("production_order_lines")
        .update(payload as any)
        .eq("id", l.lineId);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("production_order_lines").insert({
        order_id: params.orderId,
        product_id: l.productId,
        detail_name: l.detailName,
        detail_form: l.detailForm,
        planned_pct: 0,
        planned_qty: 0,
        margin_weight: 1,
        is_processed: true,
        sort_order: 99,
        ...payload,
      } as any);
      if (error) throw error;
    }
  }

  const yieldPct = rawQty > 0 ? round2((returnedKg / rawQty) * 100) : 0;
  const { error: uErr } = await supabase
    .from("production_orders")
    .update({
      status: "completed",
      actual_waste_pct: round2(Math.max(0, 100 - yieldPct)),
      notes: [order.notes, params.note].filter(Boolean).join(" · ") || null,
    } as any)
    .eq("id", params.orderId);
  if (uErr) throw uErr;

  return {
    rawQuantityKg: rawQty,
    returnedKg,
    yieldPct,
    rawCost,
    labourCost,
    totalCost,
    costPerKg,
    lotNumbers,
    yields: yieldRows,
  };
}

/** Externa uppdrag som väntar på retur. */
export async function openExternalAssignments() {
  const { data, error } = await supabase
    .from("production_orders")
    .select("*, production_order_lines(*)")
    .eq("order_type", "extern")
    .neq("status", "completed")
    .order("expected_return_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as any[];
}
