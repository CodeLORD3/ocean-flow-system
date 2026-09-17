/**
 * Rensar partinummer från följesedlar och auktionsavräkningar.
 *
 * Auktionsdokument skriver ofta kvalitetsklass och säljarens/båtens kortkod på
 * samma rad ("Kategori A ToCa"). Det är INTE ett partinummer — läggs det in som
 * parti blir spårbarheten fel och alla rader hamnar i samma parti. Ett riktigt
 * partinummer innehåller alltid siffror.
 */
const NOISE = /^(kategori|kvalitet|klass|kat\.?|cat\.?)\b/i;

/**
 * Fiskauktionens spårbarhetsnummer, t.ex. "10012.6194994": auktionens nummer,
 * punkt och radens löpnummer. Det är detta nummer som ska följa varan hela
 * vägen ut till exportfakturan.
 */
export const AUCTION_LOT_PATTERN = /\b(\d{4,6}\.\d{5,10})\b/;

export function isAuctionLotNumber(value: unknown): boolean {
  const text = String(value ?? "").trim();
  return AUCTION_LOT_PATTERN.test(text) && /^\d{4,6}\.\d{5,10}$/.test(text);
}

/** Plockar ut auktionsnumret ur en rad text, t.ex. "Parti 10012.6194994 A". */
export function extractAuctionLotNumber(text: unknown): string | null {
  const match = AUCTION_LOT_PATTERN.exec(String(text ?? ""));
  return match ? match[1] : null;
}

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
    // Auktionsnumret gäller före allt annat, även om det står mitt i en text.
    const auction = extractAuctionLotNumber(text);
    if (auction) {
      if (!out.includes(auction)) out.push(auction);
      continue;
    }
    if (NOISE.test(text)) continue; // kvalitetsklass + säljarkod, inte parti
    if (!/\d/.test(text)) continue; // partinummer utan siffra finns inte
    if (!out.includes(text)) out.push(text);
  }
  return out;
}
