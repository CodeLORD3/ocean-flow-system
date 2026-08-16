/**
 * Momssatser per bolag. Varje bolag har en standardsats ("*") och kan ha
 * kategorispecifika undantag. Schweiz (Componia AG) har 2,6 % på livsmedel och
 * 8,1 % på emballage/förbrukning och servering — Sverige 6 / 25 / 12.
 */
export type VatRateRow = {
  legal_entity_id: string | null;
  category: string;
  rate: number | string;
  valid_from?: string | null;
  valid_to?: string | null;
};

const FALLBACK: Record<string, number> = { SEK: 6, CHF: 2.6, EUR: 7 };

/** Slår upp momssats för ett bolag och en produktkategori. */
export function resolveVatRate(
  rows: VatRateRow[],
  legalEntityId: string | null | undefined,
  category: string | null | undefined,
  currency = "SEK",
): number {
  const forEntity = rows.filter(
    (r) => (r.legal_entity_id ?? null) === (legalEntityId ?? null),
  );
  const pool = forEntity.length > 0 ? forEntity : rows.filter((r) => r.legal_entity_id == null);
  const cat = (category ?? "").trim().toLowerCase();
  const exact = pool.find((r) => (r.category ?? "").trim().toLowerCase() === cat && cat !== "");
  const star = pool.find((r) => r.category === "*");
  const hit = exact ?? star;
  if (hit) return Number(hit.rate);
  return FALLBACK[currency.toUpperCase()] ?? 6;
}
