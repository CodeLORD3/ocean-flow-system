/**
 * Arbetad tid i löneunderlaget är bara ARB (timlön) och TID (månadslön).
 * OB och mertid är tillägg på samma timmar och får aldrig läggas ovanpå.
 */
export const isWorkLine = (type: string) => type === "ARB" || type === "TID";
export const isObCode = (type: string) => /^OB\d+$/.test(type);

export function workedHours(lines: { line_type: string; quantity: number | null }[]): number {
  return lines.filter((l) => isWorkLine(l.line_type)).reduce((sum, l) => sum + Number(l.quantity ?? 0), 0);
}

export function obHours(lines: { line_type: string; quantity: number | null }[]): number {
  return lines.filter((l) => isObCode(l.line_type)).reduce((sum, l) => sum + Number(l.quantity ?? 0), 0);
}

/**
 * Stämplad tid för månadsavlönade. Samma stämpling kan ligga på två enheter samma dag
 * (dubbel attestrad) — den räknas bara en gång.
 */
export function clockedHours(days: { date: string; minutes: number; first_in?: string | null; last_out?: string | null }[]): number {
  const seen = new Set<string>();
  let minutes = 0;
  days.forEach((d, index) => {
    const key = d.first_in ? `${d.first_in}|${d.last_out ?? ""}` : `utan-stampling-${index}`;
    if (seen.has(key)) return;
    seen.add(key);
    minutes += d.minutes;
  });
  return minutes / 60;
}
