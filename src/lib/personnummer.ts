/**
 * Personnummer för personalmodulen.
 *
 * Personnummer lagras ALDRIG i klartext i Makrilltrade. Vi sparar bara
 * en uppslagsnyckel (SHA-256), en maskerad visningsform och de fyra sista
 * siffrorna. Klockan (etapp 2) identifierar med tio siffror och slår upp
 * personen via samma hash.
 */

/** Tar bort allt utom siffror och kortar tolv siffror till tio. */
export function normalizePnr(input: string): string {
  const digits = (input || "").replace(/\D/g, "");
  if (digits.length === 12) return digits.slice(2);
  return digits;
}

export function isValidPnr(input: string): boolean {
  const d = normalizePnr(input);
  if (d.length !== 10) return false;
  // Luhn (modulo 10)
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let n = Number(d[i]);
    if (i % 2 === 0) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

/** Maskerad visningsform: 8501xx-xx89 */
export function maskPnr(input: string): string {
  const d = normalizePnr(input);
  if (d.length !== 10) return "";
  return `${d.slice(0, 4)}xx-xx${d.slice(8)}`;
}

export function pnrLast4(input: string): string {
  const d = normalizePnr(input);
  return d.length === 10 ? d.slice(6) : "";
}

/** Uppslagsnyckel. Samma indata ger alltid samma hash, klartexten kastas. */
export async function hashPnr(input: string): Promise<string> {
  const d = normalizePnr(input);
  const bytes = new TextEncoder().encode(`SE:${d}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Födelsedatum ur tio siffror, med rimlig sekelgissning. */
export function birthDateFromPnr(input: string): string | null {
  const d = normalizePnr(input);
  if (d.length !== 10) return null;
  const yy = Number(d.slice(0, 2));
  const mm = d.slice(2, 4);
  const dd = d.slice(4, 6);
  const nowYY = new Date().getFullYear() % 100;
  const century = yy <= nowYY ? 2000 : 1900;
  const iso = `${century + yy}-${mm}-${dd}`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}
