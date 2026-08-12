/**
 * Sorteringsklasser (storlekssortering) per artgrupp enligt EU 2406/96.
 *
 * Registret är sanningen för vilka storlekar som finns per art. Produkter som
 * har en klass kopplad är storleksvarianter och de enda som får köpas in för
 * arter som finns i registret — grundprodukten är spärrad (purchasable = false).
 */
import { speciesKey } from "@/lib/asciiFold";

export interface SizeGrade {
  id: string;
  species_group: string;
  grade_no: number;
  label: string | null;
  min_weight_kg: number | null;
  max_weight_kg: number | null;
  min_count_per_kg: number | null;
  max_count_per_kg: number | null;
  note: string | null;
  active: boolean;
}

const nf = (n: number) =>
  n.toLocaleString("sv-SE", { maximumFractionDigits: 2 }).replace(/\u00a0/g, " ");

/** Läsbart intervall: vikt i kg för fisk, antal per kg för skaldjur. */
export function gradeRangeText(g: Pick<SizeGrade,
  "min_weight_kg" | "max_weight_kg" | "min_count_per_kg" | "max_count_per_kg">): string {
  if (g.min_count_per_kg != null || g.max_count_per_kg != null) {
    if (g.min_count_per_kg != null && g.max_count_per_kg != null)
      return `${g.min_count_per_kg}–${g.max_count_per_kg} st/kg`;
    if (g.min_count_per_kg != null) return `≥ ${g.min_count_per_kg} st/kg`;
    return `≤ ${g.max_count_per_kg} st/kg`;
  }
  if (g.min_weight_kg != null && g.max_weight_kg != null)
    return `${nf(Number(g.min_weight_kg))}–${nf(Number(g.max_weight_kg))} kg`;
  if (g.min_weight_kg != null) return `≥ ${nf(Number(g.min_weight_kg))} kg`;
  if (g.max_weight_kg != null) return `< ${nf(Number(g.max_weight_kg))} kg`;
  return "—";
}

/** Etikett för en klass: "3 · 2–4 kg". */
export function gradeLabel(g: SizeGrade): string {
  return `${g.label || g.grade_no} · ${gradeRangeText(g)}`;
}

/** Klasserna för en art, sorterade. */
export function gradesForSpecies(grades: SizeGrade[], species: unknown): SizeGrade[] {
  const key = speciesKey(species);
  if (!key) return [];
  return grades
    .filter((g) => speciesKey(g.species_group) === key && g.active !== false)
    .sort((a, b) => a.grade_no - b.grade_no);
}

/** Har arten ett sorteringsregister? Då är grundprodukten spärrad. */
export function speciesHasGrades(grades: SizeGrade[], species: unknown): boolean {
  return gradesForSpecies(grades, species).length > 0;
}

/**
 * Plockar ut sorteringssiffran ur en handelsbeteckning.
 * Klarar "Torsk 3", "Torsk stl 3", "Sej klass 1", "Torsk 3 färsk".
 * Returnerar null när sorteringen inte går att avgöra — då ska användaren välja.
 */
export function parseSizeGradeNo(text: unknown): number | null {
  const raw = speciesKey(text).replace(/[.,;]/g, " ").replace(/\s+/g, " ").trim();
  if (!raw) return null;

  // Uttalad sorteringsangivelse
  const tagged = raw.match(/\b(?:stl|storlek|str|strl|klass|sort(?:ering)?|kl)\s*(\d)\b/);
  if (tagged) return clampGrade(Number(tagged[1]));

  // Intervall som "6-10" är antal per kg, inte klass
  if (/\b\d+\s*[-/]\s*\d+\b/.test(raw)) return null;

  // Ensam siffra i slutet ("torsk 3") eller mitten ("torsk 3 farsk")
  const trailing = raw.match(/(?:^|\s)(\d)(?:\s|$)/g);
  if (trailing && trailing.length === 1) {
    const n = Number(trailing[0].trim());
    return clampGrade(n);
  }
  return null;
}

function clampGrade(n: number): number | null {
  return Number.isInteger(n) && n >= 1 && n <= 9 ? n : null;
}

/**
 * Klass utifrån antal per kg (skaldjur), t.ex. "16-20" på följesedeln.
 * Används som stöd när sorteringssiffra saknas.
 */
export function gradeFromCountRange(text: unknown, grades: SizeGrade[]): SizeGrade | null {
  const m = speciesKey(text).match(/\b(\d{1,3})\s*[-/]\s*(\d{1,3})\b/);
  if (!m) return null;
  const lo = Number(m[1]);
  const hi = Number(m[2]);
  return (
    grades.find((g) => Number(g.min_count_per_kg) === lo && Number(g.max_count_per_kg) === hi) ?? null
  );
}
