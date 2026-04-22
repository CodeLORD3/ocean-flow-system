// All money internally is integer öre (1 SEK = 100 öre)
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
