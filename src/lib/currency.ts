/**
 * Derive display currency code from a company's country.
 * Sweden → SEK, Switzerland → CHF, fallback → kr
 */
export function getCurrency(country?: string | null): string {
  if (!country) return "kr";
  const c = country.toLowerCase().trim();
  if (c === "sweden" || c === "se" || c === "sverige") return "SEK";
  if (c === "switzerland" || c === "ch" || c === "schweiz" || c === "suisse") return "CHF";
  return "kr";
}

/** Format an amount with the currency code, e.g. "66 000 SEK" */
export function fmtCur(amount: number, currency: string, opts?: { maximumFractionDigits?: number }): string {
  return `${amount.toLocaleString(undefined, opts)} ${currency}`;
}
