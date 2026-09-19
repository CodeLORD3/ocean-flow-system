/**
 * Burkräkning i Schweiz. Såser och röror står i hyllan som små burkar om
 * 1 hg — personalen räknar burkar, systemet sparar kilo som förut.
 */

export const DEFAULT_PACK_KG = 0.1;

/** Varugrupper som räknas i burkar (matchar "Såser & Röror", "Såser, Röror & Sylt"). */
export function isSauceCategory(category?: string | null) {
  const c = (category || "").toLowerCase();
  return c.includes("sås") || c.includes("röror");
}

export interface PackModeInput {
  category?: string | null;
  unit?: string | null;
  weightPerPiece?: number | null;
}

export interface PackMode {
  /** "burk" = personalen räknar antal burkar, "kg" = kilo som vanligt. */
  mode: "burk" | "kg";
  packKg: number;
}

/**
 * Burkarna finns som egna varor i varuregistret ("Räksallad 1hg", "… 2hg"),
 * så räkningen sker alltid i varans egen enhet. Ingen omräkning från kilo.
 */
export function packMode(item: PackModeInput, _country?: string | null): PackMode {
  const packKg = Number(item.weightPerPiece) > 0 ? Number(item.weightPerPiece) : DEFAULT_PACK_KG;
  return { mode: "kg", packKg };
}

/** Kilo → antal burkar (alltid hela burkar). */
export function kgToJars(kg: number, packKg: number) {
  if (!(packKg > 0)) return 0;
  return Math.max(0, Math.round(kg / packKg));
}

/** Antal burkar → kilo, max en decimal. */
export function jarsToKg(jars: number, packKg: number) {
  return Math.max(0, Math.round(jars * packKg * 10) / 10);
}

/** "10 burkar (1,0 kg)" — visas i sammanfattningen. */
export function jarsText(kg: number, packKg: number) {
  const jars = kgToJars(kg, packKg);
  const kilo = jarsToKg(jars, packKg).toFixed(1).replace(".", ",");
  return `${jars} ${jars === 1 ? "burk" : "burkar"} (${kilo} kg)`;
}

/** "burkar à 1 hg" — texten under varunamnet. */
export function packLabel(packKg: number) {
  const hg = Math.round(packKg * 10 * 10) / 10;
  return `burkar à ${String(hg).replace(".", ",")} hg`;
}
