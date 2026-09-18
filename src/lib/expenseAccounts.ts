/**
 * Bokföringskonton för Viktiga papper.
 * Varje kostnadsslag har både ett svenskt konto (BAS) och ett schweiziskt (KMU),
 * så samma papper kan bokföras i båda länderna. Valutan avgör vilket som föreslås
 * först, men båda listorna är alltid valbara — butiker finns i Schweiz och Sverige.
 */
export type AccountCountry = "se" | "ch";

export interface ExpenseAccount {
  code: string;
  label: string;
  /** Ord som pekar mot kontot, alltid små bokstäver. */
  keywords: string[];
  /** Kostnadsslaget som binder ihop svenskt och schweiziskt konto. */
  pairKey: string;
  country: AccountCountry;
}

/** Ett kostnadsslag med konto i båda länderna. */
export interface AccountPair {
  key: string;
  /** Kostnadsslag på svenska, används som sökbar text på pappret. */
  label: string;
  se: { code: string; label: string };
  ch: { code: string; label: string };
  keywords: string[];
}

export function accountCountry(currency?: string | null): AccountCountry {
  return (currency ?? "").toUpperCase() === "SEK" ? "se" : "ch";
}

export const COUNTRY_LABEL: Record<AccountCountry, string> = {
  se: "Svenska konton (BAS)",
  ch: "Schweiziska konton (KMU)",
};

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
const FORDON = ["bilservice", "däck", "bilreparation", "autoservice", "pneu", "garage"];
const KONTOR = ["kontor", "büro", "papper", "penna", "skrivare", "toner"];
const TELE = ["telefon", "mobil", "internet", "abonnement", "swisscom", "telia", "sunrise", "salt"];
const IT = ["it", "programvara", "software", "licens", "abonnemang", "molntjänst"];
const MARKNAD = ["reklam", "annons", "marknadsföring", "werbung", "flyer", "trycksak", "blommor"];
const FRAKT = ["frakt", "transport", "leverans", "spedition", "versand", "porto", "post"];
const RESA = ["resa", "tåg", "sbb", "flyg", "hotell", "parkering", "taxi", "billett", "biljett"];
const BANK = ["bank", "avgift", "gebühr", "ränta", "kortavgift", "twint"];

/** Kostnadsslag med konto i båda länderna. Drivmedel först — det matchas alltid först. */
export const ACCOUNT_PAIRS: AccountPair[] = [
  {
    key: "drivmedel",
    label: "Drivmedel",
    se: { code: "5611", label: "Drivmedel fordon" },
    ch: { code: "6210", label: "Treibstoff — drivmedel" },
    keywords: DRIVMEDEL,
  },
  {
    key: "varor",
    label: "Varuinköp",
    se: { code: "4010", label: "Inköp varor och material" },
    ch: { code: "4000", label: "Materialaufwand — varuinköp" },
    keywords: VAROR,
  },
  {
    key: "fordon",
    label: "Fordon, reparation",
    se: { code: "5615", label: "Reparation och underhåll fordon" },
    ch: { code: "6220", label: "Reparation och underhåll fordon" },
    keywords: FORDON,
  },
  {
    key: "lokal",
    label: "Lokalhyra och el",
    se: { code: "5010", label: "Lokalhyra" },
    ch: { code: "6000", label: "Raumaufwand — lokalhyra" },
    keywords: LOKAL,
  },
  {
    key: "forbrukning",
    label: "Städ och förbrukning",
    se: { code: "5460", label: "Förbrukningsmaterial" },
    ch: { code: "6040", label: "Reinigung — städ och förbrukning" },
    keywords: [...STAD, ...FORBRUKNING],
  },
  {
    key: "reparation",
    label: "Reparation och underhåll",
    se: { code: "5500", label: "Reparation och underhåll" },
    ch: { code: "6100", label: "Unterhalt und Reparaturen" },
    keywords: REPARATION,
  },
  {
    key: "frakt",
    label: "Frakt och transport",
    se: { code: "5710", label: "Frakter och transport" },
    ch: { code: "6180", label: "Transport und Fracht" },
    keywords: FRAKT,
  },
  {
    key: "resa",
    label: "Resor",
    se: { code: "5800", label: "Resekostnader" },
    ch: { code: "6640", label: "Reise und Spesen" },
    keywords: RESA,
  },
  {
    key: "marknad",
    label: "Reklam och marknadsföring",
    se: { code: "5910", label: "Annonsering och reklam" },
    ch: { code: "6600", label: "Werbeaufwand — reklam" },
    keywords: MARKNAD,
  },
  {
    key: "kontor",
    label: "Kontorsmateriel",
    se: { code: "6110", label: "Kontorsmateriel" },
    ch: { code: "6500", label: "Büromaterial och förvaltning" },
    keywords: KONTOR,
  },
  {
    key: "tele",
    label: "Telefon och internet",
    se: { code: "6212", label: "Telefon och internet" },
    ch: { code: "6510", label: "Telefon och internet" },
    keywords: TELE,
  },
  {
    key: "it",
    label: "IT-tjänster",
    se: { code: "6540", label: "IT-tjänster" },
    ch: { code: "6570", label: "IT-Aufwand" },
    keywords: IT,
  },
  {
    key: "bank",
    label: "Bankkostnader",
    se: { code: "6570", label: "Bankkostnader" },
    ch: { code: "6940", label: "Bankspesen — bankkostnader" },
    keywords: BANK,
  },
];

const listFor = (country: AccountCountry): ExpenseAccount[] =>
  ACCOUNT_PAIRS.map((p) => ({
    code: p[country].code,
    label: p[country].label,
    keywords: p.keywords,
    pairKey: p.key,
    country,
  })).sort((a, b) => a.code.localeCompare(b.code));

/** Svenska konton, BAS. */
export const SE_ACCOUNTS: ExpenseAccount[] = listFor("se");
/** Schweiziska konton, KMU-kontoramen. */
export const CH_ACCOUNTS: ExpenseAccount[] = listFor("ch");

/** Alla konton, båda länderna. Landet som hör till valutan kommer först. */
export function allAccountGroups(
  currency?: string | null,
): { country: AccountCountry; label: string; accounts: ExpenseAccount[] }[] {
  const primary = accountCountry(currency);
  const order: AccountCountry[] = primary === "se" ? ["se", "ch"] : ["ch", "se"];
  return order.map((c) => ({
    country: c,
    label: COUNTRY_LABEL[c],
    accounts: c === "se" ? SE_ACCOUNTS : CH_ACCOUNTS,
  }));
}

/** Konton för valutans land. Behålls för listor som bara vill visa ett land. */
export function accountsFor(currency?: string | null): ExpenseAccount[] {
  return accountCountry(currency) === "se" ? SE_ACCOUNTS : CH_ACCOUNTS;
}

/** Hittar kontot i båda länderna, oavsett vilken valuta pappret har. */
export function findAccount(code?: string | null): ExpenseAccount | null {
  const c = (code ?? "").trim();
  if (!c) return null;
  return [...SE_ACCOUNTS, ...CH_ACCOUNTS].find((a) => a.code === c) ?? null;
}

export function accountLabel(code?: string | null, currency?: string | null): string | null {
  const c = (code ?? "").trim();
  if (!c) return null;
  const primary = accountsFor(currency).find((a) => a.code === c);
  const hit = primary ?? findAccount(c);
  return hit ? `${hit.code} ${hit.label}` : c;
}

/** Motsvarande konto i det andra landet, så man kan byta bokföringsland senare. */
export function counterpartAccount(code?: string | null): ExpenseAccount | null {
  const hit = findAccount(code);
  if (!hit) return null;
  const other: AccountCountry = hit.country === "se" ? "ch" : "se";
  const pair = ACCOUNT_PAIRS.find((p) => p.key === hit.pairKey);
  if (!pair) return null;
  return { ...pair[other], keywords: pair.keywords, pairKey: pair.key, country: other };
}

/** Kostnadsslaget som matchar texten på pappret. Drivmedel vinner alltid. */
export function suggestAccountPair(text: string): AccountPair | null {
  const hay = text.toLowerCase();
  const fuel = ACCOUNT_PAIRS[0];
  if (DRIVMEDEL.some((k) => hay.includes(k))) return fuel;
  return (
    ACCOUNT_PAIRS.find((p) =>
      p.keywords.some((k) => k.trim().length > 2 && hay.includes(k.trim())),
    ) ?? null
  );
}

/**
 * Föreslår bokföringskonto utifrån det som står på pappret: företag, rubrik,
 * kostnadsslag och köpta varor. Ger både svenskt och schweiziskt konto — det som
 * hör till valutan blir förslaget, det andra visas som motsvarighet.
 */
export function suggestAccount(
  text: string,
  currency?: string | null,
): { code: string; label: string; category: string; se: string; ch: string } | null {
  const pair = suggestAccountPair(text);
  if (!pair) return null;
  const country = accountCountry(currency);
  return {
    code: pair[country].code,
    label: pair.label,
    category: pair.label,
    se: pair.se.code,
    ch: pair.ch.code,
  };
}
