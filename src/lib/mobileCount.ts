import { supabase } from "@/integrations/supabase/client";
import { setBalance } from "@/lib/stockLedger";

/**
 * Räkningen på telefon: utkast i telefonen, underlag i databasen och
 * bokföring först vid butikschefens godkännande.
 *
 * Lagerlogiken är oförändrad — saldon ändras bara genom setBalance, som
 * skriver en rörelse i stock_movements med orsak "inventering".
 */

export interface CountDraft {
  storeId: string;
  locationId: string;
  staffId: string | null;
  updatedAt: string;
  /** Nyckel "produktId:partiId" → räknad mängd. */
  values: Record<string, number>;
}

const draftKey = (storeId: string, locationId: string, staffId: string | null) =>
  `count-draft:${storeId}:${locationId}:${staffId ?? "okand"}`;

/** Läser utkastet för just den här personen och lagerplatsen. */
export function readDraft(
  storeId: string,
  locationId: string,
  staffId: string | null,
): CountDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(storeId, locationId, staffId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CountDraft;
    // Ett utkast hör till en person och en lagerplats — aldrig någon annans.
    if (parsed.locationId !== locationId || (parsed.staffId ?? null) !== (staffId ?? null))
      return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeDraft(draft: Omit<CountDraft, "updatedAt">) {
  const full: CountDraft = { ...draft, updatedAt: new Date().toISOString() };
  try {
    localStorage.setItem(draftKey(draft.storeId, draft.locationId, draft.staffId), JSON.stringify(full));
  } catch {
    /* fullt utrymme får aldrig stoppa räkningen */
  }
  return full;
}

export function clearDraft(storeId: string, locationId: string, staffId: string | null) {
  try {
    localStorage.removeItem(draftKey(storeId, locationId, staffId));
  } catch {
    /* ignoreras */
  }
}

/**
 * Var i räkningen personen befann sig senast. Sparas i telefonen så att en
 * släckt skärm eller omstartad app aldrig kastar bort arbetet — man kommer
 * tillbaka till samma lagerplats och samma vara.
 */
export interface CountPosition {
  storeId: string;
  staffId: string | null;
  locationId: string;
  locationName: string | null;
  sessionId: string | null;
  index: number;
  step: string;
  /** Vilken varugrupp man räknar i, om någon är vald. */
  groupKey?: string | null;
  updatedAt: string;
}

const posKey = (storeId: string, staffId: string | null) =>
  `count-position:${storeId}:${staffId ?? "okand"}`;

/** Äldre än det här räknas som en avslutad arbetsdag och återupptas inte. */
const POSITION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function readPosition(storeId: string, staffId: string | null): CountPosition | null {
  try {
    const raw = localStorage.getItem(posKey(storeId, staffId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CountPosition;
    if (!parsed?.locationId) return null;
    if ((parsed.staffId ?? null) !== (staffId ?? null)) return null;
    const age = Date.now() - new Date(parsed.updatedAt).getTime();
    if (!Number.isFinite(age) || age > POSITION_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writePosition(pos: Omit<CountPosition, "updatedAt">) {
  try {
    localStorage.setItem(
      posKey(pos.storeId, pos.staffId),
      JSON.stringify({ ...pos, updatedAt: new Date().toISOString() }),
    );
  } catch {
    /* fullt utrymme får aldrig stoppa räkningen */
  }
}

export function clearPosition(storeId: string, staffId: string | null) {
  try {
    localStorage.removeItem(posKey(storeId, staffId));
  } catch {
    /* ignoreras */
  }
}

/* --------------------------------------------------------- kö för sparningar */

/**
 * En räknad rad som ännu inte kommit fram till databasen. Kön ligger i
 * telefonen så att dålig täckning i frysrummet aldrig tappar en räkning:
 * raden läggs i kön först, skickas sedan, och tas ur kön när den är sparad.
 */
export interface QueuedLine {
  sessionId: string;
  productId: string;
  locationId: string;
  lotId: string | null;
  quantity: number | null;
  systemQty: number;
  unit: string;
  comment: string | null;
  at: string;
}

const QUEUE_KEY = "count-queue";
const queueId = (r: Pick<QueuedLine, "sessionId" | "productId" | "lotId">) =>
  `${r.sessionId}:${r.productId}:${r.lotId ?? ""}`;

export function readQueue(): QueuedLine[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? (JSON.parse(raw) as QueuedLine[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(rows: QueuedLine[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(rows));
  } catch {
    /* fullt utrymme får aldrig stoppa räkningen */
  }
}

/** Lägger raden i kön (en rad per produkt och parti — senaste gäller). */
export function enqueueLine(row: QueuedLine) {
  const rest = readQueue().filter((r) => queueId(r) !== queueId(row));
  writeQueue([...rest, row]);
}

export function dequeueLine(row: Pick<QueuedLine, "sessionId" | "productId" | "lotId">) {
  writeQueue(readQueue().filter((r) => queueId(r) !== queueId(row)));
}

/** Skriver en räknad rad till databasen. Samma väg från kön som direkt. */
export async function saveCountLine(row: QueuedLine) {
  const values = {
    session_id: row.sessionId,
    product_id: row.productId,
    location_id: row.locationId,
    lot_id: row.lotId,
    counted_qty: row.quantity,
    system_qty: row.systemQty,
    unit: row.unit,
    comment: row.comment,
    counted_at: row.at,
  };
  // Unika raden i databasen bygger på COALESCE, så ON CONFLICT går inte att
  // använda. Vi letar upp raden först och uppdaterar den, annars skapas den.
  let find = supabase
    .from("stock_count_lines")
    .select("id")
    .eq("session_id", row.sessionId)
    .eq("product_id", row.productId)
    .eq("location_id", row.locationId);
  find = row.lotId ? find.eq("lot_id", row.lotId) : find.is("lot_id", null);
  const { data: existing, error: findErr } = await find.maybeSingle();
  if (findErr) throw findErr;
  if (existing) {
    const { error } = await supabase
      .from("stock_count_lines")
      .update(values as any)
      .eq("id", (existing as any).id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("stock_count_lines").insert(values as any);
    if (error) throw error;
  }
  await supabase
    .from("stock_count_sessions")
    .update({ last_activity_at: new Date().toISOString() } as any)
    .eq("id", row.sessionId);
}

/** Skickar allt som ligger kvar i kön. Returnerar antal kvar efter försöket. */
export async function flushQueue(): Promise<number> {
  for (const row of readQueue()) {
    try {
      await saveCountLine(row);
      dequeueLine(row);
    } catch {
      // Nätet är fortfarande borta — raden ligger kvar och försöks igen.
      break;
    }
  }
  return readQueue().length;
}

export interface SubmitRow {
  productId: string;
  productName: string;
  sku: string | null;
  unit: string;
  category: string | null;
  costPrice: number;
  expectedQty: number;
  countedQty: number;
}

/**
 * Skickar in räkningen som ett inventeringsunderlag som väntar på godkännande.
 * Inga saldon ändras här.
 */
export async function submitCount(params: {
  storeId: string;
  sessionId: string;
  locationId: string;
  locationName: string | null;
  reportedBy: string | null;
  startedAt?: string | null;
  rows: SubmitRow[];
}) {
  // En rad per produkt: partier summeras ihop till produktens mängd på platsen.
  const byProduct = new Map<string, SubmitRow>();
  for (const r of params.rows) {
    const found = byProduct.get(r.productId);
    if (found) {
      found.countedQty += r.countedQty;
      found.expectedQty += r.expectedQty;
    } else {
      byProduct.set(r.productId, { ...r });
    }
  }
  const rows = [...byProduct.values()].map((r) => {
    const counted = Math.round(r.countedQty * 1000) / 1000;
    const expected = Math.round(r.expectedQty * 1000) / 1000;
    const diff = Math.round((counted - expected) * 1000) / 1000;
    return {
      product_id: r.productId,
      product_name: r.productName,
      sku: r.sku,
      unit: r.unit,
      category: r.category,
      quantity: counted,
      cost_price: r.costPrice,
      line_value: Math.round(counted * r.costPrice * 100) / 100,
      expected_qty_kg: expected,
      counted_qty_kg: counted,
      diff_kg: diff,
      diff_value: Math.round(diff * r.costPrice * 100) / 100,
    };
  });

  const totalValue = rows.reduce((s, r) => s + r.line_value, 0);
  const totalDiffKg = rows.reduce((s, r) => s + r.diff_kg, 0);
  const totalDiffValue = rows.reduce((s, r) => s + r.diff_value, 0);

  const { data: report, error } = await supabase
    .from("inventory_reports")
    .insert({
      store_id: params.storeId,
      location_id: params.locationId,
      location_name: params.locationName,
      reported_by: params.reportedBy,
      status: "vantar_godkannande",
      started_at: params.startedAt ?? null,
      line_count: rows.length,
      total_value: Math.round(totalValue * 100) / 100,
      total_diff_kg: Math.round(totalDiffKg * 1000) / 1000,
      total_diff_value: Math.round(totalDiffValue * 100) / 100,
      count_session_id: params.sessionId,
    } as any)
    .select("id")
    .single();
  if (error) throw error;

  const reportId = (report as any).id as string;
  if (rows.length) {
    const { error: lineErr } = await supabase
      .from("inventory_report_lines")
      .insert(rows.map((r) => ({ ...r, report_id: reportId })) as any);
    if (lineErr) throw lineErr;
  }

  // Räkningen är inskickad och kan inte ändras vidare på telefonen.
  await supabase
    .from("stock_count_sessions")
    .update({ status: "inskickad", finished_at: new Date().toISOString() } as any)
    .eq("id", params.sessionId);

  return { reportId, lineCount: rows.length, diffCount: rows.filter((r) => r.diff_kg !== 0).length };
}

/**
 * Butikschefens godkännande. Här — och bara här — bokförs justeringarna:
 * en rörelse per avvikande rad i stock_movements med orsak "inventering".
 */
export async function approveCountReport(reportId: string, approvedBy: string | null) {
  const { data: report, error } = await supabase
    .from("inventory_reports")
    .select("id, store_id, location_id, location_name, status, count_session_id, reported_at")
    .eq("id", reportId)
    .maybeSingle();
  if (error) throw error;
  if (!report) throw new Error("Underlaget kunde inte läsas.");
  if ((report as any).status !== "vantar_godkannande")
    throw new Error("Underlaget är redan hanterat.");
  const locationId = (report as any).location_id as string | null;
  if (!locationId) throw new Error("Underlaget saknar lagerplats.");

  const { data: lines, error: lineErr } = await supabase
    .from("inventory_report_lines")
    .select("product_id, counted_qty_kg, diff_kg, cost_price")
    .eq("report_id", reportId);
  if (lineErr) throw lineErr;

  let written = 0;
  for (const l of (lines || []) as any[]) {
    if (!Number(l.diff_kg)) continue;
    const movement = await setBalance({
      productId: l.product_id,
      locationId,
      targetQuantityKg: Number(l.counted_qty_kg) || 0,
      movementType: "inventering",
      unitCost: Number(l.cost_price) || null,
      note: `Inventering godkänd — ${(report as any).location_name ?? "lagerplats"}`,
      referenceType: "inventory_report",
      referenceId: reportId,
    });
    if (movement) written += 1;
  }

  const { error: upErr } = await supabase
    .from("inventory_reports")
    .update({
      status: "godkand",
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
    } as any)
    .eq("id", reportId);
  if (upErr) throw upErr;

  if ((report as any).count_session_id) {
    await supabase
      .from("stock_count_sessions")
      .update({
        status: "locked",
        locked_at: new Date().toISOString(),
        locked_by: approvedBy,
      } as any)
      .eq("id", (report as any).count_session_id);
  }

  return { written };
}

/** Mängd i klartext: max en decimal, komma som i svenska. */
export function fmtQty(qty: number, unit?: string | null) {
  const n = Math.round(qty * 10) / 10;
  const text = n.toLocaleString("sv-SE", { maximumFractionDigits: 1 });
  return unit ? `${text} ${unit}` : text;
}

/** Avvikelse i klartext: "3,2 kg mindre än väntat". */
export function diffText(diff: number, unit?: string | null) {
  const abs = Math.abs(Math.round(diff * 10) / 10);
  if (abs < 0.05) return "Stämmer med väntat";
  const word = diff < 0 ? "mindre" : "mer";
  return `${fmtQty(abs, unit ?? "kg")} ${word} än väntat`;
}

/** Bäst före i klartext: "Bäst före 21 sep". */
export function bestBeforeText(date?: string | null) {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return `Bäst före ${d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" })}`;
}

/** Klockslag i klartext för "Fortsätt räkningen från 14:32?". */
export function timeText(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
}
