/**
 * Tester för prismotor och FIFO-allokering.
 * Kör: npm test
 */

import { suggestPrice, buildArticlePricing } from "../src/pricing/engine";
import { allocateFIFO } from "../src/pricing/fifo-allocator";
import { Batch, PricingRule, StoreBatchAllocation } from "../src/types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`  ✓ ${message}`);
  }
}

function assertEq<T>(actual: T, expected: T, message: string) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message}\n      actual:   ${JSON.stringify(actual)}\n      expected: ${JSON.stringify(expected)}`
  );
}

// ---------------------------------------------------------------
// Prismotor
// ---------------------------------------------------------------

console.log("\nPrismotor — markup-strategi");
{
  const rule: PricingRule = {
    sku: "LAX",
    strategy: "markup",
    markupPercent: 45,
    targetMarginPercent: null,
    fixedPriceOre: null,
    minPriceOre: null,
    maxPriceOre: null,
    storeMultipliers: {},
    roundToOre: 100,
  };
  const batch: Batch = {
    batchId: "B1", sku: "LAX", caughtDate: "2026-04-20",
    vessel: null, faoZone: null, mscCertified: false, aslCertified: false,
    countryOfOrigin: null, supplier: null,
    purchasePriceOre: 10000,    // 100 kr
    purchaseCurrency: "SEK", fxRateToSek: 1.0,
    receivedDate: "2026-04-20", expiryDate: null,
  };

  const result = suggestPrice(rule, [batch], "amhult");
  // 100 kr × 1.45 = 145 kr = 14500 öre, avrundat till hela kr = 14500 öre
  assertEq(result.suggestedPriceOre, 14500, "100 kr × 45% påslag = 145 kr");
  assert(result.rationale.includes("45% påslag"), "Rationale ska förklara 45% påslag");
}

console.log("\nPrismotor — target-margin-strategi");
{
  const rule: PricingRule = {
    sku: "LAX",
    strategy: "target-margin",
    markupPercent: null,
    targetMarginPercent: 30,
    fixedPriceOre: null,
    minPriceOre: null,
    maxPriceOre: null,
    storeMultipliers: {},
    roundToOre: 1,
  };
  const batch: Batch = {
    batchId: "B1", sku: "LAX", caughtDate: "2026-04-20",
    vessel: null, faoZone: null, mscCertified: false, aslCertified: false,
    countryOfOrigin: null, supplier: null,
    purchasePriceOre: 10000,
    purchaseCurrency: "SEK", fxRateToSek: 1.0,
    receivedDate: "2026-04-20", expiryDate: null,
  };
  const result = suggestPrice(rule, [batch], "amhult");
  // För 30% marginal: pris = 100 / (1 - 0.3) = 142,857... kr
  assertEq(result.suggestedPriceOre, 14286, "100 kr → 30% marginal = 142,86 kr");
}

console.log("\nPrismotor — valutakonvertering (NOK → SEK)");
{
  const rule: PricingRule = {
    sku: "LAX", strategy: "markup", markupPercent: 50,
    targetMarginPercent: null, fixedPriceOre: null,
    minPriceOre: null, maxPriceOre: null,
    storeMultipliers: {}, roundToOre: 100,
  };
  const batch: Batch = {
    batchId: "B1", sku: "LAX", caughtDate: "2026-04-20",
    vessel: null, faoZone: null, mscCertified: false, aslCertified: false,
    countryOfOrigin: null, supplier: null,
    purchasePriceOre: 10000,    // 100 NOK
    purchaseCurrency: "NOK", fxRateToSek: 0.98,
    receivedDate: "2026-04-20", expiryDate: null,
  };
  const result = suggestPrice(rule, [batch], "amhult");
  // 100 NOK × 0.98 = 98 SEK, × 1.5 = 147 SEK
  assertEq(result.suggestedPriceOre, 14700, "100 NOK × 0.98 × 1.5 = 147 kr");
}

console.log("\nPrismotor — butiks-multiplier");
{
  const rule: PricingRule = {
    sku: "LAX", strategy: "markup", markupPercent: 40,
    targetMarginPercent: null, fixedPriceOre: null,
    minPriceOre: null, maxPriceOre: null,
    storeMultipliers: { saro: 1.15, torslanda: 0.95 },
    roundToOre: 100,
  };
  const batch: Batch = {
    batchId: "B1", sku: "LAX", caughtDate: "2026-04-20",
    vessel: null, faoZone: null, mscCertified: false, aslCertified: false,
    countryOfOrigin: null, supplier: null,
    purchasePriceOre: 10000,
    purchaseCurrency: "SEK", fxRateToSek: 1.0,
    receivedDate: "2026-04-20", expiryDate: null,
  };
  // Grundpris: 100 × 1.4 = 140 kr
  const saro = suggestPrice(rule, [batch], "saro");
  const torslanda = suggestPrice(rule, [batch], "torslanda");
  assertEq(saro.suggestedPriceOre, 16100, "Särö: 140 × 1.15 = 161 kr");
  assertEq(torslanda.suggestedPriceOre, 13300, "Torslanda: 140 × 0.95 = 133 kr");
}

console.log("\nPrismotor — min/max-clamping");
{
  const rule: PricingRule = {
    sku: "LAX", strategy: "markup", markupPercent: 200,    // extremt påslag
    targetMarginPercent: null, fixedPriceOre: null,
    minPriceOre: null, maxPriceOre: 25000,                  // max 250 kr
    storeMultipliers: {}, roundToOre: 100,
  };
  const batch: Batch = {
    batchId: "B1", sku: "LAX", caughtDate: "2026-04-20",
    vessel: null, faoZone: null, mscCertified: false, aslCertified: false,
    countryOfOrigin: null, supplier: null,
    purchasePriceOre: 10000,
    purchaseCurrency: "SEK", fxRateToSek: 1.0,
    receivedDate: "2026-04-20", expiryDate: null,
  };
  const result = suggestPrice(rule, [batch], "amhult");
  // 100 × 3 = 300 kr, men maxkap är 250
  assertEq(result.suggestedPriceOre, 25000, "Max-cap 250 kr tillämpas");
  assert(result.rationale.includes("max"), "Rationale nämner max-kap");
}

console.log("\nPrismotor — FIFO använder äldsta batchen som kostnad");
{
  const rule: PricingRule = {
    sku: "LAX", strategy: "markup", markupPercent: 50,
    targetMarginPercent: null, fixedPriceOre: null,
    minPriceOre: null, maxPriceOre: null,
    storeMultipliers: {}, roundToOre: 100,
  };
  const oldBatch: Batch = {
    batchId: "B-OLD", sku: "LAX", caughtDate: "2026-04-20",
    vessel: null, faoZone: null, mscCertified: false, aslCertified: false,
    countryOfOrigin: null, supplier: null,
    purchasePriceOre: 8000,     // billig gammal batch
    purchaseCurrency: "SEK", fxRateToSek: 1.0,
    receivedDate: "2026-04-20", expiryDate: null,
  };
  const newBatch: Batch = {
    batchId: "B-NEW", sku: "LAX", caughtDate: "2026-04-22",
    vessel: null, faoZone: null, mscCertified: false, aslCertified: false,
    countryOfOrigin: null, supplier: null,
    purchasePriceOre: 15000,    // dyr ny batch
    purchaseCurrency: "SEK", fxRateToSek: 1.0,
    receivedDate: "2026-04-22", expiryDate: null,
  };
  // Gammal batch är först (FIFO) → använd 80 kr som kostnad
  const result = suggestPrice(rule, [oldBatch, newBatch], "amhult");
  assertEq(result.suggestedPriceOre, 12000, "FIFO använder gammal batch: 80 × 1.5 = 120");
  assertEq(result.basedOnBatchId, "B-OLD", "BasedOnBatch är gamla");
}

// ---------------------------------------------------------------
// FIFO-allokering
// ---------------------------------------------------------------

console.log("\nFIFO-allokering — enkel, räcker i första batchen");
{
  const batches = new Map<string, Batch>([
    ["B-OLD", { batchId: "B-OLD", sku: "LAX", caughtDate: "2026-04-20",
      vessel: null, faoZone: null, mscCertified: false, aslCertified: false,
      countryOfOrigin: null, supplier: null, purchasePriceOre: 8000,
      purchaseCurrency: "SEK", fxRateToSek: 1.0, receivedDate: "2026-04-20",
      expiryDate: null,
    }],
    ["B-NEW", { batchId: "B-NEW", sku: "LAX", caughtDate: "2026-04-22",
      vessel: null, faoZone: null, mscCertified: false, aslCertified: false,
      countryOfOrigin: null, supplier: null, purchasePriceOre: 15000,
      purchaseCurrency: "SEK", fxRateToSek: 1.0, receivedDate: "2026-04-22",
      expiryDate: null,
    }],
  ]);
  const allocations: StoreBatchAllocation[] = [
    { storeId: "amhult", batchId: "B-OLD", sku: "LAX", quantityRemaining: 5000, reservedQuantity: 0 },
    { storeId: "amhult", batchId: "B-NEW", sku: "LAX", quantityRemaining: 10000, reservedQuantity: 0 },
  ];

  const result = allocateFIFO({
    requestedQuantity: 3000,
    availableAllocations: allocations,
    batchMetadata: batches,
  });
  assert(result.fullyAllocated, "Allokering är komplett");
  assertEq(result.allocations, [{ batchId: "B-OLD", quantity: 3000 }],
    "Tas hela från äldsta batchen");
}

console.log("\nFIFO-allokering — delas mellan två batcher");
{
  const batches = new Map<string, Batch>([
    ["B-OLD", { batchId: "B-OLD", sku: "LAX", caughtDate: "2026-04-20",
      vessel: null, faoZone: null, mscCertified: false, aslCertified: false,
      countryOfOrigin: null, supplier: null, purchasePriceOre: 8000,
      purchaseCurrency: "SEK", fxRateToSek: 1.0, receivedDate: "2026-04-20",
      expiryDate: null,
    }],
    ["B-NEW", { batchId: "B-NEW", sku: "LAX", caughtDate: "2026-04-22",
      vessel: null, faoZone: null, mscCertified: false, aslCertified: false,
      countryOfOrigin: null, supplier: null, purchasePriceOre: 15000,
      purchaseCurrency: "SEK", fxRateToSek: 1.0, receivedDate: "2026-04-22",
      expiryDate: null,
    }],
  ]);
  const allocations: StoreBatchAllocation[] = [
    { storeId: "amhult", batchId: "B-OLD", sku: "LAX", quantityRemaining: 2000, reservedQuantity: 0 },
    { storeId: "amhult", batchId: "B-NEW", sku: "LAX", quantityRemaining: 10000, reservedQuantity: 0 },
  ];

  const result = allocateFIFO({
    requestedQuantity: 5000,
    availableAllocations: allocations,
    batchMetadata: batches,
  });
  assert(result.fullyAllocated, "Allokering är komplett");
  assertEq(result.allocations, [
    { batchId: "B-OLD", quantity: 2000 },
    { batchId: "B-NEW", quantity: 3000 },
  ], "Tar allt från gammal först, sedan från ny");
}

console.log("\nFIFO-allokering — otillräckligt lager");
{
  const batches = new Map<string, Batch>([
    ["B1", { batchId: "B1", sku: "LAX", caughtDate: "2026-04-20",
      vessel: null, faoZone: null, mscCertified: false, aslCertified: false,
      countryOfOrigin: null, supplier: null, purchasePriceOre: 8000,
      purchaseCurrency: "SEK", fxRateToSek: 1.0, receivedDate: "2026-04-20",
      expiryDate: null,
    }],
  ]);
  const allocations: StoreBatchAllocation[] = [
    { storeId: "amhult", batchId: "B1", sku: "LAX", quantityRemaining: 1000, reservedQuantity: 0 },
  ];

  const result = allocateFIFO({
    requestedQuantity: 5000,
    availableAllocations: allocations,
    batchMetadata: batches,
  });
  assert(!result.fullyAllocated, "Allokering misslyckas");
  assertEq(result.shortBy, 4000, "Saknar 4000g");
}

console.log("\nFIFO-allokering — respekterar reserverad kvantitet");
{
  const batches = new Map<string, Batch>([
    ["B1", { batchId: "B1", sku: "LAX", caughtDate: "2026-04-20",
      vessel: null, faoZone: null, mscCertified: false, aslCertified: false,
      countryOfOrigin: null, supplier: null, purchasePriceOre: 8000,
      purchaseCurrency: "SEK", fxRateToSek: 1.0, receivedDate: "2026-04-20",
      expiryDate: null,
    }],
  ]);
  const allocations: StoreBatchAllocation[] = [
    { storeId: "amhult", batchId: "B1", sku: "LAX", quantityRemaining: 5000, reservedQuantity: 2000 },
  ];

  const result = allocateFIFO({
    requestedQuantity: 4000,
    availableAllocations: allocations,
    batchMetadata: batches,
  });
  // Bara 5000 - 2000 = 3000 är tillgängligt
  assert(!result.fullyAllocated, "Kan inte ta 4000 när bara 3000 är okreserverat");
  assertEq(result.shortBy, 1000, "Saknar 1000g");
}

console.log("\n— Klar —");
