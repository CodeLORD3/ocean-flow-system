// All money internally is integer öre/cent (1 SEK = 100 öre, 1 CHF = 100 Rappen)
export const SEK_TO_ORE = 100;

export function oreToSek(ore: number): number {
  return ore / SEK_TO_ORE;
}

export function sekToOre(sek: number): number {
  return Math.round(sek * SEK_TO_ORE);
}

export function formatSek(ore: number, opts: { withCurrency?: boolean } = {}): string {
  const sek = ore / SEK_TO_ORE;
  const formatted = sek.toLocaleString("sv-SE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return opts.withCurrency === false ? formatted : `${formatted} kr`;
}

/**
 * Currency-aware formatter. Use this for any amount displayed alongside
 * a store/legal entity to ensure correct locale + currency symbol.
 *
 * Examples:
 *   formatMoney(12450, { currency: "SEK" })  -> "124,50 kr"
 *   formatMoney(1245,  { currency: "CHF" })  -> "12.45 CHF"
 */
export function formatMoney(
  ore: number,
  opts: { currency?: string; locale?: string; withCurrency?: boolean } = {},
): string {
  const currency = (opts.currency ?? "SEK").toUpperCase();
  const locale =
    opts.locale ??
    (currency === "CHF" ? "de-CH" : currency === "EUR" ? "de-DE" : "sv-SE");
  const value = ore / 100;
  const formatted = value.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (opts.withCurrency === false) return formatted;
  // Schweizisk konvention: belopp + " CHF". Svensk: belopp + " kr".
  const suffix = currency === "SEK" ? "kr" : currency;
  return `${formatted} ${suffix}`;
}
