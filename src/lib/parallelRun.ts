/**
 * Parallellkörning klocka mot Personalkollen — gemensam bedömning.
 *
 * Tolerans enligt beställningen: grönt ≤ 5 min differens, gult ≤ 15 min,
 * rött däröver. En butik räknas som klar för växling när den har tillräckligt
 * många sammanhängande gröna dagar (målet är två månader).
 */

export const TOLERANCE_GREEN = 5;
export const TOLERANCE_YELLOW = 15;
/** Två månader sammanhängande gröna dagar är målet för växlingsbeslutet. */
export const STREAK_TARGET_DAYS = 60;

export type DayTone = "green" | "yellow" | "red" | "none";

export interface CompareRow {
  day: string;
  employee_id: string;
  diffMinutes: number | null;
}

export interface StoreDay {
  store_id: string;
  day: string;
  compared: number;
  worstDiff: number;
  deviations: number;
  tone: DayTone;
}

export interface StoreStatus {
  store_id: string;
  days: StoreDay[];
  /** Sammanhängande gröna dagar räknat från senaste dagen med data och bakåt. */
  streak: number;
  latest: StoreDay | null;
  greenDays: number;
  yellowDays: number;
  redDays: number;
}

export const toneOf = (worstDiff: number, compared: number): DayTone => {
  if (compared === 0) return "none";
  if (worstDiff <= TOLERANCE_GREEN) return "green";
  if (worstDiff <= TOLERANCE_YELLOW) return "yellow";
  return "red";
};

export const TONE_LABEL: Record<DayTone, string> = {
  green: "Stämmer",
  yellow: "Liten differens",
  red: "Avvikelse",
  none: "Ingen jämförbar tid",
};

/**
 * Aggregerar jämförelserader till en status per butik och dag.
 * Rader utan känd butik eller utan jämförbar tid räknas inte.
 */
export function buildStoreDays(rows: CompareRow[], storeByEmployee: Map<string, string | null>): StoreDay[] {
  const acc = new Map<string, StoreDay>();
  for (const row of rows) {
    if (row.diffMinutes == null) continue;
    const storeId = storeByEmployee.get(row.employee_id) ?? null;
    if (!storeId) continue;
    const key = `${storeId}|${row.day}`;
    const current =
      acc.get(key) ?? { store_id: storeId, day: row.day, compared: 0, worstDiff: 0, deviations: 0, tone: "none" as DayTone };
    const diff = Math.abs(row.diffMinutes);
    current.compared += 1;
    current.worstDiff = Math.max(current.worstDiff, diff);
    if (diff > TOLERANCE_GREEN) current.deviations += 1;
    acc.set(key, current);
  }
  return [...acc.values()].map((d) => ({ ...d, tone: toneOf(d.worstDiff, d.compared) }));
}

/** Samlar dagarna per butik och räknar sammanhängande gröna dagar bakåt. */
export function buildStoreStatus(days: StoreDay[]): StoreStatus[] {
  const byStore = new Map<string, StoreDay[]>();
  for (const day of days) {
    const list = byStore.get(day.store_id) ?? [];
    list.push(day);
    byStore.set(day.store_id, list);
  }

  return [...byStore.entries()].map(([store_id, list]) => {
    const sorted = [...list].sort((a, b) => b.day.localeCompare(a.day));
    let streak = 0;
    for (const day of sorted) {
      if (day.tone === "green") streak += 1;
      else break;
    }
    return {
      store_id,
      days: sorted,
      streak,
      latest: sorted[0] ?? null,
      greenDays: sorted.filter((d) => d.tone === "green").length,
      yellowDays: sorted.filter((d) => d.tone === "yellow").length,
      redDays: sorted.filter((d) => d.tone === "red").length,
    };
  });
}
