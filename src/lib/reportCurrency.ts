/**
 * Valuta och momssats per butik i rapporterna.
 * Schweiz (Zollikon, Morges) rapporterar i CHF med 2,6 % moms på livsmedel,
 * svenska butiker i kronor med 6 % moms.
 */

/** Kort etikett som skrivs efter beloppet: "kr" i Sverige, annars valutakoden. */
export function currencyLabel(currency?: string | null): string {
  const c = (currency || "SEK").toUpperCase();
  return c === "SEK" ? "kr" : c;
}

/** Butikens momssats utifrån valutan. */
export function defaultVatFor(currency?: string | null): number {
  return (currency || "SEK").toUpperCase() === "CHF" ? 2.6 : 6;
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
