import { supabase } from "@/integrations/supabase/client";
import { recordMovements, currentStaffId, currentBalance } from "@/lib/stockLedger";
import { assertActiveLocation } from "@/lib/locations";
import { createWasteReport } from "@/lib/waste";

/**
 * Överföringsordrar är ett lager ovanpå rörelseloggen, aldrig en egen skrivväg.
 * Saldon ändras först när MOTTAGAREN godkänt inleveransen; däremellan ligger
 * varan "under transport" och räknas på avsändarens saldo.
 *
 * Flödesreglerna och underlagsspärren ligger i databasen (stock_flow_rules +
 * triggern enforce_transfer_flow), inte här.
 */

export type TransferStatus =
  | "skapad"
  | "plocklista_utskriven"
  | "godkand_utleverans"
  | "under_transport"
  | "delvis_levererad"
  | "godkand_inleverans"
  | "avvisad";

export type SourceDocumentType =
  | "purchase_report"
  | "production_order"
  | "shop_order"
  | "return_order"
  | "internal_transfer"
  | "waste_report";

export interface TransferLineInput {
  productId: string;
  lotId?: string | null;
  quantityOrdered: number;
  unitCost?: number | null;
  sortOrder?: number;
}

function nextOrderNumber() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate(),
  ).padStart(2, "0")}`;
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `FS-${stamp}-${rand}`;
}

/** Skapar en överföringsorder med rader. Databasen avgör om flödet är tillåtet. */
export async function createTransferOrder(params: {
  fromLocationId: string;
  toLocationId: string;
  sourceDocumentType?: SourceDocumentType | null;
  sourceDocumentId?: string | null;
  reason?: string | null;
  lines: TransferLineInput[];
}) {
  await assertActiveLocation(params.fromLocationId);
  await assertActiveLocation(params.toLocationId);

  const lines = params.lines.filter((l) => l.productId && Number(l.quantityOrdered) > 0);
  if (!lines.length) throw new Error("Överföringen saknar rader med kvantitet.");

  const staffId = await currentStaffId();
  const { data: order, error } = await supabase
    .from("transfer_orders" as any)
    .insert({
      order_number: nextOrderNumber(),
      from_location_id: params.fromLocationId,
      to_location_id: params.toLocationId,
      source_document_type: params.sourceDocumentType ?? null,
      source_document_id: params.sourceDocumentId ?? null,
      reason: params.reason ?? null,
      status: "skapad",
      created_by: staffId,
    } as any)
    .select()
    .single();
  if (error) throw new Error(error.message);

  const { error: lineError } = await supabase.from("transfer_order_lines" as any).insert(
    lines.map((l, i) => ({
      transfer_order_id: (order as any).id,
      product_id: l.productId,
      lot_id: l.lotId ?? null,
      quantity_ordered: l.quantityOrdered,
      unit_cost: l.unitCost ?? null,
      sort_order: l.sortOrder ?? i,
    })) as any,
  );
  if (lineError) throw new Error(lineError.message);

  return order as any;
}

/** Markerar att plocklistan skrivits ut. Papperet är alltid en kopia av systemet. */
export async function markPicklistPrinted(orderId: string) {
  const { error } = await supabase
    .from("transfer_orders" as any)
    .update({ status: "plocklista_utskriven", picklist_printed_at: new Date().toISOString() } as any)
    .eq("id", orderId)
    .in("status", ["skapad", "plocklista_utskriven"]);
  if (error) throw new Error(error.message);
}

/** Registrerar plockad kvantitet per rad. Avvikelse kräver orsak. */
export async function registerPicking(
  orderId: string,
  lines: { id: string; quantityPicked: number; deviationReason?: string | null }[],
) {
  const { data: existing, error: readError } = await supabase
    .from("transfer_order_lines" as any)
    .select("id, quantity_ordered")
    .eq("transfer_order_id", orderId);
  if (readError) throw new Error(readError.message);

  const orderedById = new Map(
    ((existing ?? []) as any[]).map((l) => [l.id as string, Number(l.quantity_ordered || 0)]),
  );

  for (const line of lines) {
    const ordered = orderedById.get(line.id) ?? 0;
    const picked = Number(line.quantityPicked || 0);
    if (picked !== ordered && !line.deviationReason) {
      throw new Error("Avvikelse mot beställd kvantitet kräver orsak.");
    }
    const { error } = await supabase
      .from("transfer_order_lines" as any)
      .update({
        quantity_picked: picked,
        pick_deviation_reason: picked === ordered ? null : line.deviationReason ?? null,
      } as any)
      .eq("id", line.id);
    if (error) throw new Error(error.message);
  }

  const staffId = await currentStaffId();
  const { error } = await supabase
    .from("transfer_orders" as any)
    .update({ picked_by: staffId, picked_at: new Date().toISOString() } as any)
    .eq("id", orderId);
  if (error) throw new Error(error.message);
}

/**
 * Avsändaren godkänner utleveransen. Skickad kvantitet = plockad kvantitet.
 * Inga saldon rörs här — varan går till "under transport".
 */
export async function approveOutbound(orderId: string) {
  const { data: lines, error: readError } = await supabase
    .from("transfer_order_lines" as any)
    .select("id, quantity_ordered, quantity_picked, pick_deviation_reason")
    .eq("transfer_order_id", orderId);
  if (readError) throw new Error(readError.message);

  const rows = (lines ?? []) as any[];
  if (!rows.length) throw new Error("Överföringen saknar rader.");
  if (rows.some((l) => l.quantity_picked === null)) {
    throw new Error("Registrera plockningen innan utleveransen godkänns.");
  }

  for (const line of rows) {
    const shipped = Number(line.quantity_picked || 0);
    const ordered = Number(line.quantity_ordered || 0);
    if (shipped !== ordered && !line.pick_deviation_reason) {
      throw new Error("Alla avvikelser mot beställd kvantitet måste ha orsak.");
    }
    const { error } = await supabase
      .from("transfer_order_lines" as any)
      .update({
        quantity_shipped: shipped,
        ship_deviation_reason: shipped === ordered ? null : line.pick_deviation_reason,
      } as any)
      .eq("id", line.id);
    if (error) throw new Error(error.message);
  }

  const staffId = await currentStaffId();
  const { error } = await supabase
    .from("transfer_orders" as any)
    .update({
      status: "under_transport",
      approved_out_by: staffId,
      approved_out_at: new Date().toISOString(),
    } as any)
    .eq("id", orderId);
  if (error) throw new Error(error.message);
}

/**
 * Mottagaren godkänner inleveransen. Först nu bokförs rörelserna:
 * mottagen kvantitet flyttas, och differensen mot skickat bokförs som svinn
 * på AVSÄNDARENS lager.
 */
export async function approveInbound(
  orderId: string,
  lines: { id: string; quantityReceived: number; deviationReason?: string | null }[],
) {
  const { data: order, error: orderError } = await supabase
    .from("transfer_orders" as any)
    .select("id, from_location_id, to_location_id, status, order_number")
    .eq("id", orderId)
    .single();
  if (orderError) throw new Error(orderError.message);

  const fromId = (order as any).from_location_id as string;
  const toId = (order as any).to_location_id as string;
  await assertActiveLocation(fromId);
  await assertActiveLocation(toId);

  const { data: dbLines, error: readError } = await supabase
    .from("transfer_order_lines" as any)
    .select("id, product_id, lot_id, quantity_shipped, unit_cost")
    .eq("transfer_order_id", orderId);
  if (readError) throw new Error(readError.message);

  const byId = new Map(((dbLines ?? []) as any[]).map((l) => [l.id as string, l]));
  const movements: Parameters<typeof recordMovements>[0] = [];
  const shortages: { productId: string; lotId: string | null; qty: number; unitCost: number | null }[] = [];

  for (const input of lines) {
    const line = byId.get(input.id);
    if (!line) continue;
    const shipped = Number(line.quantity_shipped || 0);
    const received = Number(input.quantityReceived || 0);
    if (received !== shipped && !input.deviationReason) {
      throw new Error("Avvikelse mot skickad kvantitet kräver orsak.");
    }

    const cost =
      line.unit_cost ?? (await currentBalance(line.product_id, fromId)).avgCost ?? null;

    const { error } = await supabase
      .from("transfer_order_lines" as any)
      .update({
        quantity_received: received,
        receive_deviation_reason: received === shipped ? null : input.deviationReason ?? null,
      } as any)
      .eq("id", input.id);
    if (error) throw new Error(error.message);

    if (received > 0) {
      movements.push(
        {
          productId: line.product_id,
          locationId: fromId,
          quantityKg: received,
          movementType: "overforing_ut",
          lotId: line.lot_id,
          unitCost: cost || null,
          referenceType: "transfer_order",
          referenceId: orderId,
          note: `Utleverans ${(order as any).order_number ?? ""}`.trim(),
        },
        {
          productId: line.product_id,
          locationId: toId,
          quantityKg: received,
          movementType: "overforing_in",
          lotId: line.lot_id,
          unitCost: cost || null,
          referenceType: "transfer_order",
          referenceId: orderId,
          note: `Inleverans godkänd ${(order as any).order_number ?? ""}`.trim(),
        },
      );
    }

    const missing = Math.round((shipped - received) * 1000) / 1000;
    if (missing > 0) {
      shortages.push({
        productId: line.product_id,
        lotId: line.lot_id ?? null,
        qty: missing,
        unitCost: cost || null,
      });
    }
  }

  if (movements.length) await recordMovements(movements);

  // Differensen bokförs som svinn på avsändarens lager, inte mottagarens.
  if (shortages.length) {
    await createWasteReport({
      locationId: fromId,
      reason: "saknas",
      comment: `Differens vid inleverans av ${(order as any).order_number ?? "överföring"}`,
      transferOrderId: orderId,
      lines: shortages.map((s) => ({
        productId: s.productId,
        lotId: s.lotId,
        quantityKg: s.qty,
        unitCost: s.unitCost,
      })),
    });
  }

  const { data: allLines } = await supabase
    .from("transfer_order_lines" as any)
    .select("quantity_ordered, quantity_received")
    .eq("transfer_order_id", orderId);
  const outstanding = ((allLines ?? []) as any[]).some(
    (l) => Number(l.quantity_received || 0) < Number(l.quantity_ordered || 0),
  );

  const staffId = await currentStaffId();
  const { error: statusError } = await supabase
    .from("transfer_orders" as any)
    .update({
      status: outstanding ? "delvis_levererad" : "godkand_inleverans",
      approved_in_by: staffId,
      approved_in_at: new Date().toISOString(),
    } as any)
    .eq("id", orderId);
  if (statusError) throw new Error(statusError.message);

  return { outstanding };
}

/** Avvisar en överföring. Inga saldon har hunnit ändras. */
export async function rejectTransfer(orderId: string, reason: string) {
  if (!reason?.trim()) throw new Error("Ange orsak till att leveransen avvisas.");
  const { error } = await supabase
    .from("transfer_orders" as any)
    .update({ status: "avvisad", deviation_note: reason } as any)
    .eq("id", orderId);
  if (error) throw new Error(error.message);
}
