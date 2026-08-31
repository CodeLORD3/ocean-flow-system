/** Shared date helpers for clock/payroll edge functions. */
export const SWEDISH_TIME_ZONE = "Europe/Stockholm";

export function svenskDatum(value: string | number | Date = new Date()): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("sv-SE", {
    timeZone: SWEDISH_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function svenskaDagar(start: string, end: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${start}T12:00:00Z`);
  const stop = new Date(`${end}T12:00:00Z`);
  while (cursor <= stop) {
    days.push(svenskDatum(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}
