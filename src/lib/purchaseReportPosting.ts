/**
 * Bryggan mellan följesedelsinläsningen och lagerledgern (AP-9).
 *
 * Rader från en inköpsrapport blir partier och en inleveransrörelse mot
 * Grossist Flytande. Kostpriset från följesedeln är preliminärt tills
 * fakturan bekräftar det, därför sätts lots.price_status = 'preliminar'.
 */
import { supabase } from "@/integrations/supabase/client";
import { recordMovement } from "@/lib/stockLedger";
import { grossistStoreId, inkopslagerId } from "@/lib/locations";

export interface PostingProduct {
  id: string;
  unit?: string | null;
  shelf_life_days?: number | null;
  weight_per_piece?: number | null;
  nominal_weight_kg?: number | null;
}

export interface PostingLine {
  id: string;
  product_id: string | null;
  product_name: string | null;
  quantity: number | null;
  unit?: string | null;
  unit_price?: number | null;
  line_total?: number | null;
  ordered_quantity?: number | null;
  lot_numbers?: string[] | null;
  batch_quantities?: Record<string, number> | null;
  best_before?: string | null;
  catch_area?: string | null;
  catch_date_from?: string | null;
  fishing_gear?: string | null;
  vessel_name?: string | null;
  presentation?: string | null;
  species_fao_code?: string | null;
  latin_name?: string | null;
  zero_price_confirmed?: boolean | null;
}

export interface PlannedLot {
  key: string;
  lotNumber: string;
  productId: string;
  quantityKg: number;
  unitCost: number;
  lineIds: string[];
  parentLineId: string;
  bestBefore: string | null;
  catchArea: string | null;
  catchDateFrom: string | null;
  fishingGear: string | null;
  vesselName: string | null;
  presentation: string | null;
  faoCode: string | null;
  latinName: string | null;
}

export interface PostingPlan {
  lots: PlannedLot[];
  /** Hinder som måste åtgärdas innan bokföring — bokför inte förbi dessa. */
  blockers: string[];
  /** Avvikelser som ska synas men inte spärrar. */
  warnings: string[];
}

const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * Räknar om levererad kvantitet till kilo. Styck och lådor kräver vikt på
 * produkten — saknas den blir det ett hinder i stället för en gissad vikt.
 */
export function quantityToKg(
  line: PostingLine,
  product?: PostingProduct,
): { kg: number | null; reason?: string } {
  const qty = Number(line.quantity ?? 0);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { kg: null, reason: "kvantiteten saknas eller är noll" };
  }
  const unit = String(line.unit ?? product?.unit ?? "kg").toLowerCase().trim();
  if (["kg", "kilo", "kilogram", ""].includes(unit)) return { kg: qty };
  if (["g", "gram"].includes(unit)) return { kg: qty / 1000 };
  if (["st", "stk", "styck", "pcs"].includes(unit)) {
    const per = Number(product?.weight_per_piece ?? 0);
    if (per > 0) return { kg: round(qty * per) };
    return { kg: null, reason: "styckvikt saknas på produkten" };
  }
  if (["låda", "lada", "box", "förp", "forp", "kolli", "krt"].includes(unit)) {
    const per = Number(product?.nominal_weight_kg ?? 0);
    if (per > 0) return { kg: round(qty * per) };
    return { kg: null, reason: "lådvikt (nominell vikt) saknas på produkten" };
  }
  return { kg: null, reason: `okänd enhet "${unit}"` };
}

/** Jämn fördelning av kvantitet över flera batchnummer — förval i dialogen. */
export function evenBatchSplit(lotNumbers: string[], totalKg: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (!lotNumbers.length) return out;
  const share = round(totalKg / lotNumbers.length);
  lotNumbers.forEach((n, i) => {
    out[n] = i === lotNumbers.length - 1 ? round(totalKg - share * (lotNumbers.length - 1)) : share;
  });
  return out;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Bygger bokföringsplanen: en rad med flera partinummer delas upp (JHB), och
 * flera rader med samma partinummer slås ihop till ett parti med viktat
 * snittpris (GFA-klubbslag) medan underraderna behålls för spårbarheten.
 */
export function buildPostingPlan(
  lines: PostingLine[],
  opts: {
    products?: PostingProduct[];
    documentNumber?: string | null;
    documentDate?: string | null;
    reportDate?: string | null;
  } = {},
): PostingPlan {
  const productById = new Map((opts.products ?? []).map((p) => [p.id, p]));
  const blockers: string[] = [];
  const warnings: string[] = [];
  const groups = new Map<string, PlannedLot & { value: number }>();
  const arrival = opts.documentDate || opts.reportDate || new Date().toISOString().slice(0, 10);
  const docRef = opts.documentNumber || opts.documentDate || arrival;

  lines.forEach((line, index) => {
    const label = line.product_name || `rad ${index + 1}`;
    if (!line.product_id) {
      blockers.push(`${label}: ingen produkt kopplad`);
      return;
    }
    const product = productById.get(line.product_id);
    const { kg, reason } = quantityToKg(line, product);
    if (kg === null) {
      blockers.push(`${label}: ${reason}`);
      return;
    }

    const unitPrice = Number(line.unit_price ?? 0);
    if (!(unitPrice > 0) && !line.zero_price_confirmed) {
      blockers.push(`${label}: nollpris måste bekräftas manuellt innan bokföring`);
      return;
    }

    // Levererad vikt gäller — beställd vikt ger bara larm vid stor avvikelse.
    const ordered = Number(line.ordered_quantity ?? 0);
    if (ordered > 0 && Math.abs(kg - ordered) / ordered > 0.1) {
      warnings.push(
        `${label}: levererat ${round(kg)} kg mot beställt ${round(ordered)} kg (avvikelse över 10 %)`,
      );
    }

    const lineTotal = Number(line.line_total ?? 0);
    if (lineTotal > 0 && unitPrice > 0 && Math.abs(lineTotal - unitPrice * kg) > Math.max(1, lineTotal * 0.02)) {
      warnings.push(`${label}: radsumman stämmer inte med pris × kvantitet`);
    }

    // Bäst före från leverantören går före beräkning på hållbarhetsdagar.
    const shelfLife = Number(product?.shelf_life_days ?? 0);
    const bestBefore = line.best_before || (shelfLife > 0 ? addDays(arrival, shelfLife) : null);

    const lotNumbers = (line.lot_numbers ?? []).map((n) => String(n).trim()).filter(Boolean);
    let allocation: Record<string, number>;
    if (lotNumbers.length === 0) {
      allocation = { [`FS-${docRef}-${index + 1}`]: kg };
    } else if (lotNumbers.length === 1) {
      allocation = { [lotNumbers[0]]: kg };
    } else {
      const manual = line.batch_quantities ?? null;
      allocation = manual && Object.keys(manual).length ? manual : evenBatchSplit(lotNumbers, kg);
      const sum = Object.values(allocation).reduce((s, v) => s + Number(v || 0), 0);
      if (Math.abs(sum - kg) > 0.005) {
        blockers.push(
          `${label}: fördelningen över partinummer (${round(sum)} kg) stämmer inte med levererad kvantitet (${round(kg)} kg)`,
        );
        return;
      }
    }

    for (const [lotNumber, lotQty] of Object.entries(allocation)) {
      const qty = Number(lotQty || 0);
      if (qty <= 0) continue;
      const key = `${line.product_id}|${lotNumber}`;
      const existing = groups.get(key);
      if (existing) {
        existing.quantityKg = round(existing.quantityKg + qty);
        existing.value = round(existing.value + qty * unitPrice, 4);
        existing.lineIds.push(line.id);
        // Kortast bäst-före vinner när klubbslag slås ihop.
        if (bestBefore && (!existing.bestBefore || bestBefore < existing.bestBefore)) {
          existing.bestBefore = bestBefore;
        }
        existing.catchArea = existing.catchArea || line.catch_area || null;
        existing.vesselName = existing.vesselName || line.vessel_name || null;
      } else {
        groups.set(key, {
          key,
          lotNumber,
          productId: line.product_id,
          quantityKg: round(qty),
          value: round(qty * unitPrice, 4),
          unitCost: unitPrice,
          lineIds: [line.id],
          parentLineId: line.id,
          bestBefore,
          catchArea: line.catch_area ?? null,
          catchDateFrom: line.catch_date_from ?? null,
          fishingGear: line.fishing_gear ?? null,
          vesselName: line.vessel_name ?? null,
          presentation: line.presentation ?? null,
          faoCode: line.species_fao_code ?? null,
          latinName: line.latin_name ?? null,
        });
      }
    }
  });

  const lots = [...groups.values()].map(({ value, ...lot }) => ({
    ...lot,
    unitCost: lot.quantityKg > 0 ? round(value / lot.quantityKg, 4) : 0,
  }));

  return { lots, blockers, warnings };
}

/**
 * Bokför planen i en enda databastransaktion: partier med preliminärt pris,
 * en inleveransrörelse per parti mot Grossist Flytande och kopplade rader.
 * Allt eller inget — vid fel skrivs ingenting. Interna partinummer sätts av
 * databasen (IL-ÅÅÅÅ-NNNN); leverantörens partinummer sparas som
 * supplier_lot_id och behöver därför inte vara unikt.
 */
export async function postPurchaseReport(params: {
  reportId: string;
  plan: PostingPlan;
}): Promise<{ lotIds: string[] }> {
  const { reportId, plan } = params;
  if (plan.blockers.length) {
    throw new Error(`Bokföringen stoppades: ${plan.blockers.join("; ")}`);
  }
  if (!plan.lots.length) {
    throw new Error("Inga rader kunde bokföras.");
  }

  const payload = plan.lots.map((lot) => ({
    supplier_lot_number: lot.lotNumber,
    product_id: lot.productId,
    quantity_kg: lot.quantityKg,
    unit_cost: lot.unitCost || null,
    best_before: lot.bestBefore,
    catch_area: lot.catchArea,
    catch_date_from: lot.catchDateFrom,
    fishing_gear: lot.fishingGear,
    vessel_name: lot.vesselName,
    presentation: lot.presentation,
    fao_code: lot.faoCode,
    latin_name: lot.latinName,
    line_ids: lot.lineIds,
    parent_line_id: lot.parentLineId,
  }));

  const { data, error } = await (supabase as any).rpc("post_purchase_report", {
    p_report_id: reportId,
    // Inköp landar i INKÖPSLAGRET — varan är vår, men ännu inte hos oss.
    p_location_id: await inkopslagerId(await grossistStoreId()),
    p_lots: payload,
  });
  if (error) {
    throw new Error(error.message || "Bokföringen misslyckades. Inget har sparats.");
  }

  return { lotIds: (data as string[] | null) ?? [] };
}


/** Motbokar en tidigare bokförd rapport så saldot aldrig suddas ut. */
export async function unpostPurchaseReport(reportId: string): Promise<void> {
  const { data: lines, error } = await supabase
    .from("purchase_report_lines")
    .select("id, product_id, quantity, lot_id")
    .eq("report_id", reportId)
    .not("lot_id", "is", null);
  if (error) throw error;

  const byLot = new Map<string, { productId: string; qty: number }>();
  for (const line of lines ?? []) {
    const lotId = (line as any).lot_id as string;
    if (!lotId || !(line as any).product_id) continue;
    const prev = byLot.get(lotId);
    byLot.set(lotId, {
      productId: (line as any).product_id,
      qty: (prev?.qty ?? 0) + Number((line as any).quantity || 0),
    });
  }

  for (const [lotId, { productId }] of byLot) {
    const { data: lot } = await supabase
      .from("lots")
      .select("quantity_kg")
      .eq("id", lotId)
      .maybeSingle();
    const qty = Number((lot as any)?.quantity_kg || 0);
    if (qty > 0) {
      await recordMovement({
        productId,
        locationId: await inkopslagerId(await grossistStoreId()),
        quantityKg: -qty,
        movementType: "justering",
        lotId,
        referenceType: "purchase_report",
        referenceId: reportId,
        note: "Följesedel avbokad — inleverans återförd",
      });
    }
    await supabase
      .from("lots")
      .update({ status: "terminerad", terminated_reason: "Följesedel avbokad" } as any)
      .eq("id", lotId);
  }

  await supabase
    .from("purchase_report_lines")
    .update({ lot_id: null, movement_id: null, parent_line_id: null } as any)
    .eq("report_id", reportId);

  await supabase
    .from("purchase_reports")
    .update({ posted_at: null } as any)
    .eq("id", reportId);
}
