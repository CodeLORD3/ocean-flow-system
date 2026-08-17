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
 * Valutan för en butik. Butiksraden bär bolagets valuta (Componia AG = CHF för
 * både Zollikon och Morges) — den är sanningen. Stad/land används bara som
 * reserv när valutafältet saknas på raden.
 */
export function getStoreCurrency(
  store?: { city?: string | null; name?: string | null; country?: string | null; currency?: string | null } | null,
): string {
  if (!store) return "SEK";
  const explicit = (store.currency || "").trim().toUpperCase();
  if (explicit) return explicit;
  if (store.country) {
    const derived = getCurrency(store.country);
    if (derived) return derived;
  }
  const s = `${store.city || ""} ${store.name || ""}`.toLowerCase();
  if (
    s.includes("zollikon") ||
    s.includes("zürich") ||
    s.includes("zurich") ||
    s.includes("morges") ||
    s.includes("schweiz") ||
    s.includes("switzerland")
  ) {
    return "CHF";
  }
  return "SEK";
}

/** Valutor som kan väljas på en leverantör. */
export const CURRENCY_OPTIONS = ["SEK", "CHF", "EUR", "NOK", "DKK", "USD", "GBP"] as const;

/** Format an amount with the currency code, e.g. "66 000 SEK" */
export function fmtCur(amount: number, currency: string, opts?: { maximumFractionDigits?: number }): string {
  return `${amount.toLocaleString(undefined, opts)} ${currency}`;
}

/**
 * Visar ett belopp i sin ursprungsvaluta med motvärdet som referens, t.ex.
 * "1 234,00 SEK ≈ 118,50 CHF". Används i inköpsvyer för SEK-leverantörer där
 * SEK är primärvaluta och bolagsvalutan bara är referens.
 */
export function fmtDual(
  amountSource: number,
  currencySource: string,
  fxRate: number | null | undefined,
  currencyTarget: string,
): string {
  const primary = fmtCur(amountSource, currencySource, { maximumFractionDigits: 2 });
  if (
    !fxRate ||
    !Number.isFinite(fxRate) ||
    currencySource.toUpperCase() === currencyTarget.toUpperCase()
  ) {
    return primary;
  }
  return `${primary} ≈ ${fmtCur(amountSource * fxRate, currencyTarget, { maximumFractionDigits: 2 })}`;
}

/** Konverterar ett belopp med en sparad kurs och avrundar till två decimaler. */
export function convertWithRate(amount: number, fxRate: number | null | undefined): number {
  if (!fxRate || !Number.isFinite(fxRate)) return Number(amount.toFixed(2));
  return Number((amount * fxRate).toFixed(2));
}
