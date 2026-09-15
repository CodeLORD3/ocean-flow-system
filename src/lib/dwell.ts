/**
 * Tid mellan händelser i spårbarheten — hur länge ett parti låg orört på
 * samma ställe innan nästa händelse.
 */

/** Datum och klockslag i svensk form, t.ex. 15/09/26 13:04. */
export const stampSv = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString("sv-SE", {
        year: "2-digit",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

/** Enbart klockslag, t.ex. 13:04. */
export const timeSv = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }) : "—";

/** Läsbar varaktighet: 3 d 5 h, 5 h 20 min, 12 min, "under 1 min". */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "under 1 min";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const restMin = min % 60;
  if (h < 24) return restMin ? `${h} h ${restMin} min` : `${h} h`;
  const d = Math.floor(h / 24);
  const restH = h % 24;
  return restH ? `${d} d ${restH} h` : `${d} d`;
}

/** Tiden mellan två tidpunkter, tom sträng om någon saknas. */
export const gapBetween = (fromIso?: string | null, toIso?: string | null) =>
  fromIso && toIso ? formatDuration(new Date(toIso).getTime() - new Date(fromIso).getTime()) : "";

/** Hur länge sedan en händelse inträffade, räknat från nu. */
export const sinceNow = (iso?: string | null) =>
  iso ? formatDuration(Date.now() - new Date(iso).getTime()) : "";
