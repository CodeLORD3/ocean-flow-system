/**
 * Beräkningar för Filé/Tillverkning.
 *
 * Ordning enligt spec:
 *  a. råvarukostnad = inköpspris / utbyte
 *  b. plus förädlingspåslag
 *  c. utpris exkl moms = summan / (1 - marginalmål)
 *  d. utpris inkl moms = × (1 + momssats)
 *  e. avrundning uppåt till tillåten slutsiffra
 */

/** Tillåtna slutsiffror över 29 kr, inom varje hundratal. */
const ENDINGS_HIGH = [29, 49, 79, 98];
/** Tillåtna slutsiffror under 29 kr. */
const ENDINGS_LOW = [9, 19, 29];

/** Avrundar ALLTID uppåt till närmaste tillåtna slutsiffra (aldrig nedåt). */
export function roundUpToAllowedPrice(value: number): number {
  if (!isFinite(value) || value <= 0) return 0;
  for (const e of ENDINGS_LOW) if (value <= e) return e;
  for (let hundred = 0; hundred <= 1000; hundred++) {
    for (const e of ENDINGS_HIGH) {
      const candidate = hundred * 100 + e;
      if (candidate >= value - 1e-9) return candidate;
    }
  }
  return Math.ceil(value);
}

/** Utbytesfraktion (0–1) från procent. */
export const pctToFrac = (pct: number) => (Number(pct) || 0) / 100;

/**
 * Effektivt marginalmål för en detalj utifrån partiets mål och detaljens
 * marginalvikt. Vikt > 1 → detaljen bär mer av marginalen (t.ex. rygg).
 */
export function weightedTarget(targetPct: number, marginWeight: number): number {
  const t = pctToFrac(targetPct);
  const w = Number(marginWeight) || 1;
  const eff = 1 - (1 - t) / w;
  return Math.min(0.85, Math.max(0.05, eff));
}

export interface DetailPriceInput {
  /** Inköpspris per kg råvara (SEK) */
  purchasePricePerKg: number;
  /** Sammanlagt utbyte från råvara till denna detalj, i procent (utbyte × uppdelning) */
  totalYieldPct: number;
  /** Förädlingspåslag kr/färdigt kg (0 om varan säljs som den köps) */
  surchargePerKg: number;
  /** Marginalmål för regionen i procent */
  targetMarginPct: number;
  /** Marginalvikt för detaljen */
  marginWeight: number;
  /** Momssats i procent */
  vatPct: number;
}

export interface DetailPriceResult {
  /** Råvarukostnad per säljbart kg */
  rawCostPerKg: number;
  /** Råvarukostnad + förädlingspåslag */
  costWithSurcharge: number;
  /** Utpris exkl moms före avrundning */
  priceExVatRaw: number;
  /** Utpris inkl moms före avrundning */
  priceIncVatRaw: number;
  /** Butikspris inkl moms, avrundat uppåt */
  priceIncVat: number;
  /** Pris exkl moms räknat tillbaka från butikspriset */
  priceExVat: number;
  /**
   * Marginal på råvara (%): (pris exkl moms − råvarukostnad) / pris exkl moms.
   * Förädlingspåslaget räknas här som intäkt.
   */
  marginOnRawPct: number;
  /**
   * Marginal inklusive arbete (%):
   * (pris exkl moms − råvarukostnad − påslag) / pris exkl moms.
   * Det här är talet som är jämförbart med bokföringen.
   */
  marginInclWorkPct: number;
  /** @deprecated alias för marginOnRawPct */
  actualMarginPct: number;
  /** Effektivt marginalmål (%) efter marginalvikt */
  effectiveTargetPct: number;
}

export function calcDetailPrice(input: DetailPriceInput & { rawCostOverride?: number }): DetailPriceResult {
  const yieldFrac = pctToFrac(input.totalYieldPct);
  const rawCostPerKg =
    input.rawCostOverride != null && input.rawCostOverride > 0
      ? input.rawCostOverride
      : yieldFrac > 0
      ? input.purchasePricePerKg / yieldFrac
      : 0;
  const surcharge = Number(input.surchargePerKg) || 0;
  const costWithSurcharge = rawCostPerKg + surcharge;

  const effTarget = weightedTarget(input.targetMarginPct, input.marginWeight);
  const priceExVatRaw = costWithSurcharge > 0 ? costWithSurcharge / (1 - effTarget) : 0;
  const vatFactor = 1 + pctToFrac(input.vatPct);
  const priceIncVatRaw = priceExVatRaw * vatFactor;
  const priceIncVat = roundUpToAllowedPrice(priceIncVatRaw);
  const priceExVat = vatFactor > 0 ? priceIncVat / vatFactor : 0;
  const actualMarginPct = priceExVat > 0 ? ((priceExVat - rawCostPerKg) / priceExVat) * 100 : 0;

  return {
    rawCostPerKg,
    costWithSurcharge,
    priceExVatRaw,
    priceIncVatRaw,
    priceIncVat,
    priceExVat,
    actualMarginPct,
    effectiveTargetPct: effTarget * 100,
  };
}

/**
 * Partiets samlade marginal: total intäkt exkl moms mot total råvarukostnad
 * för hela partiet (inköpspris × råvarukvantitet).
 */
export function batchMargin(params: {
  purchasePricePerKg: number;
  rawQuantity: number;
  lines: { qty: number; priceExVat: number }[];
}): { revenueExVat: number; rawCost: number; marginPct: number } {
  const rawCost = (Number(params.purchasePricePerKg) || 0) * (Number(params.rawQuantity) || 0);
  const revenueExVat = params.lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.priceExVat) || 0), 0);
  const marginPct = revenueExVat > 0 ? ((revenueExVat - rawCost) / revenueExVat) * 100 : 0;
  return { revenueExVat, rawCost, marginPct };
}

export const fmt = (n: number, decimals = 2) =>
  (Number(n) || 0).toLocaleString("sv-SE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export const FORMS = [
  "hel",
  "rensad",
  "urtagen utan huvud",
  "filé med skinn",
  "filé utan skinn",
  "rygg",
  "kontrarygg",
  "slag",
  "stjärtbit",
  "kotlett",
  "sida",
  "sida med skinn",
  "portion",
  "färs",
  "ben",
  "stjärt",
  "rensad stjärt",
  "klor",
  "kött",
  "loin",
  "avskär",
  "huvud",
  "säljbar",
  "övrigt",
] as const;

/** Detaljer som räknas som förädlade (påslag gäller). */
export function isProcessedForm(form: string): boolean {
  const f = (form || "").toLowerCase();
  if (f === "hel" || f === "säljbar") return false;
  return true;
}

/**
 * Fördelar partiets totala råvarukostnad över styckdetaljerna.
 * Fördelningsnyckel = kg × marginalvikt, så att dyra detaljer (loin/rygg) bär
 * mer av råvarukostnaden än billiga (slag/bitar).
 *
 * Vid en enda detalj blir resultatet identiskt med inköpspris / utbyte.
 */
export function allocateRawCost(
  details: { qtyKg: number; marginWeight?: number | null }[],
  purchasePricePerKg: number,
  rawQtyKg: number,
): number[] {
  const totalRawCost = (Number(purchasePricePerKg) || 0) * (Number(rawQtyKg) || 0);
  const keys = details.map((d) => Math.max(0, Number(d.qtyKg) || 0) * (Number(d.marginWeight) || 1));
  const keySum = keys.reduce((a, b) => a + b, 0);
  return details.map((d, i) => {
    const qty = Number(d.qtyKg) || 0;
    if (qty <= 0 || keySum <= 0) return 0;
    return (totalRawCost * (keys[i] / keySum)) / qty;
  });
}
