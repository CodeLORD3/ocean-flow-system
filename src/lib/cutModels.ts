import { speciesKey } from "@/lib/asciiFold";
/**
 * Styckningsmodeller per art.
 *
 * Systemet får aldrig erbjuda detaljer som inte ingår i artens modell. Modellen
 * hämtas i första hand från tabellen `species_cut_models`; listorna här används
 * som fallback och som förslag i formulär.
 */

export type CutModel =
  | "loin_four"
  | "loin_whole"
  | "salmon_side"
  | "flatfish"
  | "tail_only"
  | "single";

export const CUT_MODEL_LABELS: Record<CutModel, string> = {
  loin_four: "Fyrdelad filé (rygg, benfri filé, slag, kontrarygg)",
  loin_whole: "Hela loins (loin, buk, avskär)",
  salmon_side: "Laxsida (rygg, buk)",
  flatfish: "Plattfisk (hel filé, kotlett, fletch)",
  tail_only: "Endast stjärt",
  single: "Endast hel filé",
};

export interface ModelDetail {
  form: string;
  name: string;
  pctOfFillet: number;
  role: "primary" | "byproduct";
  optional?: boolean;
}

/** Fallback-mallar om databasen saknar rader. */
export const CUT_MODEL_TEMPLATES: Record<CutModel, ModelDetail[]> = {
  loin_four: [
    { form: "rygg", name: "Rygg", pctOfFillet: 55, role: "primary" },
    { form: "benfri filé", name: "Benfri filé", pctOfFillet: 20, role: "byproduct" },
    { form: "slag", name: "Slag", pctOfFillet: 15, role: "byproduct" },
    { form: "kontrarygg", name: "Kontrarygg", pctOfFillet: 10, role: "byproduct" },
  ],
  loin_whole: [
    { form: "loin", name: "Loin", pctOfFillet: 70, role: "primary" },
    { form: "buk", name: "Buk", pctOfFillet: 20, role: "byproduct" },
    { form: "avskär", name: "Avskär", pctOfFillet: 10, role: "byproduct" },
  ],
  salmon_side: [
    { form: "rygg", name: "Rygg (backloin)", pctOfFillet: 60, role: "primary" },
    { form: "buk", name: "Buk (bellyloin)", pctOfFillet: 40, role: "byproduct" },
  ],
  flatfish: [
    { form: "hel filé", name: "Hel filé", pctOfFillet: 100, role: "primary" },
    { form: "kotlett", name: "Kotlett/tronçon", pctOfFillet: 0, role: "primary", optional: true },
    { form: "fletch", name: "Fletch", pctOfFillet: 0, role: "primary", optional: true },
  ],
  tail_only: [{ form: "stjärt", name: "Stjärt", pctOfFillet: 100, role: "primary" }],
  single: [{ form: "hel filé", name: "Hel filé", pctOfFillet: 100, role: "primary" }],
};

/** Minsta styckvikt för att modellen ska vara försvarbar (kg). */
export const MODEL_MIN_PIECE_WEIGHT: Partial<Record<CutModel, number>> = {
  loin_four: 3,
};

/**
 * Artgrupp → modell, fallback när databasen saknar rad.
 * Nycklarna är ASCII-normaliserade (speciesKey): å/ä → a, ö → o. Uppslagning
 * sker alltid via modelForSpecies() som normaliserar sin indata på samma sätt,
 * så både "långa" och "langa" hittar rätt modell.
 */
export const SPECIES_CUT_MODEL: Record<string, CutModel> = {
  torsk: "loin_four",
  sej: "loin_four",
  kolja: "loin_four",
  kummel: "loin_four",
  langa: "loin_four",
  lubb: "loin_four",
  havskatt: "loin_four",
  kolfisk: "loin_four",
  bleka: "loin_four",
  kapkummel: "loin_four",

  tonfisk: "loin_whole",
  "blafenad-tonfisk": "loin_whole",
  svardfisk: "loin_whole",
  seriola: "loin_whole",

  lax: "salmon_side",
  regnbage: "salmon_side",
  havsoring: "salmon_side",
  roding: "salmon_side",

  halleflundra: "flatfish",
  blakveite: "flatfish",
  piggvar: "flatfish",
  slatvar: "flatfish",
  rodspatta: "flatfish",
  sjotunga: "flatfish",
  bergtunga: "flatfish",
  rodtunga: "flatfish",
  sillflundra: "flatfish",

  marulk: "tail_only",
};

/** Alias för stjärtdetaljen — "Benfri filé" är namnet som visas i butik. */
export const BENFRI_FILE_ALIASES = ["benfri filé", "benfri file", "stjärtbit"];

export const BENFRI_FILE_LABEL = "Benfri filé";

/** Normaliserar en detaljform så att aliasen pekar på samma detalj. */
export function normalizeDetailForm(form: string): string {
  const f = (form || "").trim().toLowerCase();
  if (BENFRI_FILE_ALIASES.includes(f)) return "benfri filé";
  return f;
}

/** Visningsnamn för en detaljform. */
export function detailFormLabel(form: string): string {
  const f = normalizeDetailForm(form);
  if (f === "benfri filé") return BENFRI_FILE_LABEL;
  return form;
}

export function modelForSpecies(species: string): CutModel {
  return SPECIES_CUT_MODEL[speciesKey(species)] ?? "single";
}

/**
 * Sorteringen avgör styckningen. Från och med `gradeLimit` (t.ex. 3 för torsk)
 * är fisken för liten för fyrdelning och styckas som hel filé.
 */
export function effectiveCutModel(
  baseModel: CutModel,
  grade?: string | number | null,
  gradeLimit?: number | null,
): CutModel {
  const g = Number(String(grade ?? "").trim());
  const limit = Number(gradeLimit ?? 0);
  if (limit > 0 && Number.isFinite(g) && g >= limit) return "single";
  return baseModel;
}

/** Finns arten i modellregistret (efter normalisering)? */
export function hasCutModel(species: string): boolean {
  return speciesKey(species) in SPECIES_CUT_MODEL;
}

/**
 * Utbytesrad för art/form. En rad med matchande sortering går före den
 * generella raden (grade = ''), som gäller alla sorteringar.
 */
export function pickYieldRow<T extends { species_group: string; from_form: string; to_form: string; grade?: string | null; yield_pct: number | string }>(
  rows: T[],
  species: string,
  fromForm: string,
  grade?: string | number | null,
  isMatchingToForm: (toForm: string) => boolean = () => true,
): T | null {
  const g = String(grade ?? "").trim();
  const candidates = rows.filter(
    (r) =>
      speciesKey(r.species_group) === speciesKey(species) &&
      r.from_form === fromForm &&
      isMatchingToForm(r.to_form),
  );
  const best = (list: T[]) => list.sort((a, b) => Number(b.yield_pct) - Number(a.yield_pct))[0] ?? null;
  if (g) {
    const exact = best(candidates.filter((r) => String(r.grade ?? "").trim() === g));
    if (exact) return exact;
  }
  return best(candidates.filter((r) => !String(r.grade ?? "").trim()));
}

export { speciesKey };
