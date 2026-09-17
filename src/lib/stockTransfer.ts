import { supabase } from "@/integrations/supabase/client";
import {
  recordMovements,
  transferStock,
  currentBalance,
  lotBalancesAtLocation,
  lotBalancesForReference,
} from "@/lib/stockLedger";
import { GROSSIST_FLYTANDE_ID, leveranslagerId, butikslagerId } from "@/lib/locations";
import { isInfiniteStock } from "@/lib/infiniteStock";
import { isExportStore, freshestLotsAtLocation, lottedQuantity } from "@/lib/exportPicking";


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
    throw new Error(
      "Butiken saknar transportlager — leveransen kan inte bokföras. Lägg upp lagerplatsen först.",
    );
  }

  const gfLocId = GROSSIST_FLYTANDE_ID;
  // Produkter där grossistlagret inte räcker. Leveransen stoppas efteråt
  // med ett samlat meddelande istället för att uppfinna vara.
  const shortages: { productId: string; missing: number }[] = [];

  // Täckningskontroll före första rörelsen: antingen går hela ordern ut,
  // eller ingenting — aldrig en halv bokförd leverans.
  if (gfLocId && !(await isInfiniteStock())) {
    const needed = new Map<string, number>();
    for (const line of order.shop_order_lines) {
      const qty = Number(line.quantity_delivered || line.quantity_ordered) || 0;
      if (qty <= 0 || !line.product_id) continue;
      needed.set(line.product_id, (needed.get(line.product_id) || 0) + qty);
    }
    if (needed.size) {
      const { data: available } = await supabase
        .from("product_stock_locations")
        .select("product_id, quantity")
        .eq("location_id", gfLocId)
        .in("product_id", [...needed.keys()]);
      const have = new Map(
        (available || []).map((r: any) => [r.product_id as string, Number(r.quantity) || 0]),
      );
      for (const [productId, qty] of needed) {
        const missing = qty - (have.get(productId) || 0);
        if (missing > 0.001) shortages.push({ productId, missing });
      }
      if (shortages.length) await throwShortage(shortages);
    }
  }

  /**
   * Export till Schweiz plockar färskaste partiet först, och varje rad måste
   * bära parti hela vägen till fakturan. Kontrollen körs före första rörelsen
   * så att en exportleverans aldrig bokförs halv eller utan spårbarhet.
   */
  const exportOrder = await isExportStore(order.store_id);
  if (exportOrder && gfLocId && !(await isInfiniteStock())) {
    const needLot = new Map<string, number>();
    for (const line of order.shop_order_lines) {
      const qty = Number(line.quantity_delivered || line.quantity_ordered) || 0;
      if (qty <= 0 || !line.product_id) continue;
      needLot.set(line.product_id, (needLot.get(line.product_id) || 0) + qty);
    }
    const withoutLot: { productId: string; missing: number }[] = [];
    for (const [productId, qty] of needLot) {
      const lots = await freshestLotsAtLocation(productId, gfLocId);
      const missing = qty - lottedQuantity(lots);
      if (missing > 0.001) withoutLot.push({ productId, missing });
    }
    if (withoutLot.length) await throwMissingLot(withoutLot);
  }


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

      // Butiksleverans i Sverige: äldsta bäst före först (FEFO).
      // Export till Schweiz: färskaste partiet först.
      const lots = exportOrder
        ? (await freshestLotsAtLocation(line.product_id, sourceId)).filter((l) => l.lotId)
        : await lotBalancesAtLocation(line.product_id, sourceId);
      const picks: { lotId: string | null; qty: number }[] = [];
      let fromThisSource = Math.min(remaining, available);
      for (const lot of lots) {
        if (fromThisSource <= 0) break;
        const take = Math.min(fromThisSource, lot.quantityKg);
        if (take <= 0) continue;
        picks.push({ lotId: lot.lotId, qty: take });
        fromThisSource -= take;
      }
      // Saldo utan partihistorik: flyttas bara i Sverige. En exportrad utan
      // parti går inte att spåra på fakturan och stoppas i stället.
      if (fromThisSource > 0) {
        if (exportOrder) {
          await throwMissingLot([{ productId: line.product_id as string, missing: fromThisSource }]);
        }
        picks.push({ lotId: null, qty: fromThisSource });
      }


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
      // Uppstartsläge: lagret är obegränsat, så bristen bokförs som en
      // justering in på leveranslagret istället för att stoppa leveransen.
      if (await isInfiniteStock()) {
        await recordMovements([
          {
            productId: line.product_id,
            locationId: transportId,
            quantityKg: remaining,
            movementType: "justering",
            referenceType: REF_TYPE,
            referenceId: orderId,
            note: "Obegränsat lager (uppstartsläge)",
          },
        ]);
        remaining = 0;
      } else {
        shortages.push({ productId: line.product_id as string, missing: remaining });
      }
    }
  }

  if (shortages.length) await throwShortage(shortages);
}

/** Begripligt stoppmeddelande när grossistlagret inte täcker ordern. */
async function throwShortage(shortages: { productId: string; missing: number }[]) {
  const { data: prods } = await supabase
    .from("products")
    .select("id, name, unit")
    .in("id", shortages.map((s) => s.productId));
  const nameOf = new Map((prods || []).map((p: any) => [p.id, p]));
  const list = shortages
    .map((s) => {
      const p: any = nameOf.get(s.productId);
      const qty = Math.round(s.missing * 10) / 10;
      return `${p?.name ?? "Okänd produkt"}: ${qty} ${p?.unit ?? "kg"} saknas`;
    })
    .join(", ");
  throw new Error(
    `Grossistlagret räcker inte till hela ordern. ${list}. Bokför inleverans eller minska mängden innan ordern skickas.`,
  );
}



/**
 * När butiken godkänner inleveransen: flytta orderns kvantiteter från
 * Transportlager till butikens Raw-lager.
 */
export async function moveStockToRawLager(
  orderId: string,
  storeId: string,
  unitCostByProductId?: Record<string, number>,
  /**
   * Valutaspår när butiken bokför i annan valuta än grossisten fakturerar i.
   * Ursprungspriset (t.ex. SEK) och kursen sparas på rörelsen så gamla
   * inleveranser aldrig ändras retroaktivt när kursen rör sig.
   */
  fx?: {
    sourceCurrency: string;
    fxRate: number;
    sourceCostByProductId?: Record<string, number>;
  },
) {
  const transportId = await getTransportlagerId(storeId);
  if (!transportId) {
    throw new Error(
      "Butiken saknar transportlager — inleveransen kan inte bokföras. Lägg upp lagerplatsen först.",
    );
  }

  const rawLagerId = await getRawLagerId(storeId);
  if (!rawLagerId) {
    throw new Error(
      "Butiken saknar eget lager — inleveransen kan inte bokföras. Lägg upp lagerplatsen först.",
    );
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
    const sourceCost = fx?.sourceCostByProductId?.[productId] ?? null;

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
        unitCostSource: sourceCost,
        sourceCurrency: sourceCost != null ? fx?.sourceCurrency ?? null : null,
        fxRate: sourceCost != null ? fx?.fxRate ?? null : null,
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
