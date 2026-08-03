/**
 * Lätt översättningslager. Nya vyer hämtar sina ledtexter härifrån, befintliga
 * vyer är oförändrade. Språket sparas i webbläsaren.
 */

export type Lang = "sv" | "en" | "ar";

const DICT: Record<string, Record<Lang, string>> = {
  price_list: { sv: "Prislista", en: "Price list", ar: "قائمة الأسعار" },
  price_incl_vat: { sv: "Pris inkl moms", en: "Price incl VAT", ar: "السعر مع الضريبة" },
  price_ex_vat: { sv: "Pris exkl moms", en: "Price excl VAT", ar: "السعر بدون ضريبة" },
  missing_price: { sv: "pris saknas", en: "price missing", ar: "السعر مفقود" },
  margin: { sv: "Marginal", en: "Margin", ar: "الهامش" },
  target: { sv: "Mål", en: "Target", ar: "الهدف" },
  revenue_share: { sv: "Intäktsandel", en: "Revenue share", ar: "حصة الإيرادات" },
  cost_per_kg: { sv: "Kostnad per kg", en: "Cost per kg", ar: "التكلفة لكل كجم" },
  use_suggested: { sv: "Använd föreslaget pris", en: "Use suggested price", ar: "استخدم السعر المقترح" },
  batch_holds: { sv: "Partiet håller", en: "Batch holds", ar: "الدفعة مطابقة" },
  all_details_hold: { sv: "Alla detaljer håller", en: "All cuts hold", ar: "كل القطع مطابقة" },
  below_target: { sv: "Under målet", en: "Below target", ar: "أقل من الهدف" },
  saved: { sv: "Sparat", en: "Saved", ar: "تم الحفظ" },
  lowest_margin: { sv: "Lägst marginal", en: "Lowest margin", ar: "أدنى هامش" },
};

const KEY = "app_lang";

export function getLang(): Lang {
  const v = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
  return v === "en" || v === "ar" ? v : "sv";
}

export function setLang(lang: Lang) {
  localStorage.setItem(KEY, lang);
}

export function t(key: keyof typeof DICT | string, lang: Lang = getLang()): string {
  const row = DICT[key as string];
  return row ? row[lang] : String(key);
}
