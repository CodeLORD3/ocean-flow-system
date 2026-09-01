/**
 * Talformat för schemavyerna enligt designkoden.
 *
 * Regel 8: alla tal i mono, tabulära och högerställda (klassen `ind-mono`).
 * Regel 9: tid som `8 h 11 min`, aldrig `8,11`. Decimaltimmar bara där talet
 * verkligen är ett decimaltal, och då med enhet.
 * Regel 13: alla belopp märks preliminära, och märkningen sitter på talet.
 * Regel 6: färg kodar status, aldrig enhet — enheter får monokoder.
 */

/** `8 h 11 min` — aldrig decimalform. */
export function formatHm(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

/** Signerad differens i samma format: `+12 min`, `−1 h 5 min`. */
export function formatHmSigned(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded === 0) return "0 min";
  return `${rounded > 0 ? "+" : "−"}${formatHm(Math.abs(rounded))}`;
}

/** Decimaltimmar med enhet — används bara i summor, t.ex. `318,5 h`. */
export function formatDecimalHours(minutes: number): string {
  return `${(Math.max(0, minutes) / 60).toLocaleString("sv-SE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} h`;
}

/** Belopp med mellanslag som tusentalsavgränsare. */
export function formatKr(value: number): string {
  return `${Math.round(value).toLocaleString("sv-SE")} kr`;
}

/** Belopp med den preliminära märkningen på talet (regel 13). */
export function formatKrPrel(value: number): string {
  return `${formatKr(value)} prel.`;
}

const MONOCODES: { match: RegExp; code: string }[] = [
  { match: /ålsten|alsten/i, code: "B01" },
  { match: /kungsholmen/i, code: "B02" },
  { match: /torslanda/i, code: "B03" },
  { match: /amhult/i, code: "B04" },
  { match: /särö|saro/i, code: "B05" },
  { match: /eriksberg/i, code: "B06" },
  { match: /marstrand/i, code: "B07" },
  { match: /grossist|wholesale/i, code: "GRO" },
  { match: /administration|admin|kontor/i, code: "ADM" },
];

/**
 * Monokod för en enhet. Namnet är primärt i gränssnittet, koden sekundär —
 * personalen läser "Ålstens Fisk", inte "B01".
 */
export function storeMonocode(name: string | null | undefined): string {
  if (!name) return "—";
  const hit = MONOCODES.find((entry) => entry.match.test(name));
  if (hit) return hit.code;
  // Okända enheter får en läsbar reservkod ur namnet istället för en färg.
  return name
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .split(/\s+/)
    .map((word) => word[0] ?? "")
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

/** Minuter från `HH:MM`. */
export function minutesOfTime(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/** `HH:MM` från minuter sedan midnatt. */
export function timeOfMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
