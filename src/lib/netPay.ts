/**
 * Ungefärlig nettolön: brutto minus preliminärskatt enligt Skatteverkets
 * månadstabeller 2026 (tabell 29–42, kolumn 1–6). Exakt netto räknas i Fortnox Lön.
 */
import tables from "./taxTables2026.json";

type Row = [number, number, number, number, number, number, number, number, number];
const TABLES = tables as unknown as Record<string, Row[]>;

/** Skattetyp enligt Fortnox Lön. EXT = sidoinkomst (30 % enligt Skatteverket), EJ = ingen skatt. */
export type TaxType = "HUV" | "EXT" | "STU" | "TMP" | "EJ" | string | null | undefined;

/** Preliminärskatt i kr, eller null när tabell/kolumn saknas. */
export function preliminaryTax(gross: number, table: string | number | null | undefined, column: number | null | undefined, taxType?: TaxType): number | null {
  if (taxType === "EXT") return Math.round(Math.max(0, gross) * 0.3);
  if (taxType === "EJ") return 0;
  if (taxType === "STU" || taxType === "TMP") return null; // beror på intyg/belopp – räknas i Fortnox
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
  taxType?: TaxType,
): number | null {
  const tax = preliminaryTax(gross, table, column, taxType);
  if (tax === null) return null;
  return Math.round(gross - Math.max(0, tax - Number(adjustment ?? 0)));
}
