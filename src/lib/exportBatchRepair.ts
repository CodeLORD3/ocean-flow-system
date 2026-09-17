import { supabase } from "@/integrations/supabase/client";
import { transferStock, recordMovements } from "@/lib/stockLedger";
import { GROSSIST_FLYTANDE_ID, leveranslagerId } from "@/lib/locations";
import { freshestLotsAtLocation } from "@/lib/exportPicking";

/**
 * Efterkoppling av partier på en redan skickad exportleverans.
 *
 * En exportfaktura måste bära parti per rad. När leveransen skickades utan att
 * lagerrörelserna bokfördes finns inget parti att skriva på fakturan. Här väljs
 * partiet per rad — färskaste först enligt exportregeln — och rörelserna
 * bokförs i efterhand från grossistlagret till butikens transportlager.
 */

export interface BatchCandidate {
  lotId: string;
  lotNumber: string;
  bestBefore: string | null;
  createdAt: string | null;
  vesselName: string | null;
  /** Kvantitet som ligger kvar på grossistlagret i partiet. */
  availableKg: number;
}

export interface BatchRepairLine {
  productId: string;
  productName: string;
  unit: string;
  quantity: number;
  /** Redan bokförd kvantitet med parti på ordern. */
  bookedKg: number;
  candidates: BatchCandidate[];
  /** Förvalt parti: färskaste med saldo, annars färskaste registrerade. */
  suggestedLotId: string | null;
}

/** Rader på leveransen som ännu inte bär parti, med valbara partier per rad. */
export async function analyzeOrderBatches(orderId: string): Promise<BatchRepairLine[]> {
  const { data: lines } = await supabase
    .from("shop_order_lines")
    .select("product_id, status, quantity_delivered, products(name, unit)")
    .eq("shop_order_id", orderId);

  const relevant = (lines || []).filter(
    (l: any) =>
      (l.status ?? "") !== "Ej tillgänglig" &&
      Number(l.quantity_delivered || 0) > 0 &&
      l.product_id,
  ) as any[];
  if (!relevant.length) return [];

  const { data: moves } = await supabase
    .from("stock_movements")
    .select("product_id, quantity_kg, lot_id")
    .eq("reference_type", "shop_order")
    .eq("reference_id", orderId)
    .not("lot_id", "is", null);

  const booked = new Map<string, number>();
  for (const m of (moves as any[]) || []) {
    const qty = Math.abs(Number(m.quantity_kg || 0));
    booked.set(m.product_id, Math.max(booked.get(m.product_id) || 0, qty));
  }

  const productIds = [...new Set(relevant.map((l) => l.product_id as string))];
  const { data: lots } = await supabase
    .from("lots")
    .select("id, product_id, lot_number, best_before, created_at, vessel_name")
    .in("product_id", productIds)
    .order("created_at", { ascending: false });

  const out: BatchRepairLine[] = [];
  for (const productId of productIds) {
    const line = relevant.find((l) => l.product_id === productId)!;
    const quantity = relevant
      .filter((l) => l.product_id === productId)
      .reduce((s, l) => s + Number(l.quantity_delivered || 0), 0);
    if ((booked.get(productId) || 0) > 0.001) continue;

    const atGrossist = await freshestLotsAtLocation(productId, GROSSIST_FLYTANDE_ID);
    const availability = new Map(
      atGrossist.filter((l) => l.lotId).map((l) => [l.lotId as string, l.quantityKg]),
    );

    const candidates: BatchCandidate[] = ((lots as any[]) || [])
      .filter((l) => l.product_id === productId && (l.lot_number ?? "").trim())
      .map((l) => ({
        lotId: l.id as string,
        lotNumber: String(l.lot_number),
        bestBefore: l.best_before ?? null,
        createdAt: l.created_at ?? null,
        vesselName: l.vessel_name ?? null,
        availableKg: availability.get(l.id as string) ?? 0,
      }))
      .sort((a, b) => {
        if (a.availableKg > 0.001 !== b.availableKg > 0.001) return a.availableKg > 0.001 ? -1 : 1;
        if (a.bestBefore && b.bestBefore) {
          const cmp = b.bestBefore.localeCompare(a.bestBefore);
          if (cmp !== 0) return cmp;
        }
        return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
      });

    out.push({
      productId,
      productName: line.products?.name ?? "Okänd produkt",
      unit: line.products?.unit ?? "kg",
      quantity: Math.round(quantity * 1000) / 1000,
      bookedKg: booked.get(productId) || 0,
      candidates,
      suggestedLotId: candidates[0]?.lotId ?? null,
    });
  }

  return out.sort((a, b) => a.productName.localeCompare(b.productName, "sv"));
}

export interface BatchPick {
  productId: string;
  lotId: string;
  quantity: number;
}

/**
 * Bokför de valda partierna på ordern. Finns kvantiteten kvar i partiet på
 * grossistlagret flyttas den därifrån. Saknas den bokförs först en justering in
 * på grossistlagret med partiet, så att varan som faktiskt lämnade lagret får
 * spårbarhet i stället för att sakna historik helt.
 */
export async function commitOrderBatches(orderId: string, picks: BatchPick[]) {
  const { data: order } = await supabase
    .from("shop_orders")
    .select("store_id")
    .eq("id", orderId)
    .maybeSingle();
  const storeId = (order as any)?.store_id as string | null;
  if (!storeId) throw new Error("Ordern saknar butik.");

  const transportId = await leveranslagerId(storeId);
  if (!transportId) throw new Error("Butiken saknar transportlager — kontakta support.");

  for (const pick of picks) {
    const qty = Math.round(Number(pick.quantity) * 1000) / 1000;
    if (!pick.lotId || qty <= 0) continue;

    const lots = await freshestLotsAtLocation(pick.productId, GROSSIST_FLYTANDE_ID);
    const available = lots.find((l) => l.lotId === pick.lotId)?.quantityKg ?? 0;
    const shortfall = Math.round((qty - available) * 1000) / 1000;

    if (shortfall > 0.001) {
      await recordMovements([
        {
          productId: pick.productId,
          locationId: GROSSIST_FLYTANDE_ID,
          quantityKg: shortfall,
          movementType: "justering",
          lotId: pick.lotId,
          referenceType: "shop_order",
          referenceId: orderId,
          note: "Efterkoppling av parti på skickad exportleverans",
        },
      ]);
    }

    await transferStock({
      productId: pick.productId,
      fromLocationId: GROSSIST_FLYTANDE_ID,
      toLocationId: transportId,
      quantityKg: qty,
      lotId: pick.lotId,
      referenceType: "shop_order",
      referenceId: orderId,
      note: "Parti kopplat i efterhand före fakturering",
    });
  }
}
