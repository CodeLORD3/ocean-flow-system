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

/** Artgrupp → modell, fallback när databasen saknar rad. */
export const SPECIES_CUT_MODEL: Record<string, CutModel> = {
  torsk: "loin_four",
  sej: "loin_four",
  kolja: "loin_four",
  kummel: "loin_four",
  långa: "loin_four",
  lubb: "loin_four",
  havskatt: "loin_four",
  kolfisk: "loin_four",
  bleka: "loin_four",
  kapkummel: "loin_four",

  tonfisk: "loin_whole",
  "blåfenad-tonfisk": "loin_whole",
  svärdfisk: "loin_whole",
  seriola: "loin_whole",

  lax: "salmon_side",
  regnbåge: "salmon_side",
  havsöring: "salmon_side",
  röding: "salmon_side",

  hälleflundra: "flatfish",
  blåkveite: "flatfish",
  piggvar: "flatfish",
  slätvar: "flatfish",
  rödspätta: "flatfish",
  sjötunga: "flatfish",
  bergtunga: "flatfish",
  rödtunga: "flatfish",
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
  return SPECIES_CUT_MODEL[(species || "").trim().toLowerCase()] ?? "single";
}
