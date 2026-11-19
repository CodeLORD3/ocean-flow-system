/**
 * Ungefärlig nettolön: brutto minus preliminärskatt enligt Skatteverkets
 * månadstabeller 2026 (tabell 29–42, kolumn 1–6). Exakt netto räknas i Fortnox Lön.
 */
import tables from "./taxTables2026.json";

type Row = [number, number, number, number, number, number, number, number, number];
const TABLES = tables as unknown as Record<string, Row[]>;

/** Preliminärskatt i kr, eller null när tabell/kolumn saknas. */
export function preliminaryTax(gross: number, table: string | number | null | undefined, column: number | null | undefined): number | null {
  const rows = TABLES[String(table ?? "")];
  const col = Number(column ?? 1);
  if (!rows || col < 1 || col > 6) return null;
  const g = Math.round(gross);
  if (g <= 0) return 0;
  const row = rows.find((r) => g >= r[0] && (r[1] === 0 || g <= r[1])) ?? rows[rows.length - 1];
  const v = row[2 + col];
  return row[2] === 1 ? Math.round((g * v) / 100) : v;
}

/** Utbetalas till kontot. Jämkning (tax_adjustment, kr per månad) minskar skatten. */
export function netPay(
  gross: number,
  table: string | number | null | undefined,
  column: number | null | undefined,
  adjustment?: number | null,
): number | null {
  const tax = preliminaryTax(gross, table, column);
  if (tax === null) return null;
  return Math.round(gross - Math.max(0, tax - Number(adjustment ?? 0)));
}
