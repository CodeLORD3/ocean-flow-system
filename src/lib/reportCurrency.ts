/**
 * Valuta och momssats per butik i rapporterna.
 * Butiksraden bär valutan (SEK, CHF, DKK, NOK, EUR ...). Momssatsen nedan är
 * standardsatsen på livsmedel i respektive land och kan alltid ändras i
 * rapporten.
 */

/** Standardmoms på livsmedel per valuta. */
const FOOD_VAT: Record<string, number> = {
  SEK: 6,
  CHF: 2.6,
  DKK: 25,
  NOK: 15,
  EUR: 7,
  GBP: 0,
  USD: 0,
};

/** Kort etikett som skrivs efter beloppet: "kr" i Sverige, annars valutakoden. */
export function currencyLabel(currency?: string | null): string {
  const c = (currency || "SEK").toUpperCase();
  return c === "SEK" ? "kr" : c;
}

/** Butikens momssats utifrån valutan. */
export function defaultVatFor(currency?: string | null): number {
  const c = (currency || "SEK").toUpperCase();
  return FOOD_VAT[c] ?? 6;
}

/** Belopp med butikens valuta, t.ex. "12 500 CHF". */
export function formatReportMoney(
  value: number | null | undefined,
  currency?: string | null,
  decimals = 0,
): string {
  if (value == null) return "—";
  return `${value.toLocaleString("sv-SE", { maximumFractionDigits: decimals })} ${currencyLabel(currency)}`;
}
