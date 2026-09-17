/**
 * Arbetstyper för checklistuppgifter. Samma nycklar som databasfunktionen
 * public.guess_work_type använder, så sortering blir lika överallt.
 */
export type WorkTypeKey =
  | "stadning"
  | "temperatur"
  | "rapporter"
  | "bestallning"
  | "underhall"
  | "personal"
  | "ovrigt";

export const WORK_TYPES: { key: WorkTypeKey; label: string; color: string }[] = [
  { key: "stadning", label: "Städning", color: "#0ea5e9" },
  { key: "temperatur", label: "Temperatur", color: "#2563eb" },
  { key: "rapporter", label: "Rapporter", color: "#7c3aed" },
  { key: "bestallning", label: "Beställning", color: "#c2410c" },
  { key: "underhall", label: "Underhåll", color: "#b45309" },
  { key: "personal", label: "Personal", color: "#0f766e" },
  { key: "ovrigt", label: "Övrigt", color: "#64748b" },
];

const RULES: { key: WorkTypeKey; words: string[] }[] = [
  { key: "stadning", words: ["städ", "golv", "avlopp", "rengör", "disk"] },
  { key: "temperatur", words: ["kyl", "frys", "temperatur", "temp"] },
  { key: "rapporter", words: ["rapport", "kassa", "administration", "bokför"] },
  { key: "bestallning", words: ["beställ", "order", "inköp", "leverans"] },
  { key: "underhall", words: ["underhåll", "redskap", "maskin", "produktion", "lås", "säkerhet"] },
  { key: "personal", words: ["personal", "morgondag", "schema"] },
];

/** Gissar arbetstyp från fri text — samma ordning och ord som i databasen. */
export function guessWorkType(text?: string | null): WorkTypeKey {
  const t = (text ?? "").toLowerCase();
  if (!t.trim()) return "ovrigt";
  for (const rule of RULES) {
    if (rule.words.some((w) => t.includes(w))) return rule.key;
  }
  return "ovrigt";
}

export function workTypeLabel(key?: string | null): string {
  return WORK_TYPES.find((w) => w.key === key)?.label ?? "Övrigt";
}

export function workTypeColor(key?: string | null): string {
  return WORK_TYPES.find((w) => w.key === key)?.color ?? "#64748b";
}

/** Arbetstypen på en uppgift: sparat värde först, annars gissning ur rubrikerna. */
export function workTypeOf(task: {
  work_type?: string | null;
  category?: string | null;
  section?: string | null;
  task?: string | null;
}): WorkTypeKey {
  const saved = task.work_type as WorkTypeKey | null | undefined;
  if (saved && WORK_TYPES.some((w) => w.key === saved)) return saved;
  return guessWorkType(task.category || task.section || task.task);
}
