import { supabase } from "@/integrations/supabase/client";
import {
  recordMovements,
  transferStock,
  currentBalance,
  lotBalancesAtLocation,
  lotBalancesForReference,
} from "@/lib/stockLedger";
import { GROSSIST_FLYTANDE_ID, leveranslagerId, butikslagerId } from "@/lib/locations";


/**
 * Ordertaggade transportlagerrader finns inte längre som egna saldorader.
 * Istället bokförs varje flytt som overforing_ut + overforing_in i
 * stock_movements med reference_type = 'shop_order' och reference_id = orderId.
 * Kvarvarande kvantitet per order räknas fram ur loggen.
 */
const REF_TYPE = "shop_order";

/**
 * Lagerplatser slås upp på nivå. Transportsteget är butikens leveranslager,
 * mottagande plats är butikens egen lagerplats.
 */
async function getTransportlagerId(storeId: string): Promise<string | null> {
  return leveranslagerId(storeId);
}

async function getRawLagerId(storeId: string): Promise<string | null> {
  return butikslagerId(storeId);
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
  const { data: order } = await supabase
    .from("shop_orders")
    .select("store_id, shop_order_lines(product_id, quantity_delivered, quantity_ordered)")
    .eq("id", orderId)
    .single();

  if (!order?.store_id || !order.shop_order_lines?.length) return;

  const transportId = await getTransportlagerId(order.store_id);
  if (!transportId) {
    console.error("Leveranslager not found for store", order.store_id);
    return;
  }

  const gfLocId = GROSSIST_FLYTANDE_ID;


  for (const line of order.shop_order_lines) {
    let remaining = Number(line.quantity_delivered || line.quantity_ordered) || 0;
    if (remaining <= 0) continue;

    // Källa: grossistlagret.
    const sourceIds = gfLocId ? [gfLocId] : [];
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
      if (available <= 0) continue;
      const sourceId = (stock as any).location_id as string;
      const cost = Number((stock as any).avg_cost) || null;

      // Plocka parti för parti (FIFO på bäst före) så partiet följer med flytten.
      const lots = await lotBalancesAtLocation(line.product_id, sourceId);
      const picks: { lotId: string | null; qty: number }[] = [];
      let fromThisSource = Math.min(remaining, available);
      for (const lot of lots) {
        if (fromThisSource <= 0) break;
        const take = Math.min(fromThisSource, lot.quantityKg);
        if (take <= 0) continue;
        picks.push({ lotId: lot.lotId, qty: take });
        fromThisSource -= take;
      }
      // Saldo utan partihistorik: flytta ändå, utan parti.
      if (fromThisSource > 0) picks.push({ lotId: null, qty: fromThisSource });

      for (const pick of picks) {
        await transferStock({
          productId: line.product_id,
          fromLocationId: sourceId,
          toLocationId: transportId,
          quantityKg: pick.qty,
          lotId: pick.lotId,
          unitCost: cost,
          referenceType: REF_TYPE,
          referenceId: orderId,
          note: "Order skickad till leveranslager",
        });
        remaining -= pick.qty;
      }
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
  const transportId = await getTransportlagerId(storeId);
  if (!transportId) {
    console.error("Leveranslager not found for store", storeId);
    return;
  }

  const rawLagerId = await getRawLagerId(storeId);
  if (!rawLagerId) {
    console.error("Butikslager not found for store", storeId);
    return;
  }

  // Partivis kvarvarande kvantitet på transportlagret för just den här ordern.
  const perProduct = await lotBalancesForReference({
    locationId: transportId,
    referenceType: REF_TYPE,
    referenceId: orderId,
  });
  if (!perProduct.length) {
    console.warn(
      `moveStockToRawLager: inga transportlagerrörelser hittades för order ${orderId}.`,
    );
    return;
  }

  for (const { productId, lots } of perProduct) {
    const cost =
      unitCostByProductId?.[productId] ??
      (await currentBalance(productId, transportId)).avgCost ??
      null;

    for (const lot of lots) {
      if (lot.quantityKg <= 0) continue;
      await transferStock({
        productId,
        fromLocationId: transportId,
        toLocationId: rawLagerId,
        quantityKg: lot.quantityKg,
        // Samma parti som grossisten skapade — inget nytt parti i butiksledet.
        lotId: lot.lotId,
        unitCost: cost || null,
        referenceType: REF_TYPE,
        referenceId: orderId,
        note: "Inleverans godkänd i butik",
      });
    }
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
