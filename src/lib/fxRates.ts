/**
 * Växling till SEK i rapporterna.
 * Schweiz rapporterar i CHF. För att omsättningen ska kunna jämföras och summeras
 * med de svenska butikerna räknas varje dag om med just den dagens kurs
 * (ECB:s dagliga snittkurs). Saknas kursen för dagen används närmast föregående
 * dag med kurs — helger och helgdagar har ingen egen kurs.
 */

export type FxRateMap = Map<string, number>;

/** Nyckel i kurstabellen: valuta + datum. */
export const fxKey = (currency: string, date: string) => `${currency.toUpperCase()}|${date}`;

/**
 * Kursen för en valuta ett visst datum. Faller tillbaka på senaste kända kurs
 * före datumet (helger) och sist på 1 när valutan redan är SEK.
 */
export function rateFor(
  rates: FxRateMap,
  currency: string | null | undefined,
  date: string,
): number | null {
  const cur = (currency || "SEK").toUpperCase();
  if (cur === "SEK") return 1;
  const exact = rates.get(fxKey(cur, date));
  if (exact) return exact;
  // Bakåt max 10 dagar: täcker helg och helgdagar.
  const d = new Date(`${date}T12:00:00`);
  for (let i = 1; i <= 10; i++) {
    d.setDate(d.getDate() - 1);
    const iso = d.toISOString().slice(0, 10);
    const hit = rates.get(fxKey(cur, iso));
    if (hit) return hit;
  }
  return null;
}

/** Belopp omräknat till SEK med dagens kurs. null när kurs saknas. */
export function toSek(
  amount: number | null | undefined,
  currency: string | null | undefined,
  date: string,
  rates: FxRateMap,
): number | null {
  if (amount == null) return null;
  const rate = rateFor(rates, currency, date);
  return rate == null ? null : amount * rate;
}
