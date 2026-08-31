export const SWEDISH_TIME_ZONE = "Europe/Stockholm";

const dateFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: SWEDISH_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function svenskDatum(value: string | number | Date = new Date()): string {
  const parts = Object.fromEntries(dateFormatter.formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function laggTillSvenskaDagar(date: string, days: number): string {
  const midday = new Date(`${date}T12:00:00Z`);
  midday.setUTCDate(midday.getUTCDate() + days);
  return svenskDatum(midday);
}

export function svenskTid(value: string | number | Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: SWEDISH_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value)).replace(/\./g, ":");
}

export function svenskTidpunkt(date: string, time: string): Date {
  const wallClock = `${date}T${time.slice(0, 5)}:00Z`;
  const naive = new Date(wallClock);
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: SWEDISH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(naive);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const shown = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour) === 24 ? 0 : Number(values.hour), Number(values.minute), Number(values.second));
  const offset = (shown - naive.getTime()) / 60_000;
  return new Date(naive.getTime() - offset * 60_000);
}

export const svenskTidpunktForPass = svenskTidpunkt;
