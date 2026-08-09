/**
 * Allergener på produkter.
 *
 * Två värden får aldrig blandas samman:
 *  - "Inga" betyder kontrollerat utan allergen (allergens_checked = true, tom lista)
 *  - tomt betyder inte kontrollerat (allergens_checked = false)
 */

import { ALLERGENS } from "@/lib/catering";

/** Klartextnamn enligt märkningsreglerna, används i utskrifter och etiketter. */
export const ALLERGEN_LABELS: Record<string, string> = {
  gluten: "Spannmål som innehåller gluten",
  skaldjur: "Kräftdjur",
  agg: "Ägg",
  fisk: "Fisk",
  jordnotter: "Jordnötter",
  soja: "Sojabönor",
  mjolk: "Mjölk",
  notter: "Nötter",
  selleri: "Selleri",
  senap: "Senap",
  sesam: "Sesamfrön",
  sulfit: "Svaveldioxid och sulfit",
  lupin: "Lupin",
  blotdjur: "Blötdjur",
};

export const allergenName = (code: string) => ALLERGEN_LABELS[code] ?? code;

const fold = (v: string) =>
  v
    .normalize("NFC")
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]/g, "");

/** Alla stavningar vi accepterar vid import, per allergenkod. */
const SYNONYMS: Record<string, string[]> = {
  gluten: ["gluten", "spannmalsomInnehallerGluten", "spannmal", "vete", "korn", "rag", "havre"],
  skaldjur: ["kraftdjur", "skaldjur", "krafta", "krabba", "rakor", "raka"],
  agg: ["agg", "aggprodukter", "hensagg"],
  fisk: ["fisk", "fiskprodukter"],
  jordnotter: ["jordnotter", "jordnot", "peanut"],
  soja: ["soja", "sojabonor", "sojabona"],
  mjolk: ["mjolk", "laktos", "mjolkprodukter", "grädde", "gradde", "smor"],
  notter: ["notter", "not", "mandel", "hasselnot", "valnot", "cashew", "pistage"],
  selleri: ["selleri"],
  senap: ["senap"],
  sesam: ["sesam", "sesamfron", "sesamfro"],
  sulfit: ["sulfit", "svaveldioxid", "svaveldioxidochsulfit", "so2"],
  lupin: ["lupin"],
  blotdjur: ["blotdjur", "musslor", "ostron", "blackfisk"],
};

const INDEX = (() => {
  const map = new Map<string, string>();
  ALLERGENS.forEach((a) => map.set(fold(a.key), a.key));
  Object.entries(ALLERGEN_LABELS).forEach(([code, label]) => map.set(fold(label), code));
  Object.entries(SYNONYMS).forEach(([code, list]) => list.forEach((s) => map.set(fold(s), code)));
  return map;
})();

const NONE_WORDS = new Set(["inga", "ingen", "inga allergener", "none", "nej", "-"].map(fold));

export interface ParsedAllergens {
  /** Kända allergenkoder */
  codes: string[];
  /** Kontrollerat: fältet innehöll ett värde, även när värdet var "Inga" */
  checked: boolean;
  /** Text som inte kunde tolkas som allergen — visas som varning vid import */
  unknown: string[];
}

/** Tolkar en cell med kommaseparerade allergener. Tom cell = inte kontrollerat. */
export function parseAllergenCell(raw: unknown): ParsedAllergens | null {
  const text = String(raw ?? "").trim();
  if (text === "") return null;
  if (NONE_WORDS.has(fold(text))) return { codes: [], checked: true, unknown: [] };

  const codes: string[] = [];
  const unknown: string[] = [];
  text
    .split(/[,;/]|\soch\s/gi)
    .map((p) => p.trim())
    .filter(Boolean)
    .forEach((part) => {
      if (NONE_WORDS.has(fold(part))) return;
      const hit = INDEX.get(fold(part));
      if (hit) {
        if (!codes.includes(hit)) codes.push(hit);
      } else {
        unknown.push(part);
      }
    });
  return { codes, checked: true, unknown };
}

export interface AllergenStatus {
  state: "declared" | "none" | "unchecked";
  codes: string[];
  mayContain: string[];
}

/** Statusen som styr visningen: deklarerat, kontrollerat utan allergen, eller ej kontrollerat. */
export function allergenStatus(product: {
  allergens?: string[] | null;
  may_contain?: string[] | null;
  allergens_checked?: boolean | null;
}): AllergenStatus {
  const codes = product.allergens ?? [];
  const mayContain = product.may_contain ?? [];
  if (codes.length > 0 || mayContain.length > 0) return { state: "declared", codes, mayContain };
  if (product.allergens_checked) return { state: "none", codes: [], mayContain: [] };
  return { state: "unchecked", codes: [], mayContain: [] };
}
