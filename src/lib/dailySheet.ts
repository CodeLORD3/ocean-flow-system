import { supabase } from "@/integrations/supabase/client";
import { recordMovements, type StockMovementInput } from "@/lib/stockLedger";

/**
 * Dagsavstämning av butikslager.
 *
 * Ingående lager (IB)  = föregående dags räknade utgående lager (annars saldot i huvudboken
 *                        minus dagens rörelser). Skrivs aldrig manuellt.
 * Inlevererat          = bokförda inflöden i dag (order/leverans från grossist, tillverkning).
 * Övrigt               = bokförda svinn/justeringar/överföringar i dag.
 * Sålt (kassa)         = bokförda försäljningsrörelser i dag.
 * Räknat (UB)          = enda handskrivna/inskrivna siffran — kvällens fysiska räkning.
 *
 * Förväntat = IB + Inlevererat + Övrigt − Sålt(kassa)
 * Differens = Räknat − Förväntat  → orsak krävs över tröskel.
 */

/** Tröskel för när orsak måste anges. */
export const DIFF_THRESHOLD_KG = 2;
export const DIFF_THRESHOLD_VALUE = 500;

export const DIFF_REASONS = [
  { value: "svinn", label: "Svinn / kassation" },
  { value: "felraknat", label: "Felräknat" },
  { value: "oregistrerad_forsaljning", label: "Oregistrerad försäljning" },
  { value: "leveransavvikelse", label: "Leveransavvikelse" },
  { value: "stold", label: "Stöld" },
  { value: "ovrigt", label: "Övrigt" },
] as const;

export const REASON_LABEL: Record<string, string> = Object.fromEntries(
  DIFF_REASONS.map((r) => [r.value, r.label]),
);

const INFLOW = ["inleverans", "overforing_in", "tillverkning_in"];
const SALES = ["forsaljning"];

export interface DailySheetLine {
  id?: string;
  productId: string;
  productName: string;
  sku?: string | null;
  unit?: string | null;
  category?: string | null;
  costPrice: number;
  opening: number;
  received: number;
  other: number;
  /** Bokförd kassaförsäljning i dag (positivt tal) */
  salesBooked: number;
  /** Räknat utgående lager — null = inte räknat än */
  counted: number | null;
  checked: boolean;
  reason: string | null;
  note: string | null;
  sortOrder: number;
}

export interface DailySheet {
  id: string;
  storeId: string;
  locationId: string | null;
  locationName: string | null;
  sheetDate: string;
  status: "utkast" | "godkand";
  mode: "digital" | "papper";
  openedBy: string | null;
  closedBy: string | null;
  closedAt: string | null;
  notes: string | null;
  lines: DailySheetLine[];
}

export const round3 = (n: number) => Math.round((Number(n) || 0) * 1000) / 1000;
export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export const todayStockholm = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date());

/** Förväntat saldo enligt huvudboken. */
export const expectedOf = (l: DailySheetLine) =>
  round3(l.opening + l.received + l.other - l.salesBooked);

/** Differens mellan räknat och förväntat. Null om raden inte är räknad. */
export const diffOf = (l: DailySheetLine) =>
  l.counted === null ? null : round3(l.counted - expectedOf(l));

export const diffValueOf = (l: DailySheetLine) => {
  const d = diffOf(l);
  return d === null ? null : round2(d * (l.costPrice || 0));
};

/** Behöver raden en orsak? */
export const needsReason = (l: DailySheetLine) => {
  const d = diffOf(l);
  if (d === null || d === 0) return false;
  const v = Math.abs(diffValueOf(l) || 0);
  return Math.abs(d) >= DIFF_THRESHOLD_KG || v >= DIFF_THRESHOLD_VALUE;
};

/** Beräknad total försäljning för raden (kassa + oförklarad minskning). */
export const soldTotalOf = (l: DailySheetLine) => {
  const d = diffOf(l);
  const unregistered = d !== null && d < 0 && l.salesBooked === 0 ? -d : 0;
  return round3(l.salesBooked + unregistered);
};

const dayBounds = (sheetDate: string) => {
  // Dagen tolkas i lokal tid (Europe/Stockholm ≈ webbläsarens tid i butiken).
  const from = new Date(`${sheetDate}T00:00:00`);
  const to = new Date(`${sheetDate}T00:00:00`);
  to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
};

interface BuildArgs {
  storeId: string;
  locationId: string;
  locationIds: string[];
  sheetDate: string;
}

/** Läser dagens rörelser och nuvarande saldon och räknar fram IB/In/Övrigt per produkt. */
export async function computeLedgerColumns({ locationIds, sheetDate }: BuildArgs) {
  const { from, to } = dayBounds(sheetDate);

  const [{ data: stock }, { data: moves }] = await Promise.all([
    supabase
      .from("product_stock_locations")
      .select("product_id, quantity, unit_cost, products(id, name, sku, unit, category, cost_price)")
      .in("location_id", locationIds),
    supabase
      .from("stock_movements")
      .select("product_id, movement_type, quantity_kg, unit_cost")
      .in("location_id", locationIds)
      .gte("created_at", from)
      .lt("created_at", to),
  ]);

  const perProduct = new Map<
    string,
    { current: number; received: number; other: number; sales: number; cost: number; product: any }
  >();

  (stock || []).forEach((s: any) => {
    perProduct.set(s.product_id, {
      current: Number(s.quantity) || 0,
      received: 0,
      other: 0,
      sales: 0,
      cost: Number(s.unit_cost) || Number(s.products?.cost_price) || 0,
      product: s.products,
    });
  });

  (moves || []).forEach((m: any) => {
    const qty = Number(m.quantity_kg) || 0;
    let entry = perProduct.get(m.product_id);
    if (!entry) {
      entry = { current: 0, received: 0, other: 0, sales: 0, cost: Number(m.unit_cost) || 0, product: null };
      perProduct.set(m.product_id, entry);
    }
    if (INFLOW.includes(m.movement_type)) entry.received += qty;
    else if (SALES.includes(m.movement_type)) entry.sales += Math.abs(qty);
    else entry.other += qty;
  });

  return perProduct;
}

/** Hämtar produktnamn för produkter som saknas i saldolistan. */
async function fillProductMeta(perProduct: Map<string, any>) {
  const missing = [...perProduct.entries()].filter(([, v]) => !v.product).map(([id]) => id);
  if (!missing.length) return;
  const { data } = await supabase
    .from("products")
    .select("id, name, sku, unit, category, cost_price")
    .in("id", missing);
  (data || []).forEach((p: any) => {
    const e = perProduct.get(p.id);
    if (e) {
      e.product = p;
      if (!e.cost) e.cost = Number(p.cost_price) || 0;
    }
  });
}

/** Föregående dags räknade utgående lager per produkt. */
async function previousClosing(storeId: string, locationId: string, sheetDate: string) {
  const { data } = await supabase
    .from("daily_stock_sheets")
    .select("id, sheet_date")
    .eq("store_id", storeId)
    .eq("location_id", locationId)
    .eq("status", "godkand")
    .lt("sheet_date", sheetDate)
    .order("sheet_date", { ascending: false })
    .limit(1);
  const prev = data?.[0];
  if (!prev) return null;
  const { data: lines } = await supabase
    .from("daily_stock_sheet_lines")
    .select("product_id, counted_qty_kg")
    .eq("sheet_id", prev.id);
  const map = new Map<string, number>();
  (lines || []).forEach((l: any) => {
    if (l.product_id && l.counted_qty_kg !== null)
      map.set(l.product_id, Number(l.counted_qty_kg) || 0);
  });
  return { date: prev.sheet_date as string, map };
}

/** Bygger radlistan för en dag från huvudboken. */
export async function buildLines(args: BuildArgs): Promise<DailySheetLine[]> {
  const perProduct = await computeLedgerColumns(args);
  await fillProductMeta(perProduct);
  const prev = await previousClosing(args.storeId, args.locationId, args.sheetDate);

  const lines: DailySheetLine[] = [...perProduct.entries()].map(([productId, v]) => {
    const movementsToday = v.received + v.other - v.sales;
    const derivedOpening = round3(v.current - movementsToday);
    const opening = prev?.map.has(productId) ? round3(prev.map.get(productId)!) : derivedOpening;
    return {
      productId,
      productName: v.product?.name || "Okänd produkt",
      sku: v.product?.sku ?? null,
      unit: v.product?.unit ?? "kg",
      category: v.product?.category ?? "Övrigt",
      costPrice: round2(v.cost),
      opening,
      received: round3(v.received),
      other: round3(v.other),
      salesBooked: round3(v.sales),
      counted: null,
      checked: false,
      reason: null,
      note: null,
      sortOrder: 0,
    };
  });

  return sortLines(lines);
}

export const sortLines = (lines: DailySheetLine[]) =>
  lines
    .slice()
    .sort(
      (a, b) =>
        String(a.category || "").localeCompare(String(b.category || ""), "sv") ||
        a.productName.localeCompare(b.productName, "sv"),
    )
    .map((l, i) => ({ ...l, sortOrder: i }));

/** Hämtar dagens rapport om den finns. */
export async function loadSheet(storeId: string, locationId: string, sheetDate: string) {
  const { data } = await supabase
    .from("daily_stock_sheets")
    .select("*")
    .eq("store_id", storeId)
    .eq("location_id", locationId)
    .eq("sheet_date", sheetDate)
    .limit(1);
  const sheet = data?.[0];
  if (!sheet) return null;
  const { data: lines } = await supabase
    .from("daily_stock_sheet_lines")
    .select("*")
    .eq("sheet_id", sheet.id)
    .order("sort_order");

  const mapped: DailySheetLine[] = (lines || []).map((l: any) => ({
    id: l.id,
    productId: l.product_id,
    productName: l.product_name,
    sku: l.sku,
    unit: l.unit,
    category: l.category,
    costPrice: Number(l.cost_price) || 0,
    opening: Number(l.opening_qty_kg) || 0,
    received: Number(l.received_qty_kg) || 0,
    other: Number(l.other_qty_kg) || 0,
    salesBooked: Number(l.sold_qty_kg) || 0,
    counted: l.counted_qty_kg === null ? null : Number(l.counted_qty_kg),
    checked: !!l.checked,
    reason: l.diff_reason,
    note: l.note,
    sortOrder: Number(l.sort_order) || 0,
  }));

  return {
    id: sheet.id as string,
    storeId: sheet.store_id as string,
    locationId: sheet.location_id as string | null,
    locationName: sheet.location_name as string | null,
    sheetDate: sheet.sheet_date as string,
    status: sheet.status as "utkast" | "godkand",
    mode: (sheet.mode as "digital" | "papper") || "digital",
    openedBy: sheet.opened_by as string | null,
    closedBy: sheet.closed_by as string | null,
    closedAt: sheet.closed_at as string | null,
    notes: sheet.notes as string | null,
    lines: mapped,
  } as DailySheet;
}

export function totalsOf(lines: DailySheetLine[]) {
  const counted = lines.filter((l) => l.counted !== null);
  return {
    lineCount: lines.length,
    countedCount: counted.length,
    opening: round3(lines.reduce((s, l) => s + l.opening, 0)),
    received: round3(lines.reduce((s, l) => s + l.received, 0)),
    other: round3(lines.reduce((s, l) => s + l.other, 0)),
    salesBooked: round3(lines.reduce((s, l) => s + l.salesBooked, 0)),
    countedQty: round3(counted.reduce((s, l) => s + (l.counted || 0), 0)),
    sold: round3(lines.reduce((s, l) => s + soldTotalOf(l), 0)),
    diffKg: round3(counted.reduce((s, l) => s + (diffOf(l) || 0), 0)),
    diffValue: round2(counted.reduce((s, l) => s + (diffValueOf(l) || 0), 0)),
    closingValue: round2(counted.reduce((s, l) => s + (l.counted || 0) * l.costPrice, 0)),
    missingReasons: lines.filter((l) => needsReason(l) && !l.reason).length,
    unchecked: lines.filter((l) => !l.checked).length,
  };
}

interface SaveArgs {
  sheetId?: string | null;
  storeId: string;
  locationId: string;
  locationName: string;
  sheetDate: string;
  mode: "digital" | "papper";
  openedBy?: string | null;
  notes?: string | null;
  lines: DailySheetLine[];
}

/** Sparar utkast (eller uppdaterar befintligt). Returnerar sheet-id. */
export async function saveDraft(args: SaveArgs): Promise<string> {
  const t = totalsOf(args.lines);
  const payload = {
    store_id: args.storeId,
    location_id: args.locationId,
    location_name: args.locationName,
    sheet_date: args.sheetDate,
    status: "utkast",
    mode: args.mode,
    opened_by: args.openedBy || null,
    notes: args.notes || null,
    opening_total_kg: t.opening,
    received_total_kg: t.received,
    other_total_kg: t.other,
    counted_total_kg: t.countedQty,
    sold_total_kg: t.sold,
    diff_total_kg: t.diffKg,
    diff_total_value: t.diffValue,
    closing_value: t.closingValue,
    line_count: t.lineCount,
  };

  let sheetId = args.sheetId || null;
  if (sheetId) {
    const { error } = await supabase.from("daily_stock_sheets").update(payload).eq("id", sheetId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from("daily_stock_sheets")
      .upsert(payload, { onConflict: "store_id,location_id,sheet_date" })
      .select("id")
      .limit(1);
    if (error) throw error;
    sheetId = data?.[0]?.id as string;
  }

  await supabase.from("daily_stock_sheet_lines").delete().eq("sheet_id", sheetId);
  const rows = args.lines.map((l) => ({
    sheet_id: sheetId,
    product_id: l.productId,
    product_name: l.productName,
    sku: l.sku,
    unit: l.unit,
    category: l.category,
    cost_price: l.costPrice,
    opening_qty_kg: l.opening,
    received_qty_kg: l.received,
    other_qty_kg: l.other,
    counted_qty_kg: l.counted,
    checked: l.checked,
    sold_qty_kg: soldTotalOf(l),
    diff_kg: diffOf(l),
    diff_value: diffValueOf(l),
    diff_reason: l.reason,
    note: l.note,
    sort_order: l.sortOrder,
  }));
  if (rows.length) {
    const { error } = await supabase.from("daily_stock_sheet_lines").insert(rows);
    if (error) throw error;
  }
  return sheetId as string;
}

/**
 * Godkänner dagen: bokför rörelser så huvudboken matchar räkningen och låser rapporten.
 */
export async function closeSheet(args: SaveArgs & { closedBy: string }) {
  const sheetId = await saveDraft(args);
  const movements: StockMovementInput[] = [];

  for (const l of args.lines) {
    const d = diffOf(l);
    if (d === null || d === 0) continue;
    const unregisteredSale = d < 0 && l.salesBooked === 0 && !l.reason;
    const type: StockMovementInput["movementType"] = unregisteredSale
      ? "forsaljning"
      : l.reason === "svinn" || l.reason === "stold"
        ? "svinn"
        : d > 0
          ? "justering"
          : "inventering";
    movements.push({
      productId: l.productId,
      locationId: args.locationId,
      quantityKg: type === "forsaljning" || type === "svinn" ? Math.abs(d) : d,
      movementType: type,
      unitCost: l.costPrice || null,
      referenceType: "daily_sheet",
      referenceId: sheetId,
      note: `Dagsavstämning ${args.sheetDate} · räknat ${l.counted} kg mot förväntat ${expectedOf(l)} kg${
        l.reason ? ` · ${REASON_LABEL[l.reason] || l.reason}` : ""
      }${l.note ? ` · ${l.note}` : ""}`,
    });
  }

  if (movements.length) await recordMovements(movements);

  const t = totalsOf(args.lines);
  const { error } = await supabase
    .from("daily_stock_sheets")
    .update({
      status: "godkand",
      closed_by: args.closedBy,
      closed_at: new Date().toISOString(),
      counted_total_kg: t.countedQty,
      sold_total_kg: t.sold,
      diff_total_kg: t.diffKg,
      diff_total_value: t.diffValue,
      closing_value: t.closingValue,
    })
    .eq("id", sheetId);
  if (error) throw error;
  return sheetId;
}
