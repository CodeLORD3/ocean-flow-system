/**
 * FIFO batch-allokerare
 *
 * När en kund köper 1,5 kg lax och det finns tre batcher i butiken
 * (de äldsta från onsdag, de nya från fredag), ska vi dra från den
 * äldsta först. Detta är både lagkrav för spårbarhet och god praxis
 * (undvik svinn).
 *
 * Ren funktion, inga side effects. Lätt att testa.
 */

import { StoreBatchAllocation, Batch, BatchAllocation } from "../types";

export interface AllocationInput {
  requestedQuantity: number;               // det kunden vill köpa
  availableAllocations: StoreBatchAllocation[];  // vad butiken har
  batchMetadata: Map<string, Batch>;       // för att veta vilket som är äldst
}

export interface AllocationResult {
  allocations: BatchAllocation[];          // hur kvantiteten fördelades
  fullyAllocated: boolean;                 // lyckades vi hitta nog mycket?
  shortBy: number;                         // om inte, hur mycket saknades?
}

export function allocateFIFO(input: AllocationInput): AllocationResult {
  const { requestedQuantity, availableAllocations, batchMetadata } = input;

  // Sortera äldst först baserat på caughtDate (fall tillbaka på receivedDate)
  const sorted = [...availableAllocations].sort((a, b) => {
    const batchA = batchMetadata.get(a.batchId);
    const batchB = batchMetadata.get(b.batchId);
    if (!batchA || !batchB) return 0;
    const dateA = batchA.caughtDate ?? batchA.receivedDate;
    const dateB = batchB.caughtDate ?? batchB.receivedDate;
    return dateA.localeCompare(dateB);
  });

  const result: BatchAllocation[] = [];
  let remaining = requestedQuantity;

  for (const alloc of sorted) {
    if (remaining <= 0) break;
    const available = alloc.quantityRemaining - alloc.reservedQuantity;
    if (available <= 0) continue;

    const take = Math.min(remaining, available);
    result.push({
      batchId: alloc.batchId,
      quantity: take,
    });
    remaining -= take;
  }

  return {
    allocations: result,
    fullyAllocated: remaining === 0,
    shortBy: Math.max(0, remaining),
  };
}
