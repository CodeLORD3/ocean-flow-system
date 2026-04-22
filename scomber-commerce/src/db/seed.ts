/**
 * Seed-data för mockadapter: realistiska fiskhandlardata.
 * Används i dev och tester.
 */

import { Article, Batch, StoreBatchAllocation } from "../types";

const today = new Date().toISOString().substring(0, 10);
const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().substring(0, 10);
};
const daysAhead = (n: number): string => daysAgo(-n);

export const seedArticles: Article[] = [
  {
    sku: "LAX-HEL-001",
    name: "Lax, färsk hel",
    species: "Salmo salar",
    category: "Färsk fisk",
    unit: "kg",
    vatRate: 6,
    active: true,
    imageUrl: null,
  },
  {
    sku: "LAX-FIL-001",
    name: "Laxfilé m skinn",
    species: "Salmo salar",
    category: "Färsk fisk",
    unit: "kg",
    vatRate: 6,
    active: true,
    imageUrl: null,
  },
  {
    sku: "TOR-FIL-001",
    name: "Torsk, färsk filé",
    species: "Gadus morhua",
    category: "Färsk fisk",
    unit: "kg",
    vatRate: 6,
    active: true,
    imageUrl: null,
  },
  {
    sku: "RAK-SKA-001",
    name: "Räkor, skalade i lag",
    species: "Pandalus borealis",
    category: "Skaldjur",
    unit: "piece",
    vatRate: 6,
    active: true,
    imageUrl: null,
  },
  {
    sku: "HUM-LEV-001",
    name: "Hummer, levande",
    species: "Homarus gammarus",
    category: "Skaldjur",
    unit: "piece",
    vatRate: 6,
    active: true,
    imageUrl: null,
  },
  {
    sku: "OST-BOH-001",
    name: "Ostron, bohuslän",
    species: "Ostrea edulis",
    category: "Skaldjur",
    unit: "piece",
    vatRate: 6,
    active: true,
    imageUrl: null,
  },
  {
    sku: "GRA-LAX-001",
    name: "Gravad lax, skivad",
    species: "Salmo salar",
    category: "Rökt & gravat",
    unit: "kg",
    vatRate: 6,
    active: true,
    imageUrl: null,
  },
  {
    sku: "PAS-GUL-001",
    name: "Papperspåse, gul stor",
    species: null,
    category: "Torrvaror",
    unit: "piece",
    vatRate: 25,
    active: true,
    imageUrl: null,
  },
];

export const seedBatches: Batch[] = [
  // Lax — två batcher, en äldre och en ny
  {
    batchId: "B-LAX-20260420-N1",
    sku: "LAX-HEL-001",
    caughtDate: daysAgo(2),
    vessel: "MS Nordlyset",
    faoZone: "FAO 27.IV.a",
    mscCertified: true,
    aslCertified: false,
    countryOfOrigin: "NO",
    supplier: "Salmar ASA",
    purchasePriceOre: 12500,    // 125,00 NOK/kg
    purchaseCurrency: "NOK",
    fxRateToSek: 0.98,
    receivedDate: daysAgo(2),
    expiryDate: daysAhead(3),
  },
  {
    batchId: "B-LAX-20260422-N2",
    sku: "LAX-HEL-001",
    caughtDate: daysAgo(0),
    vessel: "MS Havbris",
    faoZone: "FAO 27.IV.a",
    mscCertified: true,
    aslCertified: false,
    countryOfOrigin: "NO",
    supplier: "Salmar ASA",
    purchasePriceOre: 13200,    // priset har gått upp
    purchaseCurrency: "NOK",
    fxRateToSek: 0.98,
    receivedDate: today,
    expiryDate: daysAhead(5),
  },
  // Laxfilé
  {
    batchId: "B-LAXFIL-20260421-N1",
    sku: "LAX-FIL-001",
    caughtDate: daysAgo(1),
    vessel: "MS Havbris",
    faoZone: "FAO 27.IV.a",
    mscCertified: true,
    aslCertified: false,
    countryOfOrigin: "NO",
    supplier: "Salmar ASA",
    purchasePriceOre: 19500,
    purchaseCurrency: "NOK",
    fxRateToSek: 0.98,
    receivedDate: daysAgo(1),
    expiryDate: daysAhead(3),
  },
  // Torsk
  {
    batchId: "B-TOR-20260420-I1",
    sku: "TOR-FIL-001",
    caughtDate: daysAgo(3),
    vessel: "MS Hafborg",
    faoZone: "FAO 27.II.a",
    mscCertified: true,
    aslCertified: false,
    countryOfOrigin: "IS",
    supplier: "Iceland Seafood",
    purchasePriceOre: 1850,     // 18,50 EUR/kg
    purchaseCurrency: "EUR",
    fxRateToSek: 11.52,
    receivedDate: daysAgo(2),
    expiryDate: daysAhead(2),
  },
  // Räkor
  {
    batchId: "B-RAK-20260418-S1",
    sku: "RAK-SKA-001",
    caughtDate: daysAgo(5),
    vessel: "MS Gärdvik",
    faoZone: "FAO 27.IIIa",
    mscCertified: true,
    aslCertified: false,
    countryOfOrigin: "SE",
    supplier: "Räksjön AB",
    purchasePriceOre: 4500,     // 45,00 SEK per 250g-burk
    purchaseCurrency: "SEK",
    fxRateToSek: 1.0,
    receivedDate: daysAgo(3),
    expiryDate: daysAhead(10),
  },
  // Hummer
  {
    batchId: "B-HUM-20260422-S1",
    sku: "HUM-LEV-001",
    caughtDate: daysAgo(1),
    vessel: "MS Skagerrak",
    faoZone: "FAO 27.IIIa",
    mscCertified: false,
    aslCertified: false,
    countryOfOrigin: "SE",
    supplier: "Bohus Havsfisk",
    purchasePriceOre: 45000,    // 450 kr/styck
    purchaseCurrency: "SEK",
    fxRateToSek: 1.0,
    receivedDate: today,
    expiryDate: daysAhead(2),
  },
  // Ostron
  {
    batchId: "B-OST-20260421-S1",
    sku: "OST-BOH-001",
    caughtDate: daysAgo(1),
    vessel: "Handplockade",
    faoZone: "FAO 27.IIIa",
    mscCertified: false,
    aslCertified: false,
    countryOfOrigin: "SE",
    supplier: "Ostronakademin",
    purchasePriceOre: 1800,     // 18 kr/styck
    purchaseCurrency: "SEK",
    fxRateToSek: 1.0,
    receivedDate: daysAgo(1),
    expiryDate: daysAhead(5),
  },
  // Gravad lax
  {
    batchId: "B-GRAVLAX-20260421-E1",
    sku: "GRA-LAX-001",
    caughtDate: null,
    vessel: null,
    faoZone: null,
    mscCertified: false,
    aslCertified: false,
    countryOfOrigin: "SE",
    supplier: "Eget tillverkat",
    purchasePriceOre: 18000,    // kostnadskalkyl 180 kr/kg
    purchaseCurrency: "SEK",
    fxRateToSek: 1.0,
    receivedDate: daysAgo(1),
    expiryDate: daysAhead(7),
  },
  // Påsar
  {
    batchId: "B-PAS-20260415-S1",
    sku: "PAS-GUL-001",
    caughtDate: null,
    vessel: null,
    faoZone: null,
    mscCertified: false,
    aslCertified: false,
    countryOfOrigin: "SE",
    supplier: "Emballage Väst",
    purchasePriceOre: 200,      // 2 kr/påse
    purchaseCurrency: "SEK",
    fxRateToSek: 1.0,
    receivedDate: daysAgo(7),
    expiryDate: null,
  },
];

/**
 * Lagerfördelning per butik.
 * Gram för viktvaror, antal för styckvaror.
 */
export const seedAllocations: StoreBatchAllocation[] = [
  // Amhult har färska varor
  { storeId: "amhult", batchId: "B-LAX-20260422-N2",    sku: "LAX-HEL-001", quantityRemaining: 25000, reservedQuantity: 0 },
  { storeId: "amhult", batchId: "B-LAXFIL-20260421-N1", sku: "LAX-FIL-001", quantityRemaining: 8000,  reservedQuantity: 0 },
  { storeId: "amhult", batchId: "B-TOR-20260420-I1",    sku: "TOR-FIL-001", quantityRemaining: 5000,  reservedQuantity: 0 },
  { storeId: "amhult", batchId: "B-RAK-20260418-S1",    sku: "RAK-SKA-001", quantityRemaining: 15,    reservedQuantity: 0 },
  { storeId: "amhult", batchId: "B-HUM-20260422-S1",    sku: "HUM-LEV-001", quantityRemaining: 8,     reservedQuantity: 0 },
  { storeId: "amhult", batchId: "B-OST-20260421-S1",    sku: "OST-BOH-001", quantityRemaining: 60,    reservedQuantity: 0 },
  { storeId: "amhult", batchId: "B-GRAVLAX-20260421-E1", sku: "GRA-LAX-001", quantityRemaining: 3000, reservedQuantity: 0 },
  { storeId: "amhult", batchId: "B-PAS-20260415-S1",    sku: "PAS-GUL-001", quantityRemaining: 200,   reservedQuantity: 0 },

  // Särö (premium) har både den nya och den äldre laxbatchen
  { storeId: "saro",    batchId: "B-LAX-20260420-N1",    sku: "LAX-HEL-001", quantityRemaining: 12000, reservedQuantity: 0 },
  { storeId: "saro",    batchId: "B-LAX-20260422-N2",    sku: "LAX-HEL-001", quantityRemaining: 18000, reservedQuantity: 0 },
  { storeId: "saro",    batchId: "B-LAXFIL-20260421-N1", sku: "LAX-FIL-001", quantityRemaining: 6000,  reservedQuantity: 0 },
  { storeId: "saro",    batchId: "B-HUM-20260422-S1",    sku: "HUM-LEV-001", quantityRemaining: 12,    reservedQuantity: 0 },
  { storeId: "saro",    batchId: "B-OST-20260421-S1",    sku: "OST-BOH-001", quantityRemaining: 80,    reservedQuantity: 0 },

  // Torslanda (volym)
  { storeId: "torslanda", batchId: "B-LAX-20260422-N2",   sku: "LAX-HEL-001", quantityRemaining: 30000, reservedQuantity: 0 },
  { storeId: "torslanda", batchId: "B-TOR-20260420-I1",   sku: "TOR-FIL-001", quantityRemaining: 8000,  reservedQuantity: 0 },
  { storeId: "torslanda", batchId: "B-RAK-20260418-S1",   sku: "RAK-SKA-001", quantityRemaining: 20,    reservedQuantity: 0 },
  { storeId: "torslanda", batchId: "B-PAS-20260415-S1",   sku: "PAS-GUL-001", quantityRemaining: 300,   reservedQuantity: 0 },
];

export const seedPricingRules = {
  "LAX-HEL-001": {
    sku: "LAX-HEL-001", strategy: "markup" as const,
    markupPercent: 45, targetMarginPercent: null, fixedPriceOre: null,
    minPriceOre: 18000, maxPriceOre: 35000,
    storeMultipliers: { saro: 1.15, amhult: 1.0, torslanda: 0.95 },
    roundToOre: 100,
  },
  "LAX-FIL-001": {
    sku: "LAX-FIL-001", strategy: "target-margin" as const,
    markupPercent: null, targetMarginPercent: 32, fixedPriceOre: null,
    minPriceOre: 25000, maxPriceOre: 45000,
    storeMultipliers: { saro: 1.15, amhult: 1.0, torslanda: 0.95 },
    roundToOre: 100,
  },
  "TOR-FIL-001": {
    sku: "TOR-FIL-001", strategy: "markup" as const,
    markupPercent: 40, targetMarginPercent: null, fixedPriceOre: null,
    minPriceOre: 22000, maxPriceOre: 40000,
    storeMultipliers: { saro: 1.15, amhult: 1.0, torslanda: 0.95 },
    roundToOre: 100,
  },
  "RAK-SKA-001": {
    sku: "RAK-SKA-001", strategy: "markup" as const,
    markupPercent: 35, targetMarginPercent: null, fixedPriceOre: null,
    minPriceOre: 5500, maxPriceOre: 9500,
    storeMultipliers: { saro: 1.15, amhult: 1.0, torslanda: 1.0 },
    roundToOre: 50,
  },
  "HUM-LEV-001": {
    sku: "HUM-LEV-001", strategy: "target-margin" as const,
    markupPercent: null, targetMarginPercent: 30, fixedPriceOre: null,
    minPriceOre: 50000, maxPriceOre: 90000,
    storeMultipliers: { saro: 1.20, amhult: 1.0, torslanda: 0.95 },
    roundToOre: 500,
  },
  "OST-BOH-001": {
    sku: "OST-BOH-001", strategy: "markup" as const,
    markupPercent: 60, targetMarginPercent: null, fixedPriceOre: null,
    minPriceOre: 2500, maxPriceOre: 5500,
    storeMultipliers: { saro: 1.15, amhult: 1.0, torslanda: 1.0 },
    roundToOre: 100,
  },
  "GRA-LAX-001": {
    sku: "GRA-LAX-001", strategy: "fixed" as const,
    markupPercent: null, targetMarginPercent: null, fixedPriceOre: 32900,
    minPriceOre: null, maxPriceOre: null,
    storeMultipliers: { saro: 1.0, amhult: 1.0, torslanda: 1.0 },
    roundToOre: 100,
  },
  "PAS-GUL-001": {
    sku: "PAS-GUL-001", strategy: "fixed" as const,
    markupPercent: null, targetMarginPercent: null, fixedPriceOre: 500,
    minPriceOre: null, maxPriceOre: null,
    storeMultipliers: { saro: 1.0, amhult: 1.0, torslanda: 1.0 },
    roundToOre: 100,
  },
};
