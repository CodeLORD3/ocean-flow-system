/**
 * Svenska relativa tidsetiketter för senaste lageraktivitet.
 * Grön = något har hänt inom 24 timmar, röd = äldre eller aldrig.
 */

const WEEKDAYS = ["söndag", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag"];

const timePart = (d: Date) =>
  d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });

const datePart = (d: Date) =>
  d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** "Idag 14:22", "Igår 09:10", "tisdag 12 sep 08:00". */
export function activityLabel(iso: string | null | undefined): string {
  if (!iso) return "Aldrig";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Aldrig";
  const days = Math.round(
    (startOfDay(new Date()).getTime() - startOfDay(d).getTime()) / 86_400_000,
  );
  if (days === 0) return `Idag ${timePart(d)}`;
  if (days === 1) return `Igår ${timePart(d)}`;
  if (days < 7) return `${WEEKDAYS[d.getDay()]} ${datePart(d)} ${timePart(d)}`;
  return `${datePart(d)} ${timePart(d)}`;
}

/** Har det hänt något inom 24 timmar? */
export function isFresh(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < 24 * 60 * 60 * 1000;
}

/** Hur länge sedan, i klartext: "3 timmar", "2 dagar". */
export function sinceLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const min = Math.max(0, Math.floor((Date.now() - t) / 60_000));
  if (min < 60) return `${min} min sedan`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} ${h === 1 ? "timme" : "timmar"} sedan`;
  return `${Math.floor(h / 24)} dagar sedan`;
}

/** Tailwind-klasser för färgmarkering: grönt inom 24 h, annars rött. */
export function activityTone(iso: string | null | undefined) {
  return isFresh(iso)
    ? "border-emerald-600/40 bg-emerald-600/10 text-emerald-700"
    : "border-destructive/40 bg-destructive/10 text-destructive";
}

export function activityDotColor(iso: string | null | undefined) {
  return isFresh(iso) ? "#2f7d54" : "#c1502e";
}
