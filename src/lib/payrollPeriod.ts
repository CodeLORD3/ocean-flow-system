/**
 * Löneperiodmodell: 16:e till 15:e.
 *
 * Periodetiketten är YYYY-MM för den månad perioden SLUTAR i, alltså
 * "2026-09" = 2026-08-16 → 2026-09-15. Perioder som slutar 2026-09-15 eller
 * tidigare har Personalkollen som källa och beräknas aldrig av oss.
 */

export type PeriodSource = "makrilltrade" | "personalkollen";

/** Sista perioden med Personalkollen som källa (aug 16 → sep 15 2026). */
export const LAST_PK_PERIOD = "2026-09";
/** Dagen då Makrilltrades klocka är enda stämpelkälla för svenska enheter. */
export const SWITCHOVER_DATE = "2026-09-16";

const pad = (n: number) => String(n).padStart(2, "0");

export function periodEnd(period: string): string {
  return `${period}-15`;
}

export function periodStart(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  return `${prevY}-${pad(prevM)}-16`;
}

export function periodBounds(period: string) {
  return { from: periodStart(period), to: periodEnd(period) };
}

export function periodSource(period: string): PeriodSource {
  return periodEnd(period) <= periodEnd(LAST_PK_PERIOD) ? "personalkollen" : "makrilltrade";
}

export const PERIOD_SOURCE_LABEL: Record<PeriodSource, string> = {
  makrilltrade: "Makrilltrade",
  personalkollen: "Personalkollen",
};

/** Perioden som ett datum (YYYY-MM-DD) tillhör. */
export function periodForDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (d <= 15) return `${y}-${pad(m)}`;
  const nY = m === 12 ? y + 1 : y;
  const nM = m === 12 ? 1 : m + 1;
  return `${nY}-${pad(nM)}`;
}

/** Föregående/nästa periodetikett. */
export function shiftPeriod(period: string, months: number): string {
  const [y, m] = period.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

/** Etikett att visa: "16 aug – 15 sep 2026". */
export function periodLabel(period: string): string {
  const { from, to } = periodBounds(period);
  const månad = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const fromText = `${fd} ${månad[fm - 1]}${fy !== ty ? ` ${fy}` : ""}`;
  return `${fromText} – ${td} ${månad[tm - 1]} ${ty}`;
}

/** Perioder att välja bland: nästa period först, sedan pågående och bakåt. */
export function recentPeriods(count = 12, today = new Date()): string[] {
  const iso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const next = shiftPeriod(periodForDate(iso), 1);
  return Array.from({ length: count }, (_, i) => shiftPeriod(next, -i));
}
