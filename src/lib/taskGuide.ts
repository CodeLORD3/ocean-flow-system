/**
 * Arbetsbeskrivning för en uppgift: målet ("så här ska det se ut"),
 * vad man behöver (varor och redskap med bild) och steg för steg med bild.
 * Sparas i kolumnen guide på checklist_items och checklist_template_items.
 */

export type GuideStep = { text: string; image?: string | null };
export type GuideMaterial = { name: string; image?: string | null };

export type TaskGuide = {
  /** Vad målet är, i löpande text. */
  goal: string;
  /** Bilder som visar hur det ska se ut när det är klart. */
  goalImages: string[];
  /** Varor och redskap som behövs. */
  materials: GuideMaterial[];
  /** Steg för steg, med bild per steg. */
  steps: GuideStep[];
};

export const EMPTY_GUIDE: TaskGuide = { goal: "", goalImages: [], materials: [], steps: [] };

function str(v: unknown) {
  return typeof v === "string" ? v : "";
}

/** Läser guide-kolumnen tolerant, och faller tillbaka på gamla textsteg. */
export function parseGuide(raw: unknown, fallbackSteps?: string[] | null): TaskGuide {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const steps: GuideStep[] = Array.isArray(o.steps)
    ? (o.steps as unknown[])
        .map((s) =>
          typeof s === "string"
            ? { text: s, image: null }
            : { text: str((s as any)?.text), image: str((s as any)?.image) || null },
        )
        .filter((s) => s.text.trim().length > 0 || s.image)
    : (fallbackSteps ?? []).map((t) => ({ text: t, image: null }));

  const materials: GuideMaterial[] = Array.isArray(o.materials)
    ? (o.materials as unknown[])
        .map((m) =>
          typeof m === "string"
            ? { name: m, image: null }
            : { name: str((m as any)?.name), image: str((m as any)?.image) || null },
        )
        .filter((m) => m.name.trim().length > 0 || m.image)
    : [];

  const goalImages = Array.isArray(o.goalImages)
    ? (o.goalImages as unknown[]).map((u) => str(u)).filter(Boolean)
    : [];

  return { goal: str(o.goal), goalImages, materials, steps };
}

/** Tomt räknas som ingen beskrivning alls, så vi sparar null i stället. */
export function guideIsEmpty(g: TaskGuide) {
  return (
    !g.goal.trim() &&
    g.goalImages.length === 0 &&
    g.materials.every((m) => !m.name.trim() && !m.image) &&
    g.steps.every((s) => !s.text.trim() && !s.image)
  );
}

/** Rensar bort tomma rader inför sparning. */
export function cleanGuide(g: TaskGuide): TaskGuide | null {
  const cleaned: TaskGuide = {
    goal: g.goal.trim(),
    goalImages: g.goalImages.filter(Boolean),
    materials: g.materials.filter((m) => m.name.trim() || m.image).map((m) => ({ name: m.name.trim(), image: m.image ?? null })),
    steps: g.steps.filter((s) => s.text.trim() || s.image).map((s) => ({ text: s.text.trim(), image: s.image ?? null })),
  };
  return guideIsEmpty(cleaned) ? null : cleaned;
}
