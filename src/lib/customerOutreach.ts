export const SEGMENTS = ["Stamkund", "Återkommande", "Ny", "Vilande"] as const;
export type Segment = (typeof SEGMENTS)[number];

/** Telefon till E.164. Svenska nummer (07…) → +46, schweiziska (07… med CH) → +41. */
export function toE164(raw: string | null | undefined, country: "SE" | "CH" = "SE"): string | null {
  if (!raw) return null;
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (d.startsWith("+")) return /^\+\d{8,15}$/.test(d) ? d : null;
  if (d.startsWith("0")) d = (country === "CH" ? "41" : "46") + d.slice(1);
  else if (!/^(46|41)/.test(d)) return null;
  return /^\d{8,15}$/.test(d) ? "+" + d : null;
}

const esc = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (header: string[], rows: unknown[][]) =>
  "\uFEFF" + [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");

export function downloadCsv(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
