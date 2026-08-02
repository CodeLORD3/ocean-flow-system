/**
 * Var i bilden som visas när den beskärs.
 * Sparas som text: "top" | "center" | "bottom" (äldre värden) eller "0"–"100"
 * där talet är den vertikala positionen i procent (0 = överkant, 100 = nederkant).
 */
export type FocalPoint = string;

/** Snabbval som visas som knappar. */
export const FOCAL_OPTIONS: { value: string; label: string }[] = [
  { value: "0", label: "Överkant" },
  { value: "50", label: "Mitten" },
  { value: "100", label: "Nederkant" },
];

/** Tolkar sparat värde till vertikal procent (0–100). */
export function focalPercent(focal?: string | null): number {
  if (focal == null || focal === "") return 50;
  if (focal === "top") return 0;
  if (focal === "center") return 50;
  if (focal === "bottom") return 100;
  const n = Number(String(focal).replace("%", ""));
  if (!Number.isFinite(n)) return 50;
  return Math.min(100, Math.max(0, n));
}

/** Inline-style för <img> så bilden kan finjusteras i steg om 1 %. */
export function focalStyle(focal?: string | null): React.CSSProperties {
  return { objectPosition: `50% ${focalPercent(focal)}%` };
}

/** Etikett för aktuell position, t.ex. "Överkant" eller "37 %". */
export function focalLabel(focal?: string | null): string {
  const p = focalPercent(focal);
  const preset = FOCAL_OPTIONS.find((o) => Number(o.value) === p);
  return preset ? preset.label : `${p} %`;
}
