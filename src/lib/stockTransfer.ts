import { supabase } from "@/integrations/supabase/client";
import { recordMovements, transferStock, currentBalance } from "@/lib/stockLedger";

const TRANSPORTLAGER_NAME = "Transportlager";

/**
 * Ordertaggade transportlagerrader finns inte längre som egna saldorader.
 * Istället bokförs varje flytt som overforing_ut + overforing_in i
 * stock_movements med reference_type = 'shop_order' och reference_id = orderId.
 * Kvarvarande kvantitet per order räknas fram ur loggen.
 */
const REF_TYPE = "shop_order";

async function getTransportlagerId(): Promise<string | null> {
  const { data } = await supabase
    .from("storage_locations")
    .select("id")
    .eq("name", TRANSPORTLAGER_NAME)
    .limit(1);
  return data?.[0]?.id || null;
}

async function getRawLagerId(storeId: string): Promise<string | null> {
  const { data } = await supabase
    .from("storage_locations")
    .select("id, name")
    .eq("store_id", storeId)
    .ilike("name", "Raw%")
    .limit(1);
  return data?.[0]?.id || null;
}

/** Nettokvantitet per produkt som ligger på transportlagret för en given order. */
export async function transportBalanceForOrder(
  orderId: string,
  transportId: string,
): Promise<Record<string, number>> {
  const { data } = await supabase
    .from("stock_movements")
    .select("product_id, quantity_kg")
    .eq("location_id", transportId)
    .eq("reference_type", REF_TYPE)
    .eq("reference_id", orderId);

  const acc: Record<string, number> = {};
  for (const row of data || []) {
    const key = (row as any).product_id as string;
    acc[key] = (acc[key] || 0) + Number((row as any).quantity_kg || 0);
  }
  for (const key of Object.keys(acc)) {
    acc[key] = Math.round(acc[key] * 1000) / 1000;
    if (acc[key] <= 0) delete acc[key];
  }
  return acc;
}

/**
 * När en order markeras "Skickad": flytta orderns produkter från butikens
 * Pre-lager (och Grossist Flytande som reserv) till Transportlager.
 */
export async function moveStockToTransport(orderId: string) {
  const transportId = await getTransportlagerId();
  if (!transportId) {
    console.error("Transportlager not found");
    return;
  }

  const { data: order } = await supabase
    .from("shop_orders")
    .select("store_id, shop_order_lines(product_id, quantity_delivered, quantity_ordered)")
    .eq("id", orderId)
    .single();

  if (!order?.store_id || !order.shop_order_lines?.length) return;

  const { data: preLocations } = await supabase
    .from("storage_locations")
    .select("id")
    .eq("store_id", order.store_id)
    .ilike("name", "Pre-%");
  const preLocationIds = (preLocations || []).map((l) => l.id);

  const { data: gfLocs } = await supabase
    .from("storage_locations")
    .select("id")
    .ilike("name", "Grossist Flytande")
    .limit(1);
  const gfLocId = gfLocs?.[0]?.id || null;

  for (const line of order.shop_order_lines) {
    let remaining = Number(line.quantity_delivered || line.quantity_ordered) || 0;
    if (remaining <= 0) continue;

    // Källor i prioritetsordning: Pre-lager, sedan Grossist Flytande.
    const sourceIds = [...preLocationIds, ...(gfLocId ? [gfLocId] : [])];
    if (!sourceIds.length) continue;

    const { data: stocks } = await supabase
      .from("product_stock_locations")
      .select("location_id, quantity, avg_cost")
      .eq("product_id", line.product_id)
      .in("location_id", sourceIds)
      .gt("quantity", 0);

    const ordered = (stocks || []).sort(
      (a: any, b: any) => sourceIds.indexOf(a.location_id) - sourceIds.indexOf(b.location_id),
    );

    for (const stock of ordered) {
      if (remaining <= 0) break;
      const available = Number((stock as any).quantity) || 0;
      const moveQty = Math.min(remaining, available);
      if (moveQty <= 0) continue;

      await transferStock({
        productId: line.product_id,
        fromLocationId: (stock as any).location_id,
        toLocationId: transportId,
        quantityKg: moveQty,
        unitCost: Number((stock as any).avg_cost) || null,
        referenceType: REF_TYPE,
        referenceId: orderId,
        note: "Order skickad till transportlager",
      });
      remaining -= moveQty;
    }

    if (remaining > 0) {
      console.warn(
        `moveStockToTransport: otillräckligt saldo för produkt ${line.product_id}, ${remaining} kg kunde inte flyttas`,
      );
    }
  }
}

/**
 * När butiken godkänner inleveransen: flytta orderns kvantiteter från
 * Transportlager till butikens Raw-lager.
 */
export async function moveStockToRawLager(
  orderId: string,
  storeId: string,
  unitCostByProductId?: Record<string, number>,
) {
  const transportId = await getTransportlagerId();
  if (!transportId) {
    console.error("Transportlager not found");
    return;
  }

  const rawLagerId = await getRawLagerId(storeId);
  if (!rawLagerId) {
    console.error("Raw Lager not found for store", storeId);
    return;
  }

  const balances = await transportBalanceForOrder(orderId, transportId);
  const productIds = Object.keys(balances);
  if (!productIds.length) {
    console.warn(
      `moveStockToRawLager: inga transportlagerrörelser hittades för order ${orderId}.`,
    );
    return;
  }

  for (const productId of productIds) {
    const qty = balances[productId];
    if (qty <= 0) continue;
    const cost =
      unitCostByProductId?.[productId] ??
      (await currentBalance(productId, transportId)).avgCost ??
      null;

    await transferStock({
      productId,
      fromLocationId: transportId,
      toLocationId: rawLagerId,
      quantityKg: qty,
      unitCost: cost || null,
      referenceType: REF_TYPE,
      referenceId: orderId,
      note: "Inleverans godkänd i butik",
    });
  }
}

/** Bokför en manuell justering (endast via loggen). */
export async function adjustStock(params: {
  productId: string;
  locationId: string;
  quantityKg: number;
  note?: string;
}) {
  await recordMovements([
    {
      productId: params.productId,
      locationId: params.locationId,
      quantityKg: params.quantityKg,
      movementType: "justering",
      note: params.note ?? null,
    },
  ]);
}
