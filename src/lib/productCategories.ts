/**
 * Kanoniska produktkategorier, SKU-prefix och etiketthjälpare.
 * sku är alltid nyckeln och ändras aldrig — prefixen används bara vid autogenerering.
 */

export const PRODUCT_CATEGORIES = [
  "Färsk Fisk",
  "Skaldjur",
  "Sillar",
  "Rökta Produkter",
  "Konserver & Torkat",
  "Såser & Röror",
  "Löjrom & Kaviar",
  "Delikatesser",
  "Varmkök",
  "Frukt & Grönt",
  "Frys",
  "Emballage & Förbrukning",
  "Råvaror & Storhushåll",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

/** Gamla kategorier: får finnas kvar på befintliga rader men kan inte väljas för nya produkter. */
export const DEPRECATED_CATEGORIES = ["Fisk", "Is", "kolonial", "Emballage", "Svenska Produkter"];

/**
 * Normaliserar kategorinamn för jämförelse: unicode-normalisering (NFC) så att
 * Å/Ä/Ö matchar oavsett om filen är skapad på macOS (NFD) eller Windows,
 * plus trim, gemener och kollaps av blanksteg.
 */
export function normalizeCategoryKey(name: string | null | undefined): string {
  return String(name ?? "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** SKU-prefix för autogenererade artikelnummer. */
export const CATEGORY_SKU_PREFIX: Record<string, string> = {
  "Färsk Fisk": "FS",
  Skaldjur: "SK",
  Sillar: "SI",
  "Rökta Produkter": "RÖ",
  "Konserver & Torkat": "KT",
  "Såser & Röror": "KK",
  "Löjrom & Kaviar": "LK",
  Delikatesser: "DE",
  Varmkök: "VK",
  "Frukt & Grönt": "FG",
  Frys: "FR",
  "Emballage & Förbrukning": "EM",
  "Råvaror & Storhushåll": "RÅ",
};

export function isDeprecatedCategory(name: string | null | undefined): boolean {
  if (!name) return false;
  return DEPRECATED_CATEGORIES.some((c) => normalizeCategoryKey(c) === normalizeCategoryKey(name));
}

export function isCanonicalCategory(name: string | null | undefined): boolean {
  if (!name) return false;
  return (PRODUCT_CATEGORIES as readonly string[]).some((c) => normalizeCategoryKey(c) === normalizeCategoryKey(name));
}

/** Prefix för autogenerering — faller tillbaka på två första bokstäverna om kategorin är okänd. */
export function skuPrefixForCategory(category: string): string {
  const match = Object.keys(CATEGORY_SKU_PREFIX).find((c) => normalizeCategoryKey(c) === normalizeCategoryKey(category));
  if (match) return CATEGORY_SKU_PREFIX[match];
  return category.trim().slice(0, 2).toUpperCase() || "XX";
}

/** Genererar ett nytt SKU: <PREFIX>-<base36 tidsstämpel>. */
export function generateSku(category: string): string {
  return `${skuPrefixForCategory(category)}-${Date.now().toString(36)}`;
}

/**
 * Kategorier som kan väljas i formulär: de 12 kanoniska, plus produktens
 * nuvarande (eventuellt utgångna) kategori så att befintliga rader kan sparas.
 */
export function selectableCategories(currentCategory?: string | null, extra: string[] = []): string[] {
  const out = [...PRODUCT_CATEGORIES] as string[];
  for (const name of [...extra, currentCategory ?? ""]) {
    const n = (name ?? "").trim();
    if (n && !out.some((c) => c.toLowerCase() === n.toLowerCase())) out.push(n);
  }
  return out;
}

/** Namn på skyltunderlag/etikett: "Torsk (Gadus morhua)". */
export function productDisplayName(name: string, latinName?: string | null): string {
  const latin = (latinName ?? "").trim();
  return latin ? `${name} (${latin})` : name;
}

/** Redskapskategorier enligt EU 1379/2013. */
export const GEAR_CATEGORIES = [
  "Not/vad",
  "Trål",
  "Garn",
  "Ringnot",
  "Krok och lina",
  "Skrapredskap",
  "Bur och fälla",
] as const;

export type GearCategory = (typeof GEAR_CATEGORIES)[number];

/** Grov heuristik: vildfångat om ursprunget inte anger odling. */
export function isWildCaught(origin?: string | null): boolean {
  const o = (origin ?? "").toLowerCase();
  if (!o) return true;
  return !/odlad|odling|vattenbruk|farmed|aquacult/.test(o);
}
