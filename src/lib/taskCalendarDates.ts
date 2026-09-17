/** Datumhjälp för uppgiftskalendern. Alla datum som ISO (YYYY-MM-DD). */

export function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseIso(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseIso(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}

export function addMonths(s: string, n: number): string {
  const d = parseIso(s);
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  return iso(d);
}

/** Måndag i veckan som datumet ligger i. */
export function startOfWeek(s: string): string {
  const d = parseIso(s);
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return iso(d);
}

/** Sju datum från måndag. */
export function weekDays(s: string): string[] {
  const start = startOfWeek(s);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Hela månaden som veckorader från måndag (6 rader × 7 dagar). */
export function monthGrid(s: string): string[] {
  const d = parseIso(s);
  d.setDate(1);
  const start = startOfWeek(iso(d));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function weekNumber(s: string): number {
  const d = parseIso(s);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86400000));
}

const MONTHS = [
  "januari",
  "februari",
  "mars",
  "april",
  "maj",
  "juni",
  "juli",
  "augusti",
  "september",
  "oktober",
  "november",
  "december",
];

export function monthLabel(s: string): string {
  const d = parseIso(s);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function dayNumber(s: string): number {
  return parseIso(s).getDate();
}

export function sameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}
