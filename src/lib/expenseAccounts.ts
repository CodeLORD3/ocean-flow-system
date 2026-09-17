/**
 * Bokföringskonton för Viktiga papper.
 * Svenska konton följer BAS-kontoplanen, schweiziska följer KMU-kontoramen.
 * Land väljs på valutan: SEK -> svenskt, CHF/EUR -> schweiziskt.
 */
export type AccountCountry = "se" | "ch";

export interface ExpenseAccount {
  code: string;
  label: string;
  /** Ord som pekar mot kontot, alltid små bokstäver. */
  keywords: string[];
}

export function accountCountry(currency?: string | null): AccountCountry {
  return (currency ?? "").toUpperCase() === "SEK" ? "se" : "ch";
}

const DRIVMEDEL = [
  "diesel",
  "bensin",
  "drivmedel",
  "bränsle",
  "tankning",
  "tanka",
  "benzin",
  "treibstoff",
  "brennstoff",
  "carburant",
  "fuel",
  "shell",
  "circle k",
  "preem",
  "okq8",
  "ingo",
  "st1",
  "avia",
  "socar",
  "tamoil",
  "agrola",
  "migrol",
  "bp",
  "esso",
  "aral",
  "coop pronto",
];

const VAROR = ["fisk", "skaldjur", "livsmedel", "råvara", "lebensmittel", "frukt", "grönt", "kött", "mejeri", "bröd"];
const STAD = ["städ", "rengöring", "diskmedel", "tvål", "sopborste", "reinigung", "putz", "papier", "hushållspapper"];
const FORBRUKNING = ["förbrukning", "emballage", "påse", "kartong", "handskar", "verbrauchsmaterial", "material"];
const LOKAL = ["hyra", "lokal", "miete", "raum", "el ", "elektricitet", "strom", "vatten", "wasser"];
const REPARATION = ["reparation", "service", "underhåll", "unterhalt", "reparatur", "kyl", "kompressor", "vvs"];
const KONTOR = ["kontor", "büro", "papper", "penna", "skrivare", "toner"];
const TELE = ["telefon", "mobil", "internet", "abonnement", "swisscom", "telia", "sunrise", "salt"];
const IT = ["it", "programvara", "software", "licens", "abonnemang", "molntjänst", "software"];
const MARKNAD = ["reklam", "annons", "marknadsföring", "werbung", "flyer", "trycksak", "blommor"];
const FRAKT = ["frakt", "transport", "leverans", "spedition", "versand", "porto", "post"];
const RESA = ["resa", "tåg", "sbb", "flyg", "hotell", "parkering", "taxi", "billett", "biljett"];
const BANK = ["bank", "avgift", "gebühr", "ränta", "kortavgift", "twint"];

/** Svenska konton, BAS. */
export const SE_ACCOUNTS: ExpenseAccount[] = [
  { code: "4010", label: "Inköp varor och material", keywords: VAROR },
  { code: "5611", label: "Drivmedel fordon", keywords: DRIVMEDEL },
  { code: "5615", label: "Reparation och underhåll fordon", keywords: ["bilservice", "däck", "bilreparation"] },
  { code: "5010", label: "Lokalhyra", keywords: LOKAL },
  { code: "5460", label: "Förbrukningsmaterial", keywords: [...STAD, ...FORBRUKNING] },
  { code: "5500", label: "Reparation och underhåll", keywords: REPARATION },
  { code: "5710", label: "Frakter och transport", keywords: FRAKT },
  { code: "5800", label: "Resekostnader", keywords: RESA },
  { code: "5910", label: "Annonsering och reklam", keywords: MARKNAD },
  { code: "6110", label: "Kontorsmateriel", keywords: KONTOR },
  { code: "6212", label: "Telefon och internet", keywords: TELE },
  { code: "6540", label: "IT-tjänster", keywords: IT },
  { code: "6570", label: "Bankkostnader", keywords: BANK },
];

/** Schweiziska konton, KMU-kontoramen. */
export const CH_ACCOUNTS: ExpenseAccount[] = [
  { code: "4000", label: "Materialaufwand — varuinköp", keywords: VAROR },
  { code: "6210", label: "Treibstoff — drivmedel", keywords: DRIVMEDEL },
  { code: "6220", label: "Reparation och underhåll fordon", keywords: ["autoservice", "pneu", "däck", "garage"] },
  { code: "6000", label: "Raumaufwand — lokalhyra", keywords: LOKAL },
  { code: "6040", label: "Reinigung — städ och förbrukning", keywords: [...STAD, ...FORBRUKNING] },
  { code: "6100", label: "Unterhalt und Reparaturen", keywords: REPARATION },
  { code: "6180", label: "Transport und Fracht", keywords: FRAKT },
  { code: "6640", label: "Reise und Spesen", keywords: RESA },
  { code: "6600", label: "Werbeaufwand — reklam", keywords: MARKNAD },
  { code: "6500", label: "Büromaterial och förvaltning", keywords: KONTOR },
  { code: "6510", label: "Telefon och internet", keywords: TELE },
  { code: "6570", label: "IT-Aufwand", keywords: IT },
  { code: "6940", label: "Bankspesen — bankkostnader", keywords: BANK },
];

export function accountsFor(currency?: string | null): ExpenseAccount[] {
  return accountCountry(currency) === "se" ? SE_ACCOUNTS : CH_ACCOUNTS;
}

export function accountLabel(code?: string | null, currency?: string | null): string | null {
  const c = (code ?? "").trim();
  if (!c) return null;
  const hit = accountsFor(currency).find((a) => a.code === c);
  return hit ? `${hit.code} ${hit.label}` : c;
}

/**
 * Föreslår konto utifrån det som står på pappret: företag, rubrik, kostnadsslag och köpta varor.
 * Drivmedel vinner alltid, så diesel och bensin hamnar på drivmedelskontot.
 */
export function suggestAccount(
  text: string,
  currency?: string | null,
): { code: string; label: string } | null {
  const hay = text.toLowerCase();
  const list = accountsFor(currency);
  const fuel = list.find((a) => a.keywords === DRIVMEDEL || a.keywords.includes("diesel"));
  if (fuel && DRIVMEDEL.some((k) => hay.includes(k))) return { code: fuel.code, label: fuel.label };
  for (const a of list) {
    if (a.keywords.some((k) => k.trim().length > 2 && hay.includes(k.trim()))) {
      return { code: a.code, label: a.label };
    }
  }
  return null;
}
