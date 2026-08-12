import { supabase } from "@/integrations/supabase/client";
import { asciiFold } from "@/lib/asciiFold";
import { lotBalancesAtLocation } from "@/lib/stockLedger";

/**
 * Partibindning i tillverkning (AP-6).
 *
 * En tillverkningsorder plockar råvara ur ett eller flera partier och skapar
 * nya partier för detaljerna. Kopplingen sparas i lot_transformations så att
 * varje såld detalj kan spåras tillbaka till fångstuppgifterna på råvaran.
 *
 * Fält som ärvs får aldrig hittas på: saknas ett råvaruparti skapas ett parti
 * märkt "Okänd härkomst" istället för ett parti med påhittade uppgifter.
 */

/** Fångst- och härkomstfält som ärvs från råvaruparti till detaljparti. */
const INHERITED_FIELDS = [
  "species_fao_code",
  "latin_name",
  "commercial_name",
  "catch_area",
  "fishing_gear",
  "fishing_gear_code",
  "production_method",
  "is_thawed",
  "catch_date_from",
  "catch_date_to",
  "vessel_name",
  "vessel_reg",
  "vessel_nation",
  "supplier_id",
  "grade",
  "certificate",
  "certified_program",
  "origin_lot_id",
  "supplier_lot_id",
  "traceability_required",
] as const;

export interface RawPick {
  lotId: string | null;
  quantityKg: number;
}

/**
 * Plockar råvara FIFO ur partierna på lagerplatsen. Räcker partierna inte till
 * returneras resten som ett plock utan parti (lotId null) — det syns då i
 * spårbarhetsvyn istället för att döljas.
 */
export async function pickRawLots(
  productId: string,
  locationId: string,
  quantityKg: number,
): Promise<RawPick[]> {
  const wanted = Math.abs(Number(quantityKg) || 0);
  if (!wanted) return [];
  const balances = await lotBalancesAtLocation(productId, locationId);
  const picks: RawPick[] = [];
  let left = wanted;
  for (const b of balances) {
    if (left <= 0) break;
    const take = Math.min(left, b.quantityKg);
    if (take <= 0) continue;
    picks.push({ lotId: b.lotId, quantityKg: Math.round(take * 1000) / 1000 });
    left = Math.round((left - take) * 1000) / 1000;
  }
  if (left > 0) picks.push({ lotId: null, quantityKg: left });
  return picks;
}

async function fetchLot(lotId: string) {
  const { data } = await supabase
    .from("lots")
    .select("*")
    .eq("id", lotId)
    .maybeSingle();
  return data as Record<string, any> | null;
}

export interface OutputLotInput {
  productId: string;
  quantityKg: number;
  unitCost?: number | null;
  detailName?: string | null;
  detailForm?: string | null;
  bestBefore?: string | null;
  /** Fast kod i partinumret, t.ex. "KOKT" vid omvandling. */
  lotCode?: string | null;
}


/**
 * Kort detaljkod ur detaljens form/namn, t.ex. "rygg" → RYG.
 * Används i partinumret så härkomsten syns i lagerlistan: IL-2026-0001-01-RYG.
 */
export function detailLotCode(input?: string | null): string {
  const folded = asciiFold(String(input ?? ""))
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return folded.slice(0, 3) || "DET";
}

/**
 * Skapar ett detaljparti som ärver härkomsten från exakt ett råvaruparti.
 * Ett detaljparti får aldrig blandas ur två råvarupartier — fångstområde,
 * fartyg och fångstdatum kan bara bära ett värde, och ett arv från "första
 * partiet" ger fel uppgift på skylten och missad framåtspårning.
 * Utan råvaruparti märks partiet som okänd härkomst.
 */
export async function createOutputLot(
  sourceLotId: string | null,
  out: OutputLotInput,
  orderRef: string,
  /** Löpnummer för råvarupartiet i plocket (1-baserat). */
  sourceIndex = 1,
): Promise<string | null> {
  const source = sourceLotId ? await fetchLot(sourceLotId) : null;
  const inherited: Record<string, any> = {};
  if (source) {
    for (const f of INHERITED_FIELDS) {
      if (source[f] !== undefined && source[f] !== null) inherited[f] = source[f];
    }
    // Detaljpartiet pekar tillbaka på ursprunget även när råvaran själv var ett led.
    inherited.origin_lot_id = source.origin_lot_id || source.lot_number || null;
  }

  const seq = String(sourceIndex).padStart(2, "0");
  const code = out.lotCode
    ? out.lotCode.toUpperCase()
    : detailLotCode(out.detailForm || out.detailName);

  const lotNumber = source
    ? `${source.lot_number}-${seq}-${code}`
    : `OKAND-${new Date().toISOString().slice(0, 10)}-${orderRef.slice(0, 8)}-${seq}-${code}`;

  const { data, error } = await supabase
    .from("lots")
    .insert({
      ...inherited,
      lot_number: lotNumber,
      product_id: out.productId,
      quantity_kg: Math.abs(Number(out.quantityKg) || 0),
      unit_cost: out.unitCost ?? null,
      best_before: out.bestBefore ?? source?.best_before ?? null,
      status: "aktiv",
      traceability_required: true,
      catch_area: source?.catch_area ?? "Okänd härkomst — råvaruparti saknades vid tillverkning",
    } as any)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  return (data as any)?.id ?? null;
}


/** Loggar omvandlingen råvaruparti → detaljparti. */
export async function recordLotTransformation(params: {
  fromLotId: string | null;
  toLotId: string | null;
  quantityInKg: number;
  quantityOutKg: number;
  productionOrderId?: string | null;
}) {
  if (!params.fromLotId && !params.toLotId) return;
  const { error } = await supabase.from("lot_transformations").insert({
    from_lot_id: params.fromLotId,
    to_lot_id: params.toLotId,
    quantity_in_kg: Math.abs(Number(params.quantityInKg) || 0),
    quantity_out_kg: Math.abs(Number(params.quantityOutKg) || 0),
    production_order_id: params.productionOrderId ?? null,
  } as any);
  if (error) throw error;
}
