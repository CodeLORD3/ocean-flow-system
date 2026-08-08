import { supabase } from "@/integrations/supabase/client";
import { grossistStoreId, inkopslagerId, grossistlagerId } from "@/lib/locations";
import { lotBalancesAtLocation } from "@/lib/stockLedger";
import {
  createTransferOrder,
  registerPicking,
  approveOutbound,
  approveInbound,
} from "@/lib/transferOrders";

/**
 * Fysisk ankomstregistrering: varan flyttas från INKÖPSLAGER till
 * GROSSISTLAGER. Underlaget är följesedeln (purchase_report), och avvikelse
 * mot beställt bokförs som svinn på inköpslagret via överföringsflödet.
 */

export interface ArrivalLineInput {
  productId: string;
  lotId?: string | null;
  quantityExpected: number;
  quantityReceived: number;
  unitCost?: number | null;
  deviationReason?: string | null;
}

/** Kvarvarande partier i inköpslagret för en följesedel. */
export async function pendingArrivalLines(reportId: string) {
  const purchaseLocationId = await inkopslagerId(await grossistStoreId());

  const { data, error } = await supabase
    .from("purchase_report_lines")
    .select("id, product_id, quantity, unit_price, lot_id, product_name")
    .eq("report_id", reportId)
    .not("lot_id", "is", null);
  if (error) throw error;

  const rows = (data ?? []) as any[];
  const result: (ArrivalLineInput & { lineId: string; productName: string | null })[] = [];
  // Flera rader kan peka på samma parti (GFA-klubbslag). Partiet ligger som EN
  // rad i inköpslagret och får bara ankomstregistreras en gång — annars räknas
  // saldot dubbelt och överföringen får en rad utan plockad kvantitet.
  const seen = new Set<string>();

  for (const row of rows) {
    const key = `${row.product_id}|${row.lot_id}`;
    if (seen.has(key)) continue;
    const lots = await lotBalancesAtLocation(row.product_id, purchaseLocationId);
    const available = lots.find((l) => l.lotId === row.lot_id)?.quantityKg ?? 0;
    if (available <= 0) continue;
    seen.add(key);
    result.push({
      lineId: row.id,
      productName: row.product_name ?? null,
      productId: row.product_id,
      lotId: row.lot_id,
      quantityExpected: available,
      quantityReceived: available,
      unitCost: row.unit_price ?? null,
    });
  }

  return result;
}

/**
 * Registrerar ankomsten. Skapar en spårbar överföringsorder med följesedeln
 * som underlag och bokför rörelserna vid godkänd inleverans.
 */
export async function registerPurchaseArrival(params: {
  reportId: string;
  lines: ArrivalLineInput[];
}) {
  const storeId = await grossistStoreId();
  const fromId = await inkopslagerId(storeId);
  const toId = await grossistlagerId();

  const lines = params.lines.filter((l) => Number(l.quantityExpected) > 0);
  if (!lines.length) throw new Error("Inget kvar att ankomstregistrera på följesedeln.");

  const order = await createTransferOrder({
    fromLocationId: fromId,
    toLocationId: toId,
    sourceDocumentType: "purchase_report",
    sourceDocumentId: params.reportId,
    reason: "Ankomstregistrering av följesedel",
    lines: lines.map((l) => ({
      productId: l.productId,
      lotId: l.lotId ?? null,
      quantityOrdered: l.quantityExpected,
      unitCost: l.unitCost ?? null,
    })),
  });

  const { data: created, error } = await supabase
    .from("transfer_order_lines" as any)
    .select("id, product_id, lot_id, quantity_ordered")
    .eq("transfer_order_id", (order as any).id);
  if (error) throw new Error(error.message);

  const orderLines = (created ?? []) as any[];
  const match = (l: ArrivalLineInput) =>
    orderLines.find(
      (o) => o.product_id === l.productId && (o.lot_id ?? null) === (l.lotId ?? null),
    );

  await registerPicking(
    (order as any).id,
    lines.map((l) => {
      const row = match(l);
      return {
        id: row?.id as string,
        quantityPicked: Number(l.quantityReceived || 0),
        deviationReason: l.deviationReason ?? null,
      };
    }),
  );

  await approveOutbound((order as any).id);

  await approveInbound(
    (order as any).id,
    lines.map((l) => {
      const row = match(l);
      return {
        id: row?.id as string,
        quantityReceived: Number(l.quantityReceived || 0),
        deviationReason: l.deviationReason ?? null,
      };
    }),
  );

  await supabase
    .from("purchase_reports")
    .update({ arrived_at: new Date().toISOString() } as any)
    .eq("id", params.reportId);

  return { transferOrderId: (order as any).id };
}
