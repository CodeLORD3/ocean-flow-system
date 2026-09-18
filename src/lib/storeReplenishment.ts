import { supabase } from "@/integrations/supabase/client";
import { recordMovements, currentStaffId, lotUnitCost, currentBalance } from "@/lib/stockLedger";
import {
  butikslagerId,
  grossistlagerId,
  grossistStoreId,
  leveranslagerId,
  tillverkningslagerId,
} from "@/lib/locations";

/**
 * Butikens påfyllning från grossisten eller produktionen.
 *
 * Beställningen är ett underlag — inga lagerrörelser skapas när personalen
 * trycker "Beställ" eller när grossisten bekräftar. Rörelser skapas bara på
 * två ställen: vid avsändning (ut från grossistlagret in på butikens
 * transportlager) och vid mottagning (ut från transportlagret in på butikens
 * eget lager). Allt går genom stock_movements, aldrig direkt på saldot.
 */

const db = supabase as any;

export type Supplier = "grossist" | "produktion";

export type OrderStatus =
  | "utkast"
  | "skickad"
  | "bekraftad"
  | "avsand"
  | "mottagen"
  | "delvis_mottagen"
  | "makulerad";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  utkast: "Utkast",
  skickad: "Skickad",
  bekraftad: "Bekräftad",
  avsand: "Avsänd",
  mottagen: "Mottagen",
  delvis_mottagen: "Delvis mottagen",
  makulerad: "Makulerad",
};

export const SUPPLIER_LABEL: Record<Supplier, string> = {
  grossist: "Grossisten i Göteborg",
  produktion: "Produktionen",
};

export interface ReplenishLine {
  id: string;
  order_id: string;
  product_id: string;
  quantity_ordered: number;
  unit: string;
  source: "inventering" | "manuell";
  comment: string | null;
  line_status: "ny" | "bekraftad" | "avvisad" | "plockad" | "mottagen";
  rejection_reason: string | null;
  quantity_confirmed: number | null;
  quantity_shipped: number | null;
  quantity_received: number | null;
  receive_deviation_note: string | null;
  dispatch_key: string | null;
  created_by_name: string | null;
  products?: { name: string; unit: string; image_url: string | null } | null;
}

export interface ReplenishOrder {
  id: string;
  order_number: string;
  store_id: string;
  supplier: Supplier;
  wanted_date: string;
  status: OrderStatus;
  intercompany: boolean;
  created_by_name: string | null;
  sent_at: string | null;
  auto_sent: boolean;
  stores?: { name: string; legal_entity_id: string } | null;
  store_replenishment_lines?: ReplenishLine[];
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

function orderNumber(storeSlugish: string) {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate(),
  ).padStart(2, "0")}`;
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `BB-${storeSlugish}-${stamp}-${rand}`;
}

/** Imorgon i svensk tid — standardleveransdag för "Beställ till imorgon". */
export function tomorrowSe(): string {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Stockholm" }),
  );
  now.setDate(now.getDate() + 1);
  return now.toISOString().slice(0, 10);
}

/**
 * Hämtar butikens öppna utkast för dagen, och skapar det vid första trycket.
 * Ett utkast per butik, leverantör och leveransdag — alla tryck samlas där.
 */
export async function getOrCreateDraft(params: {
  storeId: string;
  supplier?: Supplier;
  wantedDate?: string;
  createdByName?: string | null;
}): Promise<ReplenishOrder> {
  const supplier = params.supplier ?? "grossist";
  const wantedDate = params.wantedDate ?? tomorrowSe();

  const { data: existing, error } = await db
    .from("store_replenishment_orders")
    .select("*")
    .eq("store_id", params.storeId)
    .eq("supplier", supplier)
    .eq("wanted_date", wantedDate)
    .eq("status", "utkast")
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing as ReplenishOrder;

  const staffId = await currentStaffId();
  const { data, error: insErr } = await db
    .from("store_replenishment_orders")
    .insert({
      order_number: orderNumber(params.storeId.slice(0, 4)),
      store_id: params.storeId,
      supplier,
      wanted_date: wantedDate,
      status: "utkast",
      created_by: staffId,
      created_by_name: params.createdByName ?? null,
    })
    .select("*")
    .single();
  if (insErr) throw insErr;
  return data as ReplenishOrder;
}

/** Lägger en vara på utkastet. Ingen lagerrörelse skapas här. */
export async function addDraftLine(params: {
  storeId: string;
  productId: string;
  quantity: number;
  unit: string;
  comment?: string | null;
  source?: "inventering" | "manuell";
  supplier?: Supplier;
  wantedDate?: string;
  staffName?: string | null;
}) {
  if (!(params.quantity > 0)) throw new Error("Ange en mängd större än noll.");
  const order = await getOrCreateDraft({
    storeId: params.storeId,
    supplier: params.supplier,
    wantedDate: params.wantedDate,
    createdByName: params.staffName,
  });
  const staffId = await currentStaffId();
  const { error } = await db.from("store_replenishment_lines").upsert(
    {
      order_id: order.id,
      product_id: params.productId,
      quantity_ordered: round3(params.quantity),
      unit: params.unit || "kg",
      comment: params.comment ?? null,
      source: params.source ?? "inventering",
      created_by: staffId,
      created_by_name: params.staffName ?? null,
    },
    { onConflict: "order_id,product_id" },
  );
  if (error) throw error;
  return order;
}

/** Ändrar mängd på en rad. Går bara medan ordern är utkast. */
export async function updateDraftLine(lineId: string, quantity: number, comment?: string | null) {
  const { error } = await db
    .from("store_replenishment_lines")
    .update({ quantity_ordered: round3(quantity), comment: comment ?? null })
    .eq("id", lineId);
  if (error) throw error;
}

export async function removeDraftLine(lineId: string) {
  const { error } = await db.from("store_replenishment_lines").delete().eq("id", lineId);
  if (error) throw error;
}

/** Skickar beställningen till grossisten/produktionen. */
export async function sendOrder(orderId: string) {
  const staffId = await currentStaffId();
  const { data: lines } = await db
    .from("store_replenishment_lines")
    .select("id")
    .eq("order_id", orderId);
  if (!(lines || []).length) throw new Error("Beställningen är tom.");
  const { data, error } = await db
    .from("store_replenishment_orders")
    .update({ status: "skickad", sent_at: new Date().toISOString(), sent_by: staffId })
    .eq("id", orderId)
    .eq("status", "utkast")
    .select("id");
  if (error) throw error;
  if (!(data || []).length) throw new Error("Beställningen är redan skickad.");
}

/** Automatskick: skickar utkast med rader när butikens tid passerats. */
export async function runAutoSend(): Promise<number> {
  const { data, error } = await db.rpc("store_replenishment_auto_send");
  if (error) return 0;
  return Number(data) || 0;
}

/** Grossisten bekräftar eller avvisar rader. Inga rörelser skapas. */
export async function confirmOrder(
  orderId: string,
  lines: { id: string; confirmed: boolean; quantity?: number; reason?: string | null }[],
) {
  for (const l of lines) {
    if (!l.confirmed && !l.reason?.trim())
      throw new Error("En avvisad rad måste ha en orsak.");
    const { error } = await db
      .from("store_replenishment_lines")
      .update(
        l.confirmed
          ? {
              line_status: "bekraftad",
              quantity_confirmed: round3(Number(l.quantity || 0)),
              rejection_reason: null,
            }
          : { line_status: "avvisad", quantity_confirmed: 0, rejection_reason: l.reason },
      )
      .eq("id", l.id);
    if (error) throw error;
  }
  const { error } = await db
    .from("store_replenishment_orders")
    .update({ status: "bekraftad", confirmed_at: new Date().toISOString() })
    .eq("id", orderId)
    .in("status", ["skickad", "bekraftad"]);
  if (error) throw error;
}

/** Sparar plock per parti med vägd vikt. Inga rörelser skapas. */
export async function savePicks(
  lineId: string,
  picks: { lotId: string | null; quantity: number }[],
) {
  const { error: delErr } = await db
    .from("store_replenishment_picks")
    .delete()
    .eq("line_id", lineId)
    .eq("dispatched", false);
  if (delErr) throw delErr;
  const rows = picks
    .filter((p) => Number(p.quantity) > 0)
    .map((p) => ({ line_id: lineId, lot_id: p.lotId, quantity: round3(p.quantity) }));
  if (rows.length) {
    const { error } = await db.from("store_replenishment_picks").insert(rows);
    if (error) throw error;
  }
  const { error: statusErr } = await db
    .from("store_replenishment_lines")
    .update({ line_status: rows.length ? "plockad" : "bekraftad" })
    .eq("id", lineId);
  if (statusErr) throw statusErr;
}

async function supplierLocationId(supplier: Supplier) {
  return supplier === "produktion" ? tillverkningslagerId() : grossistlagerId();
}

/**
 * Avsändning. Här skapas de första rörelserna: ut från grossistens lager och
 * in på butikens transportlager, en rörelse per parti och rad, med
 * ordernummer som referens. Samma order kan inte avsändas två gånger —
 * dispatch_key på raden är unik i databasen.
 */
export async function dispatchOrder(orderId: string) {
  const { data: order, error } = await db
    .from("store_replenishment_orders")
    .select("id, order_number, store_id, supplier, status")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  if (!order) throw new Error("Beställningen kunde inte läsas.");
  if (order.status === "avsand" || order.status === "mottagen" || order.status === "delvis_mottagen")
    throw new Error("Leveransen är redan avsänd.");
  if (order.status === "makulerad") throw new Error("Makulerad beställning kan inte avsändas.");
  if (order.status !== "bekraftad") throw new Error("Bekräfta beställningen först.");

  const fromId = await supplierLocationId(order.supplier as Supplier);
  const transitId = await leveranslagerId(order.store_id);

  const { data: lines, error: lineErr } = await db
    .from("store_replenishment_lines")
    .select("id, product_id, line_status, dispatch_key, store_replenishment_picks(id, lot_id, quantity, dispatched)")
    .eq("order_id", orderId);
  if (lineErr) throw lineErr;

  const movements: Parameters<typeof recordMovements>[0] = [];
  let shippedLines = 0;

  for (const line of (lines || []) as any[]) {
    if (line.line_status === "avvisad") continue;
    const picks = (line.store_replenishment_picks || []).filter((p: any) => !p.dispatched);
    if (!picks.length) continue;

    // Idempotensnyckel: ordernummer + rad. Andra försöket faller på unikheten.
    const key = `${order.order_number}:${line.id}`;
    const { data: claimed, error: claimErr } = await db
      .from("store_replenishment_lines")
      .update({ dispatch_key: key })
      .eq("id", line.id)
      .is("dispatch_key", null)
      .select("id");
    if (claimErr) throw claimErr;
    if (!(claimed || []).length) continue;

    let shipped = 0;
    for (const p of picks) {
      const qty = Number(p.quantity) || 0;
      if (!qty) continue;
      const cost =
        (p.lot_id ? await lotUnitCost(p.lot_id) : null) ??
        (await currentBalance(line.product_id, fromId)).avgCost ??
        null;
      const shared = {
        productId: line.product_id,
        lotId: p.lot_id,
        unitCost: cost || null,
        referenceType: "store_replenishment_order",
        referenceId: orderId,
        note: `Avsänd leverans ${order.order_number}`,
      };
      movements.push(
        { ...shared, locationId: fromId, quantityKg: qty, movementType: "overforing_ut" },
        { ...shared, locationId: transitId, quantityKg: qty, movementType: "overforing_in" },
      );
      shipped += qty;
    }
    await db
      .from("store_replenishment_lines")
      .update({ quantity_shipped: round3(shipped), line_status: "plockad" })
      .eq("id", line.id);
    await db
      .from("store_replenishment_picks")
      .update({ dispatched: true })
      .eq("line_id", line.id)
      .eq("dispatched", false);
    shippedLines += 1;
  }

  if (!shippedLines) throw new Error("Ingen rad är plockad — inget att skicka.");
  if (movements.length) await recordMovements(movements);

  const { error: upErr } = await db
    .from("store_replenishment_orders")
    .update({ status: "avsand", dispatched_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", "bekraftad");
  if (upErr) throw upErr;

  return { lines: shippedLines, movements: movements.length };
}

/**
 * Mottagning i butiken. Rörelserna går ut från transportlagret och in på
 * butikens eget lager med den vägda mottagna vikten. Avvikelsen mot avsänd
 * vikt loggas på raden och lämnas kvar på transportlagret som differens.
 */
export async function receiveOrder(
  orderId: string,
  received: { id: string; quantity: number; note?: string | null }[],
) {
  const { data: order, error } = await db
    .from("store_replenishment_orders")
    .select("id, order_number, store_id, supplier, status, intercompany, stores(legal_entity_id, currency)")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  if (!order) throw new Error("Beställningen kunde inte läsas.");
  if (order.status !== "avsand" && order.status !== "delvis_mottagen")
    throw new Error("Leveransen är inte avsänd ännu.");

  const transitId = await leveranslagerId(order.store_id);
  const storeId = await butikslagerId(order.store_id);

  const { data: lines, error: lineErr } = await db
    .from("store_replenishment_lines")
    .select("id, product_id, quantity_shipped, quantity_ordered, store_replenishment_picks(lot_id, quantity)")
    .eq("order_id", orderId);
  if (lineErr) throw lineErr;
  const byId = new Map(((lines || []) as any[]).map((l) => [l.id as string, l]));

  const movements: Parameters<typeof recordMovements>[0] = [];
  let value = 0;

  for (const input of received) {
    const line = byId.get(input.id);
    if (!line) continue;
    const shipped = Number(line.quantity_shipped) || 0;
    const qty = round3(Number(input.quantity) || 0);
    if (qty <= 0) continue;

    // Partierna följer med raden: vikten fördelas i plockordning.
    const picks = (line.store_replenishment_picks || []) as any[];
    let left = qty;
    const parts = picks.length
      ? picks.map((p) => {
          const take = Math.min(left, Number(p.quantity) || 0);
          left = round3(left - take);
          return { lotId: p.lot_id as string | null, qty: round3(take) };
        })
      : [];
    if (left > 0.0005) parts.push({ lotId: picks[0]?.lot_id ?? null, qty: left });

    for (const part of parts) {
      if (!part.qty) continue;
      const cost =
        (part.lotId ? await lotUnitCost(part.lotId) : null) ??
        (await currentBalance(line.product_id, transitId)).avgCost ??
        null;
      value += (cost || 0) * part.qty;
      const shared = {
        productId: line.product_id,
        lotId: part.lotId,
        unitCost: cost || null,
        referenceType: "store_replenishment_order",
        referenceId: orderId,
        note: `Mottagen leverans ${order.order_number}`,
      };
      movements.push(
        { ...shared, locationId: transitId, quantityKg: part.qty, movementType: "overforing_ut" },
        { ...shared, locationId: storeId, quantityKg: part.qty, movementType: "overforing_in" },
      );
    }

    const deviation = round3(qty - shipped);
    await db
      .from("store_replenishment_lines")
      .update({
        quantity_received: qty,
        line_status: "mottagen",
        receive_deviation_note:
          deviation === 0
            ? null
            : `${deviation > 0 ? "+" : ""}${deviation} mot avsänt${
                input.note ? ` — ${input.note}` : ""
              }`,
      })
      .eq("id", input.id);
  }

  if (movements.length) await recordMovements(movements);

  const { data: after } = await db
    .from("store_replenishment_lines")
    .select("line_status, quantity_shipped, quantity_received")
    .eq("order_id", orderId);
  const outstanding = ((after || []) as any[]).some(
    (l) =>
      l.line_status !== "avvisad" &&
      Number(l.quantity_received || 0) + 0.0005 < Number(l.quantity_shipped || 0),
  );

  await db
    .from("store_replenishment_orders")
    .update({
      status: outstanding ? "delvis_mottagen" : "mottagen",
      received_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  // Internhandel: butiken tillhör ett annat bolag än leverantören.
  const sellerEntity = await supplierLegalEntity();
  const buyerEntity = (order.stores?.legal_entity_id ?? null) as string | null;
  if (sellerEntity && buyerEntity && sellerEntity !== buyerEntity) {
    await db.from("store_replenishment_orders").update({ intercompany: true }).eq("id", orderId);
    await db.from("store_order_invoice_basis").upsert(
      {
        order_id: orderId,
        seller_legal_entity_id: sellerEntity,
        buyer_legal_entity_id: buyerEntity,
        currency: order.stores?.currency || "SEK",
        amount_ex_vat: Math.round(value * 100) / 100,
        note: `Internhandel för ${order.order_number}`,
      },
      { onConflict: "order_id" },
    );
  }

  return { outstanding, movements: movements.length };
}

/** Bolaget som äger grossisten — säljaren vid internhandel. */
async function supplierLegalEntity(): Promise<string | null> {
  const storeId = await grossistStoreId();
  if (!storeId) return null;
  const { data } = await db
    .from("stores")
    .select("legal_entity_id")
    .eq("id", storeId)
    .maybeSingle();
  return (data?.legal_entity_id ?? null) as string | null;
}

/** Makulering. Avsänd leverans kan inte makuleras — den tas emot. */
export async function cancelOrder(orderId: string) {
  const { data, error } = await db
    .from("store_replenishment_orders")
    .update({ status: "makulerad", cancelled_at: new Date().toISOString() })
    .eq("id", orderId)
    .in("status", ["utkast", "skickad", "bekraftad"])
    .select("id");
  if (error) throw error;
  if (!(data || []).length)
    throw new Error("Avsänd leverans kan inte makuleras — ta emot den med avvikelse i stället.");
}
