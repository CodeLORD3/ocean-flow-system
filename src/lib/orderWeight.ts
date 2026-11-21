/** Totalvikt för en beställning medan den byggs: kg-rader som de är, styckrader via vikt per styck. */
export type WeightLine = { product_id: string; product_name: string; unit: string; quantity: string | number };
export type WeightProduct = { id: string; weight_per_piece?: number | string | null; nominal_weight_kg?: number | string | null };

export type OrderWeight = {
  /** Total vikt i kg (kg-rader + styckrader med känd styckvikt). */
  totalKg: number;
  /** Del av totalen som kommer från styckrader. */
  pieceKg: number;
  /** Styckrader utan känd vikt – räknas inte in. */
  missing: { product_id: string; product_name: string; quantity: number }[];
};

const num = (v: unknown) => Number(String(v ?? "").replace(",", ".")) || 0;
const isKg = (unit: string | null | undefined) => (unit || "").trim().toLowerCase() === "kg";

export function pieceWeightKg(p: WeightProduct | undefined): number {
  if (!p) return 0;
  const w = num(p.weight_per_piece);
  if (w > 0) return w;
  const n = num(p.nominal_weight_kg);
  return n > 0 ? n : 0;
}

export function orderWeight(lines: WeightLine[], productsById: Map<string, WeightProduct>): OrderWeight {
  let totalKg = 0;
  let pieceKg = 0;
  const missing: OrderWeight["missing"] = [];
  for (const l of lines) {
    const q = num(l.quantity);
    if (q <= 0) continue;
    if (isKg(l.unit)) {
      totalKg += q;
      continue;
    }
    const w = pieceWeightKg(productsById.get(l.product_id));
    if (w > 0) {
      totalKg += q * w;
      pieceKg += q * w;
    } else {
      missing.push({ product_id: l.product_id, product_name: l.product_name, quantity: q });
    }
  }
  return { totalKg, pieceKg, missing };
}

/** Högst en decimal, svensk decimalkomma och mellanslag som tusentalsavgränsare. */
export function formatKg(kg: number): string {
  const r = Math.round(kg * 10) / 10;
  const [i, d] = r.toFixed(1).split(".");
  const int = i.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return d === "0" ? `${int} kg` : `${int},${d} kg`;
}
