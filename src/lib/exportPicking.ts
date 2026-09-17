import { supabase } from "@/integrations/supabase/client";

/**
 * Exportleveranser till Schweiz plockar INTE enligt FEFO.
 *
 * Regeln är motsatt butiksleveranser i Sverige: alltid det färskaste och nyaste
 * partiet packas. Kokt vara kokas dagen före leverans, filéad fisk filéas dagen
 * före, och övrig färskvara köps samma dag som exporten går. Därför är det
 * nyaste partiet alltid det rätta, och varje rad måste bära parti för att
 * fakturan ska kunna visa parti, art, fångstområde och fartyg.
 */

export interface FreshLot {
  lotId: string | null;
  quantityKg: number;
  bestBefore: string | null;
  createdAt: string | null;
}

/** Cache per butik: butiker byts inte om under en session. */
const exportStoreCache = new Map<string, boolean>();

/** Sant när butiken tillhör ett bolag utanför Sverige (i dag Schweiz, fsab-ch). */
export async function isExportStore(storeId: string): Promise<boolean> {
  if (!storeId) return false;
  const cached = exportStoreCache.get(storeId);
  if (cached !== undefined) return cached;

  const { data: store } = await supabase
    .from("stores")
    .select("legal_entity_id")
    .eq("id", storeId)
    .maybeSingle();
  const entity = (store as any)?.legal_entity_id as string | null;
  if (!entity) {
    exportStoreCache.set(storeId, false);
    return false;
  }

  const { data: le } = await supabase
    .from("legal_entities")
    .select("country")
    .eq("legal_entity_id", entity)
    .maybeSingle();
  const country = ((le as any)?.country as string | null) ?? "SE";
  const isExport = country.toUpperCase() !== "SE";
  exportStoreCache.set(storeId, isExport);
  return isExport;
}

/**
 * Partier med saldo på en lagerplats, nyast först: längst bäst före först, och
 * vid samma datum det senast registrerade partiet. Saldo utan parti läggs sist
 * — det kan inte bära härkomst och får aldrig plockas till export.
 */
export async function freshestLotsAtLocation(
  productId: string,
  locationId: string,
): Promise<FreshLot[]> {
  const { data } = await supabase
    .from("stock_movements")
    .select("lot_id, quantity_kg")
    .eq("product_id", productId)
    .eq("location_id", locationId);

  const acc = new Map<string | null, number>();
  for (const row of data || []) {
    const lotId = ((row as any).lot_id as string | null) ?? null;
    const qty = Number((row as any).quantity_kg || 0);
    acc.set(lotId, Math.round(((acc.get(lotId) || 0) + qty) * 1000) / 1000);
  }

  const lotIds = [...acc.keys()].filter((id): id is string => !!id);
  const meta = new Map<string, { bestBefore: string | null; createdAt: string | null }>();
  if (lotIds.length) {
    const { data: lots } = await supabase
      .from("lots")
      .select("id, best_before, created_at")
      .in("id", lotIds);
    for (const lot of lots || []) {
      meta.set((lot as any).id, {
        bestBefore: (lot as any).best_before ?? null,
        createdAt: (lot as any).created_at ?? null,
      });
    }
  }

  return [...acc.entries()]
    .filter(([, qty]) => qty > 0.001)
    .map(([lotId, quantityKg]) => ({
      lotId,
      quantityKg,
      bestBefore: lotId ? meta.get(lotId)?.bestBefore ?? null : null,
      createdAt: lotId ? meta.get(lotId)?.createdAt ?? null : null,
    }))
    .sort((a, b) => {
      if (!a.lotId) return 1;
      if (!b.lotId) return -1;
      if (a.bestBefore && b.bestBefore) {
        const cmp = b.bestBefore.localeCompare(a.bestBefore);
        if (cmp !== 0) return cmp;
      } else if (a.bestBefore) return -1;
      else if (b.bestBefore) return 1;
      return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
    });
}

/** Total kvantitet som ligger i riktiga partier (saldo utan parti räknas inte). */
export function lottedQuantity(lots: FreshLot[]): number {
  return Math.round(lots.filter((l) => l.lotId).reduce((s, l) => s + l.quantityKg, 0) * 1000) / 1000;
}

/**
 * Rader på en butiksorder som saknar parti i lagerrörelserna. Används som
 * spärr före fakturering: en exportfaktura utan parti per rad är inte giltig.
 */
export async function shopOrderLinesMissingBatch(
  orderId: string,
): Promise<{ productName: string }[]> {
  const { data: lines } = await supabase
    .from("shop_order_lines")
    .select("product_id, status, quantity_delivered, products(name)")
    .eq("shop_order_id", orderId);

  const relevant = (lines || []).filter(
    (l: any) => (l.status ?? "") !== "Ej tillgänglig" && Number(l.quantity_delivered || 0) > 0,
  );
  if (!relevant.length) return [];

  const { data: batches } = await supabase.rpc("order_line_batches", {
    _reference_type: "shop_order",
    _reference_id: orderId,
  });
  const withBatch = new Set(
    ((batches as any[]) || [])
      .filter((b) => (b.batches ?? "").trim().length > 0)
      .map((b) => b.product_id as string),
  );

  const missing = new Map<string, string>();
  for (const line of relevant as any[]) {
    if (!line.product_id || withBatch.has(line.product_id)) continue;
    missing.set(line.product_id, line.products?.name ?? "Okänd produkt");
  }
  return [...missing.values()].map((productName) => ({ productName }));
}
