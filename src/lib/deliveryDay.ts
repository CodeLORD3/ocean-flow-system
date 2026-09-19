/**
 * Nästa leveransdag för en butiks beställning till grossisten.
 *
 * Butikerna har olika öppetdagar och olika framförhållning:
 *  - Stockholmsbutikerna (Ålsten, Kungsholmen) behöver minst två dagar.
 *  - Zollikon och Morges behöver minst två dagar, vilket gör att helgens
 *    beställning landar på butikens första öppetdag i nästa vecka.
 *  - Göteborgsbutikerna beställer dagen före, så lördagens beställning går
 *    till tisdag/onsdag beroende på när butiken öppnar igen.
 *
 * Dagen räknas alltid fram ur butikens öppettider — ingen fast "imorgon".
 */

export const WEEKDAY_LONG = [
  "söndag",
  "måndag",
  "tisdag",
  "onsdag",
  "torsdag",
  "fredag",
  "lördag",
];

/** Dagens datum i svensk tid, som ren dag utan tid. */
export function todaySe(now: Date = new Date()): Date {
  const local = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Stockholm" }));
  local.setHours(12, 0, 0, 0);
  return local;
}

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Minsta framförhållning i dagar för butiken. */
export function leadDaysForRegion(region?: string | null): number {
  const r = (region || "").toLowerCase();
  if (r === "stockholm") return 2;
  if (r === "schweiz") return 2;
  return 1;
}

export interface DeliveryDayInput {
  /** Veckodagar butiken har öppet, 0 = söndag. Tom lista = okänt. */
  openWeekdays: number[];
  leadDays: number;
  /** Datum butiken har stängt trots att veckodagen är en öppetdag. */
  closedDates?: string[];
  today?: Date;
}

export interface DeliveryDay {
  /** Leveransdagen, ISO-datum. */
  date: string;
  /** "torsdag 25/9" */
  label: string;
  /** Hur många dagar bort dagen ligger. */
  inDays: number;
  leadDays: number;
  /** Sant när butiken stänger för veckan och nästa leverans är efter helgen. */
  lastChanceThisWeek: boolean;
}

/**
 * Första öppetdagen som ligger minst `leadDays` framåt.
 * Saknas öppettider används dagen efter framförhållningen.
 */
export function nextDeliveryDay(input: DeliveryDayInput): DeliveryDay {
  const open = [...new Set(input.openWeekdays)];
  const closed = new Set(input.closedDates ?? []);
  const base = input.today ?? todaySe();
  const lead = Math.max(1, input.leadDays);

  let chosen: Date | null = null;
  for (let step = lead; step <= lead + 20; step += 1) {
    const d = new Date(base);
    d.setDate(d.getDate() + step);
    if (closed.has(isoDate(d))) continue;
    if (open.length && !open.includes(d.getDay())) continue;
    chosen = d;
    break;
  }
  if (!chosen) {
    chosen = new Date(base);
    chosen.setDate(chosen.getDate() + lead);
  }

  const inDays = Math.round((chosen.getTime() - base.getTime()) / 86400000);

  // Ligger nästa leverans i en annan vecka räknat från måndag?
  const weekIndex = (d: Date) => {
    const monday = new Date(d);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return isoDate(monday);
  };

  return {
    date: isoDate(chosen),
    label: `${WEEKDAY_LONG[chosen.getDay()]} ${chosen.getDate()}/${chosen.getMonth() + 1}`,
    inDays,
    leadDays: lead,
    lastChanceThisWeek: weekIndex(chosen) !== weekIndex(base),
  };
}
