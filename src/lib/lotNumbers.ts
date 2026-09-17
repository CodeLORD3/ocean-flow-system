/**
 * Rensar partinummer från följesedlar och auktionsavräkningar.
 *
 * Auktionsdokument skriver ofta kvalitetsklass och säljarens/båtens kortkod på
 * samma rad ("Kategori A ToCa"). Det är INTE ett partinummer — läggs det in som
 * parti blir spårbarheten fel och alla rader hamnar i samma parti. Ett riktigt
 * partinummer innehåller alltid siffror.
 */
const NOISE = /^(kategori|kvalitet|klass|kat\.?|cat\.?)\b/i;

/** Säljar-/båtkod som står kvar när klassen strippats, t.ex. "ToCa", "JaAn". */
export function sellerCodeFrom(raw: string): string | null {
  const text = String(raw ?? "").trim();
  if (!NOISE.test(text)) return null;
  const rest = text.replace(NOISE, "").replace(/^\s*[A-Za-zÅÄÖåäö]\b/, "").trim();
  return rest || null;
}

/** Behåller bara sådant som rimligen är ett partinummer. */
export function cleanLotNumbers(values: unknown): string[] {
  const list = Array.isArray(values) ? values : [];
  const out: string[] = [];
  for (const v of list) {
    const text = String(v ?? "").trim();
    if (!text) continue;
    if (NOISE.test(text)) continue; // kvalitetsklass + säljarkod, inte parti
    if (!/\d/.test(text)) continue; // partinummer utan siffra finns inte
    if (!out.includes(text)) out.push(text);
  }
  return out;
}
