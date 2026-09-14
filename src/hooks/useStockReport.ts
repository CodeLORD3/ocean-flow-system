import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { balancesAtLocation, setBalance } from "@/lib/stockLedger";

/**
 * Enkel daglig lagerrapport per butik.
 *
 * Butiksansvarig söker fram produkter, anger mängd i produktens enhet och
 * skickar in listan. Rapporten lagras som ett butiksvitt underlag
 * (daily_stock_sheets med location_id = null) och låses vid inskickning.
 *
 * Rapporten är sanningen om butikens lager: vid inskickning sätts saldot på
 * butikens inventeringsplats till rapportens mängder, och produkter som inte
 * står med nollställs. Allt bokförs som inventeringsrörelser i stock_movements.
 */

export const todayStockholm = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date());

export const STOCK_REPORT_LOCATION_NAME = "Butikslager (dagsrapport)";

export interface StockReportLine {
  id: string;
  product_id: string | null;
  product_name: string;
  sku: string | null;
  unit: string | null;
  category: string | null;
  counted_qty_kg: number;
  note: string | null;
}

export interface StockReport {
  id: string;
  store_id: string;
  sheet_date: string;
  status: "utkast" | "godkand";
  closed_by: string | null;
  closed_at: string | null;
  line_count: number;
  counted_total_kg: number;
  lines: StockReportLine[];
}

const mapLines = (rows: any[]): StockReportLine[] =>
  (rows || []).map((l) => ({
    id: l.id,
    product_id: l.product_id,
    product_name: l.product_name,
    sku: l.sku,
    unit: l.unit,
    category: l.category,
    counted_qty_kg: Number(l.counted_qty_kg) || 0,
    note: l.note,
  }));

async function fetchReport(storeId: string, date: string): Promise<StockReport | null> {
  const { data, error } = await supabase
    .from("daily_stock_sheets")
    .select("*")
    .eq("store_id", storeId)
    .is("location_id", null)
    .eq("sheet_date", date)
    .limit(1);
  if (error) throw error;
  const sheet = data?.[0];
  if (!sheet) return null;
  const { data: lines, error: lineErr } = await supabase
    .from("daily_stock_sheet_lines")
    .select("*")
    .eq("sheet_id", sheet.id)
    .order("sort_order");
  if (lineErr) throw lineErr;
  return {
    id: sheet.id,
    store_id: sheet.store_id,
    sheet_date: sheet.sheet_date,
    status: (sheet.status as "utkast" | "godkand") ?? "utkast",
    closed_by: sheet.closed_by,
    closed_at: sheet.closed_at,
    line_count: Number(sheet.line_count) || 0,
    counted_total_kg: Number(sheet.counted_total_kg) || 0,
    lines: mapLines(lines || []),
  };
}

export function useTodayStockReport(storeId: string | null | undefined) {
  const date = todayStockholm();
  return useQuery({
    queryKey: ["stock-report", storeId, date],
    enabled: !!storeId,
    queryFn: () => fetchReport(storeId!, date),
  });
}

/** Tidigare inskickade lagerrapporter för butiken (senaste först). */
export function useStockReportArchive(storeId: string | null | undefined, limit = 60) {
  const date = todayStockholm();
  return useQuery({
    queryKey: ["stock-report-archive", storeId, date, limit],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_stock_sheets")
        .select("*")
        .eq("store_id", storeId!)
        .is("location_id", null)
        .lt("sheet_date", date)
        .order("sheet_date", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data || [];
    },
  });
}

export function useStockReportLines(sheetId: string | null) {
  return useQuery({
    queryKey: ["stock-report-lines", sheetId],
    enabled: !!sheetId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_stock_sheet_lines")
        .select("*")
        .eq("sheet_id", sheetId!)
        .order("sort_order");
      if (error) throw error;
      return mapLines(data || []);
    },
  });
}

async function ensureSheet(storeId: string, date: string, openedBy: string | null) {
  const existing = await fetchReport(storeId, date);
  if (existing) return existing.id;
  const { data, error } = await supabase
    .from("daily_stock_sheets")
    .insert({
      store_id: storeId,
      location_id: null,
      location_name: STOCK_REPORT_LOCATION_NAME,
      sheet_date: date,
      status: "utkast",
      mode: "digital",
      opened_by: openedBy,
    })
    .select("id")
    .limit(1);
  if (error) throw error;
  return data?.[0]?.id as string;
}

async function refreshTotals(sheetId: string) {
  const { data } = await supabase
    .from("daily_stock_sheet_lines")
    .select("counted_qty_kg, cost_price")
    .eq("sheet_id", sheetId);
  const rows = data || [];
  const qty = rows.reduce((s, r: any) => s + (Number(r.counted_qty_kg) || 0), 0);
  const value = rows.reduce(
    (s, r: any) => s + (Number(r.counted_qty_kg) || 0) * (Number(r.cost_price) || 0),
    0,
  );
  await supabase
    .from("daily_stock_sheets")
    .update({
      line_count: rows.length,
      counted_total_kg: Math.round(qty * 1000) / 1000,
      closing_value: Math.round(value * 100) / 100,
    })
    .eq("id", sheetId);
}

export interface AddStockReportLineArgs {
  storeId: string;
  openedBy?: string | null;
  product: {
    id: string;
    name: string;
    sku?: string | null;
    unit?: string | null;
    category?: string | null;
    cost_price?: number | null;
  };
  quantity: number;
  note?: string | null;
}

export function useAddStockReportLine() {
  const qc = useQueryClient();
  const date = todayStockholm();
  return useMutation({
    mutationFn: async (args: AddStockReportLineArgs) => {
      const sheetId = await ensureSheet(args.storeId, date, args.openedBy ?? null);
      const { data: existing } = await supabase
        .from("daily_stock_sheet_lines")
        .select("id, counted_qty_kg")
        .eq("sheet_id", sheetId)
        .eq("product_id", args.product.id)
        .limit(1);

      if (existing?.[0]) {
        const { error } = await supabase
          .from("daily_stock_sheet_lines")
          .update({ counted_qty_kg: args.quantity, note: args.note ?? null })
          .eq("id", existing[0].id);
        if (error) throw error;
      } else {
        const { count } = await supabase
          .from("daily_stock_sheet_lines")
          .select("id", { count: "exact", head: true })
          .eq("sheet_id", sheetId);
        const { error } = await supabase.from("daily_stock_sheet_lines").insert({
          sheet_id: sheetId,
          product_id: args.product.id,
          product_name: args.product.name,
          sku: args.product.sku ?? null,
          unit: args.product.unit ?? "kg",
          category: args.product.category ?? "Övrigt",
          cost_price: Number(args.product.cost_price) || 0,
          counted_qty_kg: args.quantity,
          checked: true,
          note: args.note ?? null,
          sort_order: count ?? 0,
        });
        if (error) throw error;
      }
      await refreshTotals(sheetId);
      return sheetId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-report"] });
    },
  });
}

export function useRemoveStockReportLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ lineId, sheetId }: { lineId: string; sheetId: string }) => {
      const { error } = await supabase.from("daily_stock_sheet_lines").delete().eq("id", lineId);
      if (error) throw error;
      await refreshTotals(sheetId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-report"] });
    },
  });
}

/**
 * Lagerrapporten är sanningen om butikens lager.
 *
 * När rapporten skickas in sätts saldot på butikens inventeringsplats till
 * exakt de mängder butiken skrivit, och allt annat som ligger kvar på platsen
 * nollställs — rapporten är hela lagret, inte ett tillägg. Skrivningen går
 * genom stock_movements (setBalance), så varje ändring är spårbar.
 */
export async function applyStockReportToStock(sheetId: string) {
  const { data: sheet, error: sheetErr } = await supabase
    .from("daily_stock_sheets")
    .select("id, store_id, sheet_date")
    .eq("id", sheetId)
    .maybeSingle();
  if (sheetErr) throw sheetErr;
  if (!sheet) throw new Error("Lagerrapporten kunde inte läsas.");

  const { data: store, error: storeErr } = await supabase
    .from("stores")
    .select("name, inventory_location_id")
    .eq("id", (sheet as any).store_id)
    .maybeSingle();
  if (storeErr) throw storeErr;
  const locationId = (store as any)?.inventory_location_id as string | null | undefined;
  if (!locationId) {
    throw new Error(
      `${(store as any)?.name || "Butiken"} har ingen utpekad inventeringsplats. ` +
        "Ange den under Inställningar → Lagerplatser innan lagerrapporten skickas in.",
    );
  }
  const { data: loc, error: locErr } = await supabase
    .from("storage_locations")
    .select("id, store_id")
    .eq("id", locationId)
    .maybeSingle();
  if (locErr) throw locErr;
  if (!loc || (loc as any).store_id !== (sheet as any).store_id) {
    throw new Error(
      "Butikens inventeringsplats finns inte längre, eller tillhör en annan butik. " +
        "Rätta den under Inställningar → Lagerplatser.",
    );
  }

  const { data: lineRows, error: lineErr } = await supabase
    .from("daily_stock_sheet_lines")
    .select("product_id, counted_qty_kg, cost_price")
    .eq("sheet_id", sheetId);
  if (lineErr) throw lineErr;

  const reported = new Map<string, { qty: number; cost: number | null }>();
  for (const r of lineRows || []) {
    const pid = (r as any).product_id as string | null;
    if (!pid) continue;
    reported.set(pid, {
      qty: Number((r as any).counted_qty_kg) || 0,
      cost: Number((r as any).cost_price) || null,
    });
  }

  const note = `Lagerrapport ${(sheet as any).sheet_date}`;
  let changed = 0;

  for (const [productId, line] of reported) {
    const movement = await setBalance({
      productId,
      locationId,
      targetQuantityKg: line.qty,
      movementType: "inventering",
      unitCost: line.cost,
      note,
      referenceType: "stock_report",
      referenceId: sheetId,
    });
    if (movement) changed += 1;
  }

  // Allt som inte står i rapporten finns inte i butiken — nollställs.
  const existing = await balancesAtLocation(locationId);
  for (const row of existing) {
    if (reported.has(row.productId)) continue;
    const movement = await setBalance({
      productId: row.productId,
      locationId,
      targetQuantityKg: 0,
      movementType: "inventering",
      note: `${note} — saknas i rapporten`,
      referenceType: "stock_report",
      referenceId: sheetId,
    });
    if (movement) changed += 1;
  }

  return { locationId, reportedCount: reported.size, changed };
}

export function useSubmitStockReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sheetId, closedBy }: { sheetId: string; closedBy: string }) => {
      await refreshTotals(sheetId);
      const { error } = await supabase
        .from("daily_stock_sheets")
        .update({
          status: "godkand",
          closed_by: closedBy,
          closed_at: new Date().toISOString(),
        })
        .eq("id", sheetId);
      if (error) throw error;
      // Rapportens värden blir lagret direkt vid inskickning.
      return await applyStockReportToStock(sheetId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-report"] });
      qc.invalidateQueries({ queryKey: ["stock-report-archive"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["product_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

/** Öppnar en inskickad rapport igen (rättning samma dag). */
export function useReopenStockReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sheetId: string) => {
      const { error } = await supabase
        .from("daily_stock_sheets")
        .update({ status: "utkast", closed_by: null, closed_at: null })
        .eq("id", sheetId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-report"] });
      qc.invalidateQueries({ queryKey: ["stock-report-archive"] });
    },
  });
}
