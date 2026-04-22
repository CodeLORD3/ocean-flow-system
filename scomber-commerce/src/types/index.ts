/**
 * Scomber Commerce — domänmodell
 *
 * Alla belopp i öre (integer) för SEK.
 * Alla vikter i gram (integer).
 * Alla datum som ISO 8601-strängar med tidszon.
 */

export type StoreId = string;   // t.ex. "amhult", "saro", "torslanda"
export type SKU = string;        // Makrilltrade artikel-ID
export type BatchId = string;    // Unik batch/lot från Makrilltrade

/**
 * Artikel = produkt i sortimentet.
 * Själva definitionen kommer från Makrilltrade.
 * Priser och lokala justeringar hanteras i Scomber.
 */
export interface Article {
  sku: SKU;
  name: string;
  species: string | null;          // "Salmo salar" — null för icke-fisk
  category: string;                // "Färsk fisk", "Skaldjur", etc.
  unit: "kg" | "piece";
  vatRate: 6 | 12 | 25;            // Livsmedel = 6 från april 2026
  active: boolean;
  imageUrl: string | null;
}

/**
 * Batch = ett parti av en artikel med specifik ursprungsdata.
 * Samma artikel kan ha flera samtidiga batcher i butik.
 * Används för spårbarhet enligt EU 1379/2013 + MSC.
 */
export interface Batch {
  batchId: BatchId;
  sku: SKU;
  caughtDate: string | null;       // "2026-04-20"
  vessel: string | null;           // "MS Nordstjernen"
  faoZone: string | null;          // "FAO 27.IV.a" (Nordsjön)
  mscCertified: boolean;
  aslCertified: boolean;           // Aquaculture Stewardship Council
  countryOfOrigin: string | null;  // "NO", "SE", "IS"
  supplier: string | null;
  purchasePriceOre: number;        // per unit (kg eller styck), i öre
  purchaseCurrency: string;        // "SEK", "EUR", "NOK"
  fxRateToSek: number;             // 1.0 för SEK
  receivedDate: string;            // när den kom till butik
  expiryDate: string | null;
}

/**
 * Batch-allokation i butik — hur mycket av en batch som finns kvar var.
 */
export interface StoreBatchAllocation {
  storeId: StoreId;
  batchId: BatchId;
  sku: SKU;
  quantityRemaining: number;       // gram om kg, antal om piece
  reservedQuantity: number;        // hålls i pågående transaktioner
}

/**
 * Priser beräknade för en given butik vid en given tidpunkt.
 */
export interface ArticlePricing {
  sku: SKU;
  storeId: StoreId;
  currentPriceOre: number;         // vad kassan ska visa just nu
  suggestedPriceOre: number;       // vad prismotorn föreslår
  suggestedAt: string;
  overrideActive: boolean;         // manuell override sätt idag?
  overrideReason: string | null;
  strategy: PricingStrategyName;
  marginPercent: number | null;    // faktisk beräknad marginal mot FIFO-batch
}

export type PricingStrategyName = "markup" | "target-margin" | "fixed" | "manual";

/**
 * Regel för prissättning per artikel.
 * Bor i Scomber-DB:n (ej Makrilltrade).
 */
export interface PricingRule {
  sku: SKU;
  strategy: PricingStrategyName;
  markupPercent: number | null;         // t.ex. 45 → 45% på inköpspris
  targetMarginPercent: number | null;   // t.ex. 30 → säljpris ger 30% bruttomarginal
  fixedPriceOre: number | null;         // om "fixed"
  minPriceOre: number | null;
  maxPriceOre: number | null;
  storeMultipliers: Record<StoreId, number>;  // Särö: 1.15, Torslanda: 1.0
  roundToOre: number;                   // 100 = hela kronor, 50 = 50-öringar
}

/**
 * En färdig transaktion.
 */
export interface Transaction {
  transactionId: string;
  receiptNo: string;
  storeId: StoreId;
  timestamp: string;
  cashierId: string;
  totalOre: number;
  vatBreakdown: VatBreakdownRow[];
  items: TransactionItem[];
  payment: PaymentRecord;
  controlCode: string | null;          // från kontrollenhet
  controlUnitId: string | null;
  type: "sale" | "return" | "b2b-order";
  b2bCustomerId: string | null;        // bara för B2B
  status: "pending" | "completed" | "voided";
}

export interface TransactionItem {
  sku: SKU;
  name: string;
  quantity: number;                // gram om kg, antal om piece
  unit: "kg" | "piece";
  unitPriceOre: number;
  lineTotalOre: number;
  vatRate: 6 | 12 | 25;
  discountOre: number;
  batchAllocations: BatchAllocation[];   // vilken batch(er) som användes
}

export interface BatchAllocation {
  batchId: BatchId;
  quantity: number;                // hur mycket togs från just denna batch
}

export interface VatBreakdownRow {
  rate: 6 | 12 | 25;
  netOre: number;
  vatOre: number;
  grossOre: number;
}

export type PaymentRecord =
  | { type: "card"; authCode: string; cardBrand: string; last4: string }
  | { type: "cash"; tenderedOre: number; changeOre: number }
  | { type: "swish"; reference: string }
  | { type: "b2b-credit"; customerId: string; dueDate: string };

/**
 * B2B-kund (restaurang).
 */
export interface B2BCustomer {
  customerId: string;
  companyName: string;
  orgNr: string;
  creditLimitOre: number;
  currentBalanceOre: number;
  paymentTermsDays: number;        // 30 standard
  deliveryAddress: string;
  active: boolean;
}
