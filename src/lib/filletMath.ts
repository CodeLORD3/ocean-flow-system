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
 * Marginalvikten används ENBART för att fördela huvudproduktens intäkt när ett
 * parti har flera primary-detaljer. Vikterna normaliseras så att det kilo-viktade
 * snittet blir exakt 1,0.
 */
export function normalizeWeights(lines: { qtyKg: number; marginWeight?: number | null }[]): number[] {
  const totalQty = lines.reduce((s, l) => s + Math.max(0, Number(l.qtyKg) || 0), 0);
  const weighted = lines.reduce(
    (s, l) => s + Math.max(0, Number(l.qtyKg) || 0) * (Number(l.marginWeight) || 1),
    0,
  );
  const factor = weighted > 0 ? totalQty / weighted : 1;
  return lines.map((l) => (Number(l.marginWeight) || 1) * factor);
}

/* ── Biproduktsmetoden ───────────────────────────────────────────────
 *
 * Biprodukter tilldelas ingen andel av den gemensamma kostnaden. Deras intäkt
 * dras i stället av från partiets krävda intäkt, och huvudprodukten bär resten.
 * Residualen är ett GOLVPRIS — inte ett pris som ersätter ett redan fastställt.
 */

export interface PrimaryInput {
  key: string;
  qtyKg: number;
  marginWeight?: number | null;
  surchargePerKg?: number;
  /** Senast fastställt butikspris inkl moms (referensvärde). */
  lastSetPrice?: number | null;
  vatPct?: number;
}

export interface ByproductInput {
  key: string;
  qtyKg: number;
  /** Manuellt satt marknadspris inkl moms. null/0 = inget pris satt. */
  priceInclVat?: number | null;
  surchargePerKg?: number;
  vatPct?: number;
}

export interface PrimaryResult {
  key: string;
  qtyKg: number;
  /** Golvpris exkl moms (residualen). */
  floorExVat: number;
  /** Golvpris inkl moms, avrundat uppåt till tillåten slutsiffra. */
  floorInclVat: number;
  /** Senast fastställt pris inkl moms (0 om okänt). */
  lastSetPrice: number;
  /** Föreslaget pris = högsta av golv och senast fastställt. */
  suggestedInclVat: number;
  /** Hur många procent golvet ligger över senast fastställt pris. */
  floorAboveLastPct: number;
  /** Golvet ligger mer än 25 % över senast fastställt pris. */
  alertExpensive: boolean;
  /** Golvet ligger under det högsta biproduktpriset → rollerna är fel klassade. */
  alertRoleMismatch: boolean;
}

export interface ByproductMethodResult {
  rawCost: number;
  surchargeCost: number;
  totalCost: number;
  byproductRevenueExVat: number;
  requiredRevenueExVat: number;
  primaryRevenueExVat: number;
  primaries: PrimaryResult[];
  /** Biprodukter som saknar pris (räknas som 0 kr intäkt). */
  missingPriceKeys: string[];
  warnings: string[];
  /** Partiets marginal när huvudprodukterna säljs på golvpriset. */
  batchAtFloor: ReturnType<typeof batchMargin>;
}

export function priceByByproductMethod(params: {
  purchasePricePerKg: number;
  rawQuantity: number;
  targetMarginPct: number;
  vatPct: number;
  primaries: PrimaryInput[];
  byproducts: ByproductInput[];
}): ByproductMethodResult {
  const vatFactor = 1 + pctToFrac(params.vatPct);
  const target = pctToFrac(params.targetMarginPct);

  const all = [...params.primaries, ...params.byproducts];
  const rawCost = (Number(params.purchasePricePerKg) || 0) * (Number(params.rawQuantity) || 0);
  // Alla kilon bär förädlingspåslag, även biprodukter utan satt pris.
  const surchargeCost = all.reduce(
    (s, l) => s + (Number(l.qtyKg) || 0) * (Number(l.surchargePerKg) || 0),
    0,
  );
  const totalCost = rawCost + surchargeCost;

  const missingPriceKeys = params.byproducts
    .filter((b) => !(Number(b.priceInclVat) > 0))
    .map((b) => b.key);

  const bpVat = (b: ByproductInput) => 1 + pctToFrac(b.vatPct ?? params.vatPct);
  const byproductRevenueExVat = params.byproducts.reduce(
    (s, b) => s + (Number(b.qtyKg) || 0) * ((Number(b.priceInclVat) || 0) / bpVat(b)),
    0,
  );
  const maxByproductInclVat = params.byproducts.reduce(
    (m, b) => Math.max(m, Number(b.priceInclVat) || 0),
    0,
  );

  const requiredRevenueExVat = target < 1 ? totalCost / (1 - target) : 0;
  const primaryRevenueExVat = Math.max(0, requiredRevenueExVat - byproductRevenueExVat);

  const primaryQty = params.primaries.reduce((s, p) => s + Math.max(0, Number(p.qtyKg) || 0), 0);
  const weights = normalizeWeights(params.primaries);
  const basePerKg = primaryQty > 0 ? primaryRevenueExVat / primaryQty : 0;

  const warnings: string[] = [];
  const primaries: PrimaryResult[] = params.primaries.map((p, i) => {
    const floorExVat = basePerKg * weights[i];
    const vf = 1 + pctToFrac(p.vatPct ?? params.vatPct);
    const floorInclVat = roundUpToAllowedPrice(floorExVat * vf);
    const lastSetPrice = Number(p.lastSetPrice) || 0;
    const suggestedInclVat = Math.max(floorInclVat, lastSetPrice);
    const floorAboveLastPct = lastSetPrice > 0 ? ((floorInclVat - lastSetPrice) / lastSetPrice) * 100 : 0;
    const alertExpensive = lastSetPrice > 0 && floorAboveLastPct > 25;
    const alertRoleMismatch = maxByproductInclVat > 0 && floorInclVat < maxByproductInclVat;
    return {
      key: p.key,
      qtyKg: Number(p.qtyKg) || 0,
      floorExVat,
      floorInclVat,
      lastSetPrice,
      suggestedInclVat,
      floorAboveLastPct,
      alertExpensive,
      alertRoleMismatch,
    };
  });

  if (primaries.some((p) => p.alertExpensive)) {
    warnings.push(
      "råvaran är dyr eller biprodukterna säljs för billigt, kontrollera innan du fastställer priset",
    );
  }
  if (primaries.some((p) => p.alertRoleMismatch)) {
    warnings.push("golvpriset ligger under högsta biproduktpriset — rollerna är troligen fel klassade");
  }
  if (missingPriceKeys.length > 0) {
    warnings.push(
      `${missingPriceKeys.length} biprodukt(er) saknar pris och räknas som 0 kr intäkt, vilket drar upp huvudproduktens golvpris`,
    );
  }

  const batchAtFloor = batchMargin({
    purchasePricePerKg: params.purchasePricePerKg,
    rawQuantity: params.rawQuantity,
    lines: [
      ...primaries.map((p, i) => ({
        qty: p.qtyKg,
        priceExVat: p.floorInclVat / (1 + pctToFrac(params.primaries[i].vatPct ?? params.vatPct)),
        surchargePerKg: Number(params.primaries[i].surchargePerKg) || 0,
      })),
      ...params.byproducts.map((b) => ({
        qty: Number(b.qtyKg) || 0,
        priceExVat: (Number(b.priceInclVat) || 0) / bpVat(b),
        surchargePerKg: Number(b.surchargePerKg) || 0,
      })),
    ],
  });

  void vatFactor;
  return {
    rawCost,
    surchargeCost,
    totalCost,
    byproductRevenueExVat,
    requiredRevenueExVat,
    primaryRevenueExVat,
    primaries,
    missingPriceKeys,
    warnings,
    batchAtFloor,
  };
}

/**
 * Auktionskalkyl (omvänd beräkning): alla utpriser kända → högsta försvarbara
 * inköpspris per kg råvara.
 */
export function auctionMaxRawPrice(params: {
  rawQuantity: number;
  targetMarginPct: number;
  lines: { qtyKg: number; priceExVat: number; surchargePerKg?: number }[];
}): {
  revenueExVat: number;
  allowedTotalCost: number;
  surchargeCost: number;
  maxRawCost: number;
  maxPricePerKg: number;
} {
  const revenueExVat = params.lines.reduce(
    (s, l) => s + (Number(l.qtyKg) || 0) * (Number(l.priceExVat) || 0),
    0,
  );
  const allowedTotalCost = revenueExVat * (1 - pctToFrac(params.targetMarginPct));
  const surchargeCost = params.lines.reduce(
    (s, l) => s + (Number(l.qtyKg) || 0) * (Number(l.surchargePerKg) || 0),
    0,
  );
  const maxRawCost = allowedTotalCost - surchargeCost;
  const rawQty = Number(params.rawQuantity) || 0;
  return {
    revenueExVat,
    allowedTotalCost,
    surchargeCost,
    maxRawCost,
    maxPricePerKg: rawQty > 0 ? maxRawCost / rawQty : 0,
  };
}


/* Den tidigare per-detalj-prissättningen (calcDetailPrice/weightedTarget) är
 * borttagen. Priser sätts nu med biproduktsmetoden ovan. */


/**
 * Partiets samlade marginal: total intäkt exkl moms mot partiets kostnader.
 *
 *  - marginOnRawPct: bara råvarukostnaden räknas som kostnad
 *  - marginInclWorkPct: råvarukostnad + förädlingspåslag (kr/kg × kg) räknas
 *    som kostnad. Detta tal jämförs med regionens marginalmål.
 */
export function batchMargin(params: {
  purchasePricePerKg: number;
  rawQuantity: number;
  lines: { qty: number; priceExVat: number; surchargePerKg?: number }[];
}): {
  revenueExVat: number;
  rawCost: number;
  surchargeCost: number;
  marginOnRawPct: number;
  marginInclWorkPct: number;
} {
  const rawCost = (Number(params.purchasePricePerKg) || 0) * (Number(params.rawQuantity) || 0);
  const revenueExVat = params.lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.priceExVat) || 0), 0);
  const surchargeCost = params.lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.surchargePerKg) || 0), 0);
  const marginOnRawPct = revenueExVat > 0 ? ((revenueExVat - rawCost) / revenueExVat) * 100 : 0;
  const marginInclWorkPct =
    revenueExVat > 0 ? ((revenueExVat - rawCost - surchargeCost) / revenueExVat) * 100 : 0;
  return { revenueExVat, rawCost, surchargeCost, marginOnRawPct, marginInclWorkPct };
}

export const fmt = (n: number, decimals = 2) =>
  (Number(n) || 0).toLocaleString("sv-SE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export const FORMS = [
  "hel",
  "rensad",
  "urtagen utan huvud",
  "filé med skinn",
  "filé utan skinn",
  "hel filé",
  "rygg",
  "kontrarygg",
  "slag",
  "benfri filé",
  "buk",
  "fletch",
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
 * Fördelar partiets totala råvarukostnad JÄMNT PER KILO över styckdetaljerna:
 * total råvarukostnad / summa färdiga kilo. Alla detaljer får alltså samma
 * kostpris per kg.
 *
 * Marginalvikten används medvetet INTE här — den påverkar bara det effektiva
 * marginalmålet (se weightedTarget). Annars skulle vikten räknas två gånger och
 * partiets marginal hamna långt över målet.
 *
 * Vid en enda detalj blir resultatet identiskt med inköpspris / utbyte.
 */
export function allocateRawCost(
  details: { qtyKg: number; marginWeight?: number | null }[],
  purchasePricePerKg: number,
  rawQtyKg: number,
): number[] {
  const totalRawCost = (Number(purchasePricePerKg) || 0) * (Number(rawQtyKg) || 0);
  const totalQty = details.reduce((s, d) => s + Math.max(0, Number(d.qtyKg) || 0), 0);
  const perKg = totalQty > 0 ? totalRawCost / totalQty : 0;
  return details.map((d) => ((Number(d.qtyKg) || 0) > 0 ? perKg : 0));
}
