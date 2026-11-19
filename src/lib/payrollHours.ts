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

/**
 * Bruttolön för timmarna i underlaget, före skatt och utan arbetsgivaravgift/semesteravsättning.
 * ARB = timmar × timlön. OB och mertid = bara tilläggsdelen (procent i radens notering).
 * TID (månadslön) och frånvaro ger inga kronor här — månadslönen läggs till separat.
 * Undantag: obetald frånvaro (TJL med negativt timbelopp) dras av.
 */
/**
 * Avdrag för obetald frånvaro på månadslönen: TJL-rader med timmar och negativt
 * timbelopp (unit_amount). Fortnox Lön räknar det slutliga avdraget.
 */
export function unpaidAbsenceDeduction(
  lines: { line_type: string; quantity: number | null; unit_amount?: number | null }[],
): number {
  let sum = 0;
  for (const l of lines) {
    const unit = Number(l.unit_amount ?? 0);
    if (l.line_type === "TJL" && unit < 0) sum += Number(l.quantity ?? 0) * unit;
  }
  return Math.round(sum * 100) / 100;
}

export function grossPay(
  lines: { line_type: string; quantity: number | null; note?: string | null; line_date?: string; unit_amount?: number | null }[],
  hourlyBase: number | ((date: string) => number),
): number {
  const baseOf = (l: { line_date?: string }) =>
    typeof hourlyBase === "function" ? hourlyBase(l.line_date ?? "") : hourlyBase;
  let sum = 0;
  for (const l of lines) {
    const qty = Number(l.quantity ?? 0);
    if (l.line_type === "ARB") sum += qty * baseOf(l);
    else if (isObCode(l.line_type) || l.line_type === "MER") {
      const pct = Number(l.note?.match(/(\d+) %/)?.[1] ?? 0);
      sum += qty * baseOf(l) * (pct / 100);
    }
  }
  return Math.round(sum + unpaidAbsenceDeduction(lines));
}
