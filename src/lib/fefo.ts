import { supabase } from "@/integrations/supabase/client";

/**
 * FEFO-partival (First Expired, First Out).
 *
 * Samma allokeringsprincip som edge-funktionen scomber-batch-allocate och
 * scomber-commerce/src/pricing/fifo-allocator.ts, men den logiken bygger på
 * makrilltrade_batches_cache och kan inte återanvändas rakt av här: partierna i
 * ERP:t har inget eget saldofält, saldot härleds ur rörelseloggen per lagerplats.
 * Därför ligger allokeringen här som en ren funktion (allocateFefo) med samma
 * regel — kortast hållbarhet först, dela över nästa parti när det inte räcker.
 */

export interface FefoLot {
  lotId: string;
  lotNumber: string;
  /** Kvarvarande kg på lagerplatsen. */
  quantityKg: number;
  bestBefore: string | null;
  catchArea: string | null;
  supplierName: string | null;
  /** Ankomstdatum (partiet registrerades i systemet). */
  arrivedAt: string | null;
  unitCost: number | null;
}

/**
 * Partier med kvarvarande saldo större än noll för en produkt på en lagerplats,
 * sorterade FEFO — kortast hållbarhet först. Partier utan bäst före hamnar sist.
 * Rörelser utan parti räknas inte med: de kan inte bära härkomst.
 */
export async function fefoLotsAtLocation(
  productId: string,
  locationId: string,
): Promise<FefoLot[]> {
  const { data, error } = await supabase
    .from("stock_movements")
    .select("lot_id, quantity_kg")
    .eq("product_id", productId)
    .eq("location_id", locationId);
  if (error) throw error;

  const balance = new Map<string, number>();
  for (const row of data || []) {
    const lotId = (row as any).lot_id as string | null;
    if (!lotId) continue;
    balance.set(lotId, Math.round(((balance.get(lotId) || 0) + Number((row as any).quantity_kg || 0)) * 1000) / 1000);
  }
  const lotIds = [...balance.entries()].filter(([, q]) => q > 0).map(([id]) => id);
  if (lotIds.length === 0) return [];

  const { data: lots, error: lErr } = await supabase
    .from("lots")
    .select("id, lot_number, best_before, catch_area, unit_cost, created_at, supplier_id, suppliers(name)")
    .in("id", lotIds);
  if (lErr) throw lErr;

  const rows: FefoLot[] = (lots || []).map((l: any) => ({
    lotId: l.id,
    lotNumber: l.lot_number ?? "",
    quantityKg: balance.get(l.id) || 0,
    bestBefore: l.best_before ?? null,
    catchArea: l.catch_area ?? null,
    supplierName: l.suppliers?.name ?? null,
    arrivedAt: l.created_at ?? null,
    unitCost: l.unit_cost != null ? Number(l.unit_cost) : null,
  }));

  return sortFefo(rows);
}

/** Kortast hållbarhet först, partier utan bäst före sist. */
export function sortFefo(lots: FefoLot[]): FefoLot[] {
  return [...lots].sort((a, b) => {
    if (a.bestBefore && b.bestBefore) {
      const cmp = a.bestBefore.localeCompare(b.bestBefore);
      if (cmp !== 0) return cmp;
      return (a.arrivedAt ?? "").localeCompare(b.arrivedAt ?? "");
    }
    if (a.bestBefore) return -1;
    if (b.bestBefore) return 1;
    return (a.arrivedAt ?? "").localeCompare(b.arrivedAt ?? "");
  });
}

export interface FefoAllocation {
  lotId: string;
  lotNumber: string;
  quantityKg: number;
  bestBefore: string | null;
}

export interface FefoAllocationResult {
  allocations: FefoAllocation[];
  fullyAllocated: boolean;
  /** Saknad kvantitet när partierna inte räcker. */
  shortBy: number;
  /** Sant när uttaget startar i ett annat parti än FEFO-förslaget. */
  manualDeviation: boolean;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Fördelar ett uttag över partierna i FEFO-ordning. Anges startLotId börjar
 * uttaget där och fortsätter sedan i FEFO-ordning — avsteget rapporteras så att
 * gränssnittet kan varna.
 */
export function allocateFefo(
  lots: FefoLot[],
  quantityKg: number,
  startLotId?: string | null,
): FefoAllocationResult {
  const ordered = sortFefo(lots);
  const queue = startLotId
    ? [
        ...ordered.filter((l) => l.lotId === startLotId),
        ...ordered.filter((l) => l.lotId !== startLotId),
      ]
    : ordered;

  const allocations: FefoAllocation[] = [];
  let left = r3(Math.abs(Number(quantityKg) || 0));
  for (const lot of queue) {
    if (left <= 0) break;
    if (lot.quantityKg <= 0) continue;
    const take = r3(Math.min(left, lot.quantityKg));
    allocations.push({
      lotId: lot.lotId,
      lotNumber: lot.lotNumber,
      quantityKg: take,
      bestBefore: lot.bestBefore,
    });
    left = r3(left - take);
  }

  return {
    allocations,
    fullyAllocated: left <= 0,
    shortBy: Math.max(0, left),
    manualDeviation: Boolean(startLotId && ordered[0] && ordered[0].lotId !== startLotId),
  };
}
