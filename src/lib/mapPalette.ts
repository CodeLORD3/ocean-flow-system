/**
 * Zonens färg är dess identitet, inte dess status. Paletten är dämpad och
 * professionell — samma ton känns igen dag efter dag oavsett hur uppgifterna
 * ligger. Status visas separat som prick, kantfärg och bricka.
 */
export const ZONE_PALETTE = [
  { key: "isbla", name: "Isblå", color: "#8ec5e8" },
  { key: "marin", name: "Marin", color: "#7fa6c4" },
  { key: "turkos", name: "Turkos", color: "#7fd0c8" },
  { key: "mint", name: "Mint", color: "#a8d8b9" },
  { key: "sand", name: "Sand", color: "#e3cfa4" },
  { key: "persika", name: "Persika", color: "#f2b995" },
  { key: "lavender", name: "Lavender", color: "#bdb4e0" },
  { key: "rosa", name: "Rosa", color: "#efa8c2" },
] as const;

export const DEFAULT_ZONE_COLOR = ZONE_PALETTE[0].color;

/** Nästa färg i paletten, så nya zoner får olika toner automatiskt. */
export function nextZoneColor(used: (string | null)[]): string {
  const taken = new Set(used.filter(Boolean).map((c) => (c as string).toLowerCase()));
  const free = ZONE_PALETTE.find((p) => !taken.has(p.color.toLowerCase()));
  return (free ?? ZONE_PALETTE[used.length % ZONE_PALETTE.length]).color;
}
