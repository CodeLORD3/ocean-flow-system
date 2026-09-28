/**
 * Maskinläsbart block i ai_utkast (typ pris): en markdowntabell med kolumnerna
 * SKU | nytt pris (kr inkl. moms) | giltigt från (ÅÅÅÅ-MM-DD).
 * Kopia av src/lib/priceDraft.ts — håll dem lika.
 */
export interface PriceDraftRow {
  line: number;
  raw: string;
  sku: string | null;
  price: number | null;
  validFrom: string | null;
  error: string | null;
}

const cells = (l: string) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

export function parsePriceDraft(content: string): { rows: PriceDraftRow[]; tableFound: boolean } {
  const lines = (content ?? "").split(/\r?\n/);
  const start = lines.findIndex((l) => l.includes("|") && /sku/i.test(l) && /pris/i.test(l));
  if (start < 0) return { rows: [], tableFound: false };
  const head = cells(lines[start]).map((c) => c.toLowerCase());
  const iSku = head.findIndex((c) => c.includes("sku"));
  const iPrice = head.findIndex((c) => c.includes("pris"));
  const iDate = head.findIndex((c) => c.includes("giltig"));
  const rows: PriceDraftRow[] = [];
  for (let n = start + 1; n < lines.length; n++) {
    const l = lines[n];
    if (!l.includes("|")) break;
    if (/^\s*\|?\s*:?-{2,}/.test(l)) continue;
    const c = cells(l);
    const sku = (c[iSku] ?? "").replace(/`/g, "").trim() || null;
    const priceText = (c[iPrice] ?? "").replace(/kr|sek/gi, "").replace(/\s|\u00a0/g, "").replace(",", ".");
    const price = /^\d+(\.\d{1,2})?$/.test(priceText) ? Number(priceText) : null;
    const dateText = iDate >= 0 ? (c[iDate] ?? "").trim() : "";
    const validFrom = /^\d{4}-\d{2}-\d{2}$/.test(dateText) && !Number.isNaN(Date.parse(dateText)) ? dateText : null;
    const error = !sku ? "SKU saknas" : price == null || price <= 0 ? "Pris kan inte tolkas" : !validFrom ? "Datum kan inte tolkas (ÅÅÅÅ-MM-DD)" : null;
    rows.push({ line: n + 1, raw: l, sku, price, validFrom, error });
  }
  return { rows, tableFound: true };
}

/** Avrundar till närmaste 0,50. */
export const roundHalf = (v: number) => Math.round(v * 2) / 2;

export function stopReason(oldPrice: number | null, newPrice: number, costPrice: number | null): string | null {
  const reasons: string[] = [];
  if (oldPrice && oldPrice > 0 && Math.abs(newPrice - oldPrice) / oldPrice > 0.25) reasons.push("förändring över 25 %");
  if (costPrice && costPrice > 0 && newPrice < costPrice * 1.06) reasons.push("under inköpspris × 1,06");
  return reasons.length ? reasons.join(", ") : null;
}
