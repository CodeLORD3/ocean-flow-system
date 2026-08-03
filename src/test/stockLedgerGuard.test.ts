import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * SPÄRR: product_stock_locations får bara skrivas av databastriggern
 * apply_stock_movement, dvs. via src/lib/stockLedger.ts.
 *
 * Filerna nedan är kvarvarande direktskrivningar från tiden före
 * rörelseloggen. Listan får bara krympa — lägg aldrig till en ny fil.
 */
const LEGACY_DIRECT_WRITERS = [
  "src/hooks/useStorageLocations.ts",
  "src/pages/Receiving.tsx",
  "src/pages/ProductionReporting.tsx",
  "src/pages/PurchaseReporting.tsx",
  "src/pages/Inventory.tsx",
];

const WRITE_CALLS = /\.(insert|update|upsert|delete)\s*\(/;

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) acc.push(full);
  }
  return acc;
}

/** Hittar filer där ett anrop mot product_stock_locations följs av en skrivoperation. */
function findDirectWriters(): string[] {
  const offenders: string[] = [];
  for (const file of walk("src")) {
    const text = readFileSync(file, "utf8");
    if (!text.includes("product_stock_locations")) continue;
    const lines = text.split("\n");
    let hit = false;
    lines.forEach((line, i) => {
      if (!line.includes("product_stock_locations")) return;
      // Skrivoperationen står på samma rad eller i den kedjade raden efter
      const window = [line, lines[i + 1] ?? "", lines[i + 2] ?? ""].join("\n");
      if (WRITE_CALLS.test(window)) hit = true;
    });
    if (hit) offenders.push(file.replace(/\\/g, "/"));
  }
  return offenders;
}

describe("lagersaldot skrivs bara via rörelseloggen", () => {
  it("inga nya direktskrivningar mot product_stock_locations", () => {
    const offenders = findDirectWriters();
    const unexpected = offenders.filter((f) => !LEGACY_DIRECT_WRITERS.includes(f));
    expect(unexpected, `Skriv via recordMovement() i src/lib/stockLedger.ts istället: ${unexpected.join(", ")}`).toEqual([]);
  });

  it("transport- och orderflödet skriver inte saldot direkt", () => {
    for (const file of ["src/lib/stockTransfer.ts", "src/hooks/useUpdateOrderLineStatus.ts", "src/lib/productionStock.ts"]) {
      const text = readFileSync(file, "utf8");
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        if (!line.includes("product_stock_locations")) return;
        const window = [line, lines[i + 1] ?? "", lines[i + 2] ?? ""].join("\n");
        expect(WRITE_CALLS.test(window), `${file}:${i + 1} skriver saldot direkt`).toBe(false);
      });
    }
  });

  it("legacy-listan krymper aldrig i fel riktning", () => {
    const offenders = findDirectWriters();
    const stale = LEGACY_DIRECT_WRITERS.filter((f) => !offenders.includes(f));
    // Om en fil är åtgärdad ska den tas bort ur listan.
    expect(stale, `Ta bort ur LEGACY_DIRECT_WRITERS: ${stale.join(", ")}`).toEqual([]);
  });
});
