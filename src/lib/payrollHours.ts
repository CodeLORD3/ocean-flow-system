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
