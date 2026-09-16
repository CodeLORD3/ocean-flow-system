/**
 * Färg per dag för bildgrupper och tidsstämplar.
 * Idag är alltid grönt; äldre dagar växlar färg så man ser när dygnet byts
 * när man snabbt bläddrar igenom bilder.
 */
const CYCLE = [
  "bg-sky-600 text-white",
  "bg-amber-500 text-white",
  "bg-violet-600 text-white",
  "bg-rose-500 text-white",
  "bg-teal-600 text-white",
  "bg-slate-600 text-white",
];

/** Antal dygn mellan datumet och idag (0 = idag). */
export function daysAgo(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const now = new Date();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

/** Tailwind-klasser för dagsmarkeringen. */
export function dayBadgeClass(iso: string) {
  const ago = daysAgo(iso);
  if (ago === 0) return "bg-emerald-600 text-white";
  return CYCLE[(ago - 1) % CYCLE.length];
}
