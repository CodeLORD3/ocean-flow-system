import { supabase } from "@/integrations/supabase/client";
import {
  lotBalancesAtLocation,
  lotBalancesForReference,
  recordMovements,
  transferStock,
} from "@/lib/stockLedger";
import { butikslagerId, GROSSIST_FLYTANDE_ID } from "@/lib/locations";

const REF_TYPE = "shop_order";
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Vara som kom till butiken men inte låg på transportlagret (fel vara eller
 * missad på följesedeln). Tas FEFO från grossistlagret så partiet följer med.
 * Finns inget saldo kvar hos grossisten bokförs resten som inleverans utan parti.
 */
export async function receiveUnpackedProduct(params: {
  orderId: string;
  storeId: string;
  productId: string;
  quantityKg: number;
  note: string;
}) {
  let remaining = round3(params.quantityKg);
  if (remaining <= 0) return;
  const toId = await butikslagerId(params.storeId);
  if (!toId) throw new Error("Butiken saknar eget lager — lägg upp lagerplatsen först.");

  const lots = await lotBalancesAtLocation(params.productId, GROSSIST_FLYTANDE_ID);
  for (const lot of lots) {
    if (remaining <= 0.0005) break;
    const qty = round3(Math.min(lot.quantityKg, remaining));
    if (qty <= 0) continue;
    await transferStock({
      productId: params.productId,
      fromLocationId: GROSSIST_FLYTANDE_ID,
      toLocationId: toId,
      quantityKg: qty,
      lotId: lot.lotId,
      referenceType: REF_TYPE,
      referenceId: params.orderId,
      note: params.note,
    });
    remaining = round3(remaining - qty);
  }
  if (remaining > 0.0005) {
    await recordMovements([
      {
        productId: params.productId,
        locationId: toId,
        quantityKg: remaining,
        movementType: "inleverans",
        referenceType: REF_TYPE,
        referenceId: params.orderId,
        note: `${params.note} · saknades i grossistlagret`,
      },
    ]);
  }
}

export interface TransportResidual {
  orderId: string;
  storeId: string | null;
  storeName: string;
  orderLabel: string;
  locationId: string;
  productId: string;
  productName: string;
  unit: string;
  lots: { lotId: string | null; quantityKg: number }[];
  totalKg: number;
}

/** Det som ligger kvar på transportlager för order som butiken redan tagit emot. */
export async function fetchTransportResiduals(storeId?: string | null): Promise<TransportResidual[]> {
  let oq = supabase
    .from("shop_orders")
    .select("id, store_id, delivery_date, stores(name)")
    .eq("status", "Levererad")
    .order("delivery_date", { ascending: false })
    .limit(200);
  if (storeId) oq = oq.eq("store_id", storeId);
  const { data: orders, error } = await oq;
  if (error) throw error;
  if (!orders?.length) return [];

  const { data: locs } = await supabase
    .from("storage_locations")
    .select("id, store_id")
    .eq("location_type", "leveranslager");
  const transportByStore = new Map<string, string>();
  for (const l of (locs || []) as any[]) if (l.store_id) transportByStore.set(l.store_id, l.id);

  const out: TransportResidual[] = [];
  const productIds = new Set<string>();
  for (const o of orders as any[]) {
    const locId = transportByStore.get(o.store_id);
    if (!locId) continue;
    const rows = await lotBalancesForReference({ locationId: locId, referenceType: REF_TYPE, referenceId: o.id });
    for (const r of rows) {
      const total = round3(r.lots.reduce((s, l) => s + l.quantityKg, 0));
      if (total <= 0.0005) continue;
      productIds.add(r.productId);
      out.push({
        orderId: o.id,
        storeId: o.store_id,
        storeName: o.stores?.name ?? "Butik",
        orderLabel: o.delivery_date ?? "",
        locationId: locId,
        productId: r.productId,
        productName: "",
        unit: "kg",
        lots: r.lots,
        totalKg: total,
      });
    }
  }
  if (productIds.size) {
    const { data: prods } = await supabase.from("products").select("id, name, unit").in("id", [...productIds]);
    const map = new Map((prods || []).map((p: any) => [p.id, p]));
    for (const r of out) {
      const p: any = map.get(r.productId);
      r.productName = p?.name ?? "Okänd vara";
      r.unit = p?.unit ?? "kg";
    }
  }
  return out;
}

export type ResidualAction = "tillbaka" | "svinn";

/** Grossisten reder ut det som blev kvar: tillbaka i grossistlagret eller svinn. */
export async function resolveTransportResidual(r: TransportResidual, action: ResidualAction) {
  for (const lot of r.lots) {
    if (lot.quantityKg <= 0) continue;
    if (action === "tillbaka") {
      await transferStock({
        productId: r.productId,
        fromLocationId: r.locationId,
        toLocationId: GROSSIST_FLYTANDE_ID,
        quantityKg: lot.quantityKg,
        lotId: lot.lotId,
        referenceType: REF_TYPE,
        referenceId: r.orderId,
        note: "Avvikelse vid inleverans · tillbaka i grossistlagret",
      });
    } else {
      await recordMovements([
        {
          productId: r.productId,
          locationId: r.locationId,
          quantityKg: lot.quantityKg,
          movementType: "svinn",
          lotId: lot.lotId,
          referenceType: REF_TYPE,
          referenceId: r.orderId,
          note: "Avvikelse vid inleverans · svinn",
        },
      ]);
    }
  }
}
