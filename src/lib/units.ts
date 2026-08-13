/**
 * Enhetstolkning för kvantitetsfältet.
 *
 * REGEL: kvantitetsfältet (product_stock_locations.quantity,
 * stock_movements.quantity_kg, lots.quantity_kg, orderrader) lagras alltid i
 * PRODUKTENS EGEN LAGERENHET:
 *   - viktprodukt (unit = kg) -> kilo
 *   - styckprodukt (unit = st) -> antal
 *
 * Priset (lots.unit_cost, product_stock_locations.unit_cost/avg_cost,
 * products.day_price, cost_price, orderrader) är alltid pris PER SAMMA ENHET.
 * Därför gäller överallt: värde = kvantitet × pris — utan viktomräkning.
 * En styckprodukt får aldrig värderas som om antalet vore kilon.
 *
 * Vikt i kilo (t.ex. transportvikt, tullhandlingar) räknas fram separat med
 * stockQtyToKg() och används ALDRIG för att beräkna värde på styckprodukter.
 */

export type StockUnit = "kg" | "st";

const PIECE_UNITS = ["st", "stk", "styck", "styckvis", "pcs", "pc", "piece"];
const KILO_UNITS = ["kg", "kilo", "kilogram", ""];
const GRAM_UNITS = ["g", "gram"];
const BOX_UNITS = ["låda", "lada", "box", "förp", "forp", "kolli", "krt", "kartong"];

export interface UnitProduct {
  unit?: string | null;
  weight_per_piece?: number | null;
  nominal_weight_kg?: number | null;
}

const norm = (u?: string | null) => String(u ?? "").toLowerCase().trim();

export function isPieceUnit(unit?: string | null): boolean {
  return PIECE_UNITS.includes(norm(unit));
}

/** Produktens lagerenhet — den enhet kvantitetsfältet alltid uttrycks i. */
export function stockUnitOf(product?: UnitProduct | null): StockUnit {
  return isPieceUnit(product?.unit) ? "st" : "kg";
}

/** Etikett för kvantitet/pris i gränssnitt och utskrifter. */
export function unitLabel(product?: UnitProduct | null): string {
  return stockUnitOf(product);
}

/** Prisetikett, t.ex. "kr/st" eller "kr/kg". */
export function perUnitLabel(product?: UnitProduct | null): string {
  return `/${stockUnitOf(product)}`;
}

/**
 * Räknar om en inkommande rad (följesedel, leverantörsfil) till produktens
 * lagerenhet. Saknas styck-/lådvikt när omräkning krävs blir det ett hinder
 * i stället för en gissad vikt.
 */
export function toStockQuantity(
  quantity: number | null | undefined,
  lineUnit: string | null | undefined,
  product?: UnitProduct | null,
): { qty: number | null; unit: StockUnit; reason?: string } {
  const target = stockUnitOf(product);
  const qty = Number(quantity ?? 0);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { qty: null, unit: target, reason: "kvantiteten saknas eller är noll" };
  }
  const unit = norm(lineUnit ?? product?.unit ?? target);
  const perPiece = Number(product?.weight_per_piece ?? 0);
  const perBox = Number(product?.nominal_weight_kg ?? 0);

  if (target === "st") {
    // Styckprodukt: allt ska landa i ANTAL.
    if (isPieceUnit(unit)) return { qty: round3(qty), unit: target };
    if (BOX_UNITS.includes(unit)) {
      // Låda på styckvara: nominell vikt + styckvikt ger antal.
      if (perBox > 0 && perPiece > 0) return { qty: round3((qty * perBox) / perPiece), unit: target };
      return { qty: null, unit: target, reason: "antal per låda saknas på produkten" };
    }
    if (KILO_UNITS.includes(unit) || GRAM_UNITS.includes(unit)) {
      const kg = GRAM_UNITS.includes(unit) ? qty / 1000 : qty;
      if (perPiece > 0) return { qty: round3(kg / perPiece), unit: target };
      return { qty: null, unit: target, reason: "styckvikt saknas — kilo kan inte bli antal" };
    }
    return { qty: null, unit: target, reason: `okänd enhet "${unit}"` };
  }

  // Viktprodukt: allt ska landa i KILO.
  if (KILO_UNITS.includes(unit)) return { qty: round3(qty), unit: target };
  if (GRAM_UNITS.includes(unit)) return { qty: round3(qty / 1000), unit: target };
  if (isPieceUnit(unit)) {
    if (perPiece > 0) return { qty: round3(qty * perPiece), unit: target };
    return { qty: null, unit: target, reason: "styckvikt saknas på produkten" };
  }
  if (BOX_UNITS.includes(unit)) {
    if (perBox > 0) return { qty: round3(qty * perBox), unit: target };
    return { qty: null, unit: target, reason: "lådvikt (nominell vikt) saknas på produkten" };
  }
  return { qty: null, unit: target, reason: `okänd enhet "${unit}"` };
}

/**
 * Räknar om ett inkommande pris till pris per produktens lagerenhet, så att
 * kvantitet × pris alltid ger rätt värde.
 */
export function toStockUnitPrice(
  price: number | null | undefined,
  priceUnit: string | null | undefined,
  product?: UnitProduct | null,
): { price: number | null; reason?: string } {
  const value = Number(price ?? 0);
  if (!Number.isFinite(value) || value <= 0) return { price: value > 0 ? value : 0 };
  const target = stockUnitOf(product);
  const unit = norm(priceUnit ?? product?.unit ?? target);
  const perPiece = Number(product?.weight_per_piece ?? 0);
  const perBox = Number(product?.nominal_weight_kg ?? 0);

  if (target === "st") {
    if (isPieceUnit(unit)) return { price: value };
    if (KILO_UNITS.includes(unit)) {
      if (perPiece > 0) return { price: round4(value * perPiece) };
      return { price: null, reason: "styckvikt saknas — kilopris kan inte bli styckpris" };
    }
    if (GRAM_UNITS.includes(unit)) {
      if (perPiece > 0) return { price: round4(value * 1000 * perPiece) };
      return { price: null, reason: "styckvikt saknas — grampris kan inte bli styckpris" };
    }
    if (BOX_UNITS.includes(unit)) {
      if (perBox > 0 && perPiece > 0) return { price: round4(value / (perBox / perPiece)) };
      return { price: null, reason: "antal per låda saknas — lådpris kan inte bli styckpris" };
    }
    return { price: null, reason: `okänd prisenhet "${unit}"` };
  }

  if (KILO_UNITS.includes(unit)) return { price: value };
  if (GRAM_UNITS.includes(unit)) return { price: round4(value * 1000) };
  if (isPieceUnit(unit)) {
    if (perPiece > 0) return { price: round4(value / perPiece) };
    return { price: null, reason: "styckvikt saknas — styckpris kan inte bli kilopris" };
  }
  if (BOX_UNITS.includes(unit)) {
    if (perBox > 0) return { price: round4(value / perBox) };
    return { price: null, reason: "lådvikt saknas — lådpris kan inte bli kilopris" };
  }
  return { price: null, reason: `okänd prisenhet "${unit}"` };
}

/**
 * Vikten i kilo av en lagerkvantitet. Endast för viktrapportering — aldrig
 * för värdering.
 */
export function stockQtyToKg(quantity: number, product?: UnitProduct | null): number | null {
  const qty = Number(quantity) || 0;
  if (stockUnitOf(product) === "kg") return qty;
  const perPiece = Number(product?.weight_per_piece ?? 0);
  return perPiece > 0 ? round3(qty * perPiece) : null;
}

/**
 * Enda tillåtna värderingsformeln: kvantitet i produktens lagerenhet gånger
 * pris per samma enhet.
 */
export function stockValue(quantity: number, unitPrice: number | null | undefined): number {
  const qty = Number(quantity) || 0;
  const price = Number(unitPrice) || 0;
  return round2(qty * price);
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round4 = (n: number) => Math.round(n * 10000) / 10000;
