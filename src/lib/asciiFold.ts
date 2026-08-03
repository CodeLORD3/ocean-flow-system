/**
 * Translitterering av svenska tecken till ASCII.
 * Används för lagringsnycklar (Supabase Storage tillåter bara ASCII i filnamn)
 * och för tolerant jämförelse av SKU:er (RO-013 === RÖ-013).
 */
export const asciiFold = (v: string): string =>
  (v ?? "")
    .normalize("NFC")
    .replace(/[ÅÄ]/g, "A")
    .replace(/Ö/g, "O")
    .replace(/[ØŒ]/g, "O")
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[øœ]/g, "o")
    .replace(/É/g, "E")
    .replace(/é/g, "e")
    .replace(/Ü/g, "U")
    .replace(/ü/g, "u")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** Nyckel för jämförelse av SKU: ASCII + gemener, trimmat. */
export const skuKey = (v: string): string => asciiFold(v).trim().toLowerCase();

/** Aggressiv nyckel för fritextjämförelse: ASCII, gemener, bara a-z0-9. */
export const compareKey = (v: string): string => skuKey(v).replace(/[^a-z0-9]/g, "");

/** Säker lagringsnyckel: translittererad ASCII, otillåtna tecken blir "_". */
export const storageKey = (v: string): string =>
  asciiFold(v).replace(/[^a-zA-Z0-9\-_.]/g, "_");

/**
 * Nyckel för jämförelse av artgrupp (species_group).
 * Gemener, trimmat, å/ä → a, ö/ø → o, é → e. Används överallt där artgrupper
 * jämförs (cut-modeller, utbyten, priser, import) så att "långa" och "langa"
 * betraktas som samma art.
 */
export const speciesKey = (v: unknown): string =>
  asciiFold(String(v ?? "")).trim().toLowerCase();
