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

/* ── NRV-metoden (nettoförsäljningsvärde) ────────────────────────────
 *
 * Partiets råvarukostnad fördelas på detaljernas INTÄKTSANDEL, inte jämnt per
 * kilo. Priserna sätts manuellt per prislista; en detalj utan pris blockerar
 * kalkylen. Förädlingspåslaget är fast kr/kg och bärs av varje detalj för sig,
 * vilket gör att den billigaste detaljen alltid får lägst marginal.
 */

export interface NrvLineInput {
  key: string;
  qtyKg: number;
  /** Pris exkl moms per kg. null = pris saknas. */
  priceExVat: number | null;
  surchargePerKg?: number;
}

export interface NrvLineResult {
  key: string;
  qtyKg: number;
  priceExVat: number;
  revenueExVat: number;
  /** Andel av partiets intäkt (0–1). */
  revenueShare: number;
  /** Fördelad råvarukostnad per kg. */
  rawCostPerKg: number;
  surchargePerKg: number;
  /** Fördelad råvarukostnad + påslag per kg. */
  totalCostPerKg: number;
  marginPct: number;
  belowTarget: boolean;
}

export interface NrvResult {
  revenueExVat: number;
  rawCost: number;
  surchargeCost: number;
  totalCost: number;
  /** Partiets marginal i procent av intäkten. */
  batchMarginPct: number;
  /** Intäkt per färdigt kilo (V). */
  revenuePerOutputKg: number;
  outputKg: number;
  lines: NrvLineResult[];
  /** Nyckeln för detaljen med lägst marginal. */
  lowestMarginKey: string | null;
  /** Detaljer utan satt pris — kalkylen är då ofullständig. */
  missingPriceKeys: string[];
  batchBelowTarget: boolean;
}

export function priceByNrv(params: {
  purchasePricePerKg: number;
  rawQuantity: number;
  targetMarginPct: number;
  lines: NrvLineInput[];
}): NrvResult {
  const target = pctToFrac(params.targetMarginPct);
  const rawCost = (Number(params.purchasePricePerKg) || 0) * (Number(params.rawQuantity) || 0);
  const priced = params.lines.map((l) => ({
    ...l,
    qtyKg: Math.max(0, Number(l.qtyKg) || 0),
    priceEx: Number(l.priceExVat) > 0 ? Number(l.priceExVat) : 0,
    surcharge: Number(l.surchargePerKg) || 0,
  }));

  const missingPriceKeys = params.lines
    .filter((l) => !(Number(l.priceExVat) > 0))
    .map((l) => l.key);

  const outputKg = priced.reduce((s, l) => s + l.qtyKg, 0);
  const surchargeCost = priced.reduce((s, l) => s + l.qtyKg * l.surcharge, 0);
  const revenueExVat = priced.reduce((s, l) => s + l.qtyKg * l.priceEx, 0);
  const totalCost = rawCost + surchargeCost;

  const lines: NrvLineResult[] = priced.map((l) => {
    const revenue = l.qtyKg * l.priceEx;
    const share = revenueExVat > 0 ? revenue / revenueExVat : 0;
    const rawCostPerKg = l.qtyKg > 0 ? (rawCost * share) / l.qtyKg : 0;
    const totalCostPerKg = rawCostPerKg + l.surcharge;
    const marginPct = l.priceEx > 0 ? ((l.priceEx - totalCostPerKg) / l.priceEx) * 100 : 0;
    return {
      key: l.key,
      qtyKg: l.qtyKg,
      priceExVat: l.priceEx,
      revenueExVat: revenue,
      revenueShare: share,
      rawCostPerKg,
      surchargePerKg: l.surcharge,
      totalCostPerKg,
      marginPct,
      belowTarget: l.priceEx > 0 && marginPct < params.targetMarginPct,
    };
  });

  const withPrice = lines.filter((l) => l.priceExVat > 0 && l.qtyKg > 0);
  const lowest = withPrice.reduce<NrvLineResult | null>(
    (m, l) => (m === null || l.marginPct < m.marginPct ? l : m),
    null,
  );
  const batchMarginPct = revenueExVat > 0 ? ((revenueExVat - totalCost) / revenueExVat) * 100 : 0;

  return {
    revenueExVat,
    rawCost,
    surchargeCost,
    totalCost,
    batchMarginPct,
    revenuePerOutputKg: outputKg > 0 ? revenueExVat / outputKg : 0,
    outputKg,
    lines,
    lowestMarginKey: lowest?.key ?? null,
    missingPriceKeys,
    batchBelowTarget: revenueExVat > 0 && batchMarginPct < params.targetMarginPct - 1e-9,
  };
}


/**
 * Startförslag för en detalj som saknar pris: fördelad kostnad per kilo räknad
 * jämnt över partiets kilon, uppräknad mot marginalmålet. Det är ett förslag,
 * aldrig ett automatiskt satt pris.
 */
export function nrvStartSuggestionExVat(params: {
  purchasePricePerKg: number;
  rawQuantity: number;
  outputKg: number;
  surchargePerKg: number;
  targetMarginPct: number;
}): number {
  const target = pctToFrac(params.targetMarginPct);
  if (target >= 1) return 0;
  const rawPerKg =
    params.outputKg > 0
      ? ((Number(params.purchasePricePerKg) || 0) * (Number(params.rawQuantity) || 0)) / params.outputKg
      : 0;
  return (rawPerKg + (Number(params.surchargePerKg) || 0)) / (1 - target);
}

/**
 * Auktionskalkyl: högsta försvarbara inköpspris per kg råvara, både för att
 * PARTIET ska hålla målet och för att VARJE DETALJ ska hålla målet.
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
  /** Partiet håller målet. */
  maxPricePerKg: number;
  /** Alla detaljer håller målet (den billigaste detaljen är styrande). */
  maxPricePerKgAllDetails: number;
} {
  const t = pctToFrac(params.targetMarginPct);
  const revenueExVat = params.lines.reduce(
    (s, l) => s + (Number(l.qtyKg) || 0) * (Number(l.priceExVat) || 0),
    0,
  );
  const allowedTotalCost = revenueExVat * (1 - t);
  const surchargeCost = params.lines.reduce(
    (s, l) => s + (Number(l.qtyKg) || 0) * (Number(l.surchargePerKg) || 0),
    0,
  );
  const maxRawCost = allowedTotalCost - surchargeCost;
  const rawQty = Number(params.rawQuantity) || 0;

  // Per detalj: fördelad råvarukostnad = totalRåvara × intäktsandel.
  // Kravet marginal ≥ mål ger totalRåvara ≤ intäkt×(1−t) − påslag_i×kg_i×intäkt/intäkt_i
  let perDetailMaxRawCost = Infinity;
  for (const l of params.lines) {
    const qty = Number(l.qtyKg) || 0;
    const priceEx = Number(l.priceExVat) || 0;
    const revenue = qty * priceEx;
    if (qty <= 0 || revenue <= 0) continue;
    const limit = allowedTotalCost - (Number(l.surchargePerKg) || 0) * qty * (revenueExVat / revenue);
    perDetailMaxRawCost = Math.min(perDetailMaxRawCost, limit);
  }
  if (!isFinite(perDetailMaxRawCost)) perDetailMaxRawCost = maxRawCost;

  return {
    revenueExVat,
    allowedTotalCost,
    surchargeCost,
    maxRawCost,
    maxPricePerKg: rawQty > 0 ? maxRawCost / rawQty : 0,
    maxPricePerKgAllDetails: rawQty > 0 ? perDetailMaxRawCost / rawQty : 0,
  };
}



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
