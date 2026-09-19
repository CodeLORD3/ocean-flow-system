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

/**
 * Mjuk färgton för ett helt dagsband: bakgrund, text och vänsterlist.
 * Idag är grönt, igår blått, äldre dagar växlar färg.
 */
export type DayTone = { band: string; bar: string; chip: string };

const TONES: DayTone[] = [
  { band: "bg-amber-50 text-amber-900 border-amber-200", bar: "bg-amber-400", chip: "bg-amber-500 text-white" },
  { band: "bg-violet-50 text-violet-900 border-violet-200", bar: "bg-violet-400", chip: "bg-violet-600 text-white" },
  { band: "bg-rose-50 text-rose-900 border-rose-200", bar: "bg-rose-400", chip: "bg-rose-500 text-white" },
  { band: "bg-teal-50 text-teal-900 border-teal-200", bar: "bg-teal-400", chip: "bg-teal-600 text-white" },
  { band: "bg-slate-100 text-slate-800 border-slate-200", bar: "bg-slate-400", chip: "bg-slate-600 text-white" },
];

const TODAY: DayTone = {
  band: "bg-emerald-50 text-emerald-900 border-emerald-200",
  bar: "bg-emerald-500",
  chip: "bg-emerald-600 text-white",
};
const YESTERDAY: DayTone = {
  band: "bg-sky-50 text-sky-900 border-sky-200",
  bar: "bg-sky-500",
  chip: "bg-sky-600 text-white",
};

/** Tonen för en datumnyckel (YYYY-MM-DD) eller ISO-tidsstämpel. */
export function dayTone(key: string): DayTone {
  const iso = key.length === 10 ? `${key}T12:00:00` : key;
  const ago = daysAgo(iso);
  if (ago === 0) return TODAY;
  if (ago === 1) return YESTERDAY;
  return TONES[(ago - 2) % TONES.length];
}
