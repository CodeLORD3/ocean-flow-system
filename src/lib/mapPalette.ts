/**
 * Zonens färg är dess identitet, inte dess status. Paletten är dämpad och
 * professionell — samma ton känns igen dag efter dag oavsett hur uppgifterna
 * ligger. Status visas separat som prick, kantfärg och bricka.
 */
export const ZONE_PALETTE = [
  { key: "rosa", name: "Rosa", color: "#ec4899" },
  { key: "turkos", name: "Turkos", color: "#14b8a6" },
  { key: "lila", name: "Lila", color: "#a855f7" },
  { key: "orange", name: "Orange", color: "#f97316" },
  { key: "isbla", name: "Isblå", color: "#3b82f6" },
  { key: "mint", name: "Mint", color: "#22c55e" },
  { key: "sand", name: "Sand", color: "#eab308" },
  { key: "korall", name: "Korall", color: "#ef4444" },
] as const;

export const DEFAULT_ZONE_COLOR = ZONE_PALETTE[0].color;

/** Nästa färg i paletten, så nya zoner får olika toner automatiskt. */
export function nextZoneColor(used: (string | null)[]): string {
  const taken = new Set(used.filter(Boolean).map((c) => (c as string).toLowerCase()));
  const free = ZONE_PALETTE.find((p) => !taken.has(p.color.toLowerCase()));
  return (free ?? ZONE_PALETTE[used.length % ZONE_PALETTE.length]).color;
}
