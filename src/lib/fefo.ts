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

/** Sant när partiets bäst före har passerat. */
export function isExpiredLot(lot: Pick<FefoLot, "bestBefore">, now: Date = new Date()): boolean {
  if (!lot.bestBefore) return false;
  const bb = new Date(`${lot.bestBefore}T23:59:59`);
  return bb.getTime() < now.getTime();
}

/** Sant när partiet går ut inom 24 timmar (men inte redan är utgånget). */
export function isExpiringSoon(lot: Pick<FefoLot, "bestBefore">, now: Date = new Date()): boolean {
  if (!lot.bestBefore || isExpiredLot(lot, now)) return false;
  const bb = new Date(`${lot.bestBefore}T23:59:59`);
  return bb.getTime() - now.getTime() <= 24 * 60 * 60 * 1000;
}

/**
 * Kortast hållbarhet först, partier utan bäst före sist.
 * Utgångna partier föreslås aldrig — de läggs sist och plockas bara vid aktivt val.
 */
export function sortFefo(lots: FefoLot[], now: Date = new Date()): FefoLot[] {
  const byDate = (a: FefoLot, b: FefoLot) => {
    if (a.bestBefore && b.bestBefore) {
      const cmp = a.bestBefore.localeCompare(b.bestBefore);
      if (cmp !== 0) return cmp;
      return (a.arrivedAt ?? "").localeCompare(b.arrivedAt ?? "");
    }
    if (a.bestBefore) return -1;
    if (b.bestBefore) return 1;
    return (a.arrivedAt ?? "").localeCompare(b.arrivedAt ?? "");
  };
  return [...lots].sort((a, b) => {
    const ea = isExpiredLot(a, now);
    const eb = isExpiredLot(b, now);
    if (ea !== eb) return ea ? 1 : -1;
    return byDate(a, b);
  });
}

export interface FefoAllocation {
  lotId: string;
  lotNumber: string;
  quantityKg: number;
  bestBefore: string | null;
  /** Sant när partiet är utgånget och valdes aktivt. */
  expired?: boolean;
}

export interface FefoAllocationResult {
  allocations: FefoAllocation[];
  fullyAllocated: boolean;
  /** Saknad kvantitet när partierna inte räcker. */
  shortBy: number;
  /** Sant när uttaget startar i ett annat parti än FEFO-förslaget. */
  manualDeviation: boolean;
  /** Sant när något utgånget parti ingår i uttaget. */
  usesExpired: boolean;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Fördelar ett uttag över partierna i FEFO-ordning. Anges startLotId börjar
 * uttaget där och fortsätter sedan i FEFO-ordning — avsteget rapporteras så att
 * gränssnittet kan varna.
 *
 * Utgångna partier hoppas över om de inte valts aktivt (startLotId eller
 * allowExpiredLotIds), och ett sådant val kräver motivering i gränssnittet.
 */
export function allocateFefo(
  lots: FefoLot[],
  quantityKg: number,
  startLotId?: string | null,
  allowExpiredLotIds: string[] = [],
): FefoAllocationResult {
  const now = new Date();
  const allowed = new Set([...(allowExpiredLotIds || []), ...(startLotId ? [startLotId] : [])]);
  const ordered = sortFefo(lots, now);
  const fresh = ordered.filter((l) => !isExpiredLot(l, now));
  const queue = startLotId
    ? [
        ...ordered.filter((l) => l.lotId === startLotId),
        ...ordered.filter((l) => l.lotId !== startLotId),
      ]
    : ordered;

  const allocations: FefoAllocation[] = [];
  let left = r3(Math.abs(Number(quantityKg) || 0));
  let usesExpired = false;
  for (const lot of queue) {
    if (left <= 0) break;
    if (lot.quantityKg <= 0) continue;
    const expired = isExpiredLot(lot, now);
    if (expired && !allowed.has(lot.lotId)) continue;
    const take = r3(Math.min(left, lot.quantityKg));
    allocations.push({
      lotId: lot.lotId,
      lotNumber: lot.lotNumber,
      quantityKg: take,
      bestBefore: lot.bestBefore,
      expired,
    });
    if (expired) usesExpired = true;
    left = r3(left - take);
  }

  return {
    allocations,
    fullyAllocated: left <= 0,
    shortBy: Math.max(0, left),
    manualDeviation: Boolean(startLotId && fresh[0] && fresh[0].lotId !== startLotId),
    usesExpired,
  };
}

