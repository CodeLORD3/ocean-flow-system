/**
 * Datum som tolkas ur PDF:er kan bli felaktiga (t.ex. "2009-14" eller "14/09").
 * Postgres avvisar då hela raden. safeDate släpper bara igenom giltiga datum
 * och normaliserar de vanligaste svenska skrivsätten.
 */
export function safeDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const isoLike = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  const svLike = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})$/);

  let y: number, m: number, d: number;
  if (isoLike) {
    [y, m, d] = [Number(isoLike[1]), Number(isoLike[2]), Number(isoLike[3])];
  } else if (svLike) {
    [y, m, d] = [Number(svLike[3]), Number(svLike[2]), Number(svLike[1])];
  } else if (compact) {
    [y, m, d] = [Number(compact[1]), Number(compact[2]), Number(compact[3])];
  } else {
    return null;
  }

  if (y < 1900 || y > 2200) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;

  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${y}-${pad(m)}-${pad(d)}`;
}
