/**
 * Derive display currency code from a company's country.
 * Sweden → SEK, Switzerland → CHF, fallback → SEK
 */
export function getCurrency(country?: string | null): string {
  if (!country) return "SEK";
  const c = country.toLowerCase().trim();
  if (c === "sweden" || c === "se" || c === "sverige") return "SEK";
  if (c === "switzerland" || c === "ch" || c === "schweiz" || c === "suisse") return "CHF";
  if (c === "germany" || c === "de" || c === "france" || c === "fr" || c === "italy" || c === "it" || c === "spain" || c === "es" || c === "netherlands" || c === "nl") return "EUR";
  if (c === "united states" || c === "us" || c === "usa") return "USD";
  return "SEK";
}

/**
 * Derive currency from a store's city/country.
 * Zollikon / Zürich / Switzerland → CHF, otherwise SEK.
 */
export function getStoreCurrency(store?: { city?: string | null; name?: string | null } | null): string {
  if (!store) return "SEK";
  const s = `${store.city || ""} ${store.name || ""}`.toLowerCase();
  if (s.includes("zollikon") || s.includes("zürich") || s.includes("zurich") || s.includes("schweiz") || s.includes("switzerland")) {
    return "CHF";
  }
  return "SEK";
}

/** Format an amount with the currency code, e.g. "66 000 SEK" */
export function fmtCur(amount: number, currency: string, opts?: { maximumFractionDigits?: number }): string {
  return `${amount.toLocaleString(undefined, opts)} ${currency}`;
}
