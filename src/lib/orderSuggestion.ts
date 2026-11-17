/** Förslag i telefonens beställning: det butiken beställde samma veckodag förra veckan. */
export type SuggestionLine = { product_id: string; quantity: number; unit: string | null };
export type WeekdaySuggestion = { date: string; exactLastWeek: boolean; lines: SuggestionLine[] };

const iso = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};
const minusDays = (d: Date, n: number) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - n);
  return x;
};

/**
 * Väljer leveransdagen 7 dagar före vald dag. Finns ingen beställning där används
 * senaste samma veckodag inom 4 veckor. Avbrutna ordrar räknas aldrig; flera ordrar
 * samma leveransdag slås ihop per vara.
 */
export function buildWeekdaySuggestion(orders: any[], deliveryDate: Date | undefined): WeekdaySuggestion | null {
  if (!deliveryDate) return null;
  const candidates = [7, 14, 21, 28].map((n) => iso(minusDays(deliveryDate, n)));
  const usable = (orders ?? []).filter(
    (o) => o?.status !== "Avbruten" && o?.desired_delivery_date && (o.shop_order_lines?.length ?? 0) > 0,
  );
  for (const date of candidates) {
    const sameDay = usable.filter((o) => o.desired_delivery_date === date);
    if (!sameDay.length) continue;
    const sum = new Map<string, SuggestionLine>();
    for (const o of sameDay) {
      for (const l of o.shop_order_lines ?? []) {
        const q = Number(l.quantity_ordered) || 0;
        if (!l.product_id || q <= 0) continue;
        const prev = sum.get(l.product_id);
        sum.set(l.product_id, { product_id: l.product_id, unit: prev?.unit ?? l.unit ?? null, quantity: Math.round(((prev?.quantity ?? 0) + q) * 10) / 10 });
      }
    }
    if (!sum.size) continue;
    return { date, exactLastWeek: date === candidates[0], lines: Array.from(sum.values()) };
  }
  return null;
}
