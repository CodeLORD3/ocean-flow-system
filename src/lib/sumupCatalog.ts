import * as XLSX from "xlsx";

/**
 * Katalogutbyte mot SumUp. SumUp har inget katalog-API i dag, så Zollikons
 * sortiment exporteras som CSV i SumUps importformat och SumUps egen
 * katalogexport laddas upp tillbaka för avstämning av namn och pris.
 *
 * Matchnyckeln är artikelnamnet — samma regel som kvittoinläsningen använder.
 */

export type CatalogRow = {
  product_id?: string | null;
  name: string;
  sku?: string | null;
  category?: string | null;
  unit?: string | null;
  price: number;
  vat_rate: number;
};

export type PosCatalogRow = {
  name: string;
  sku?: string | null;
  price: number | null;
  vat_rate?: number | null;
};

export type CatalogDiffRow = {
  name: string;
  kind: "ok" | "pris" | "saknas_i_kassan" | "saknas_i_erp";
  erp_price?: number | null;
  pos_price?: number | null;
  diff?: number | null;
  sku?: string | null;
};

export type CatalogDiff = {
  rows: CatalogDiffRow[];
  matched: number;
  priceDiff: number;
  missingInPos: number;
  missingInErp: number;
};

export const nameKey = (v: string) =>
  v
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N} %./-]/gu, "")
    .trim();

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** SumUps importkolumner för artiklar. Pris skrivs med punkt som decimaltecken. */
export const SUMUP_CATALOG_HEADER = [
  "Item name",
  "Description",
  "Category",
  "Variant name",
  "SKU",
  "Price",
  "Currency",
  "Tax rate (%)",
  "On/Off",
  "Track inventory",
];

/** Bygger SumUp-katalogen som CSV-text (kommaseparerad, UTF-8 med BOM). */
export function buildSumupCatalogCsv(rows: CatalogRow[], currency = "CHF"): string {
  const lines = [SUMUP_CATALOG_HEADER.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.name,
        "",
        r.category ?? "",
        r.unit ? `per ${r.unit}` : "",
        r.sku ?? "",
        r.price.toFixed(2),
        currency.toUpperCase(),
        String(r.vat_rate),
        "On",
        "No",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const s = String(v).replace(/[^\d,.-]/g, "").replace(/\s/g, "");
  // Sista skiljetecknet avgör decimaltecken (SumUp exporterar både 12.50 och 12,50).
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  const norm =
    lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
};

const pick = (row: Record<string, unknown>, keys: string[]): unknown => {
  for (const k of Object.keys(row)) {
    const kk = k.toLowerCase().trim();
    if (keys.some((c) => kk === c || kk.includes(c))) return row[k];
  }
  return undefined;
};

/** Läser SumUps katalogexport (CSV eller XLSX) till namn, SKU, pris och moms. */
export async function parseSumupCatalogFile(file: File): Promise<PosCatalogRow[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", raw: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  const out: PosCatalogRow[] = [];
  for (const r of raw) {
    const name = String(pick(r, ["item name", "name", "artikel", "produkt"]) ?? "").trim();
    if (!name) continue;
    out.push({
      name,
      sku: String(pick(r, ["sku", "artikelnummer"]) ?? "").trim() || null,
      price: num(pick(r, ["price", "pris", "preis"])),
      vat_rate: num(pick(r, ["tax rate", "tax", "moms", "mwst"])),
    });
  }
  return out;
}

/** Jämför ERP-sortimentet mot kassans katalog på namn (och pris inom 0,01). */
export function diffCatalog(erp: CatalogRow[], pos: PosCatalogRow[]): CatalogDiff {
  const posByName = new Map<string, PosCatalogRow>();
  for (const p of pos) posByName.set(nameKey(p.name), p);
  const seen = new Set<string>();
  const rows: CatalogDiffRow[] = [];

  for (const e of erp) {
    const key = nameKey(e.name);
    const p = posByName.get(key);
    if (!p) {
      rows.push({ name: e.name, sku: e.sku ?? null, kind: "saknas_i_kassan", erp_price: e.price });
      continue;
    }
    seen.add(key);
    const diff = p.price == null ? null : Number((e.price - p.price).toFixed(2));
    rows.push({
      name: e.name,
      sku: e.sku ?? null,
      kind: diff != null && Math.abs(diff) < 0.005 ? "ok" : "pris",
      erp_price: e.price,
      pos_price: p.price,
      diff,
    });
  }

  for (const p of pos) {
    const key = nameKey(p.name);
    if (seen.has(key)) continue;
    if (erp.some((e) => nameKey(e.name) === key)) continue;
    rows.push({ name: p.name, sku: p.sku ?? null, kind: "saknas_i_erp", pos_price: p.price });
  }

  return {
    rows,
    matched: rows.filter((r) => r.kind === "ok").length,
    priceDiff: rows.filter((r) => r.kind === "pris").length,
    missingInPos: rows.filter((r) => r.kind === "saknas_i_kassan").length,
    missingInErp: rows.filter((r) => r.kind === "saknas_i_erp").length,
  };
}
