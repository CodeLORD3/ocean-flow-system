/**
 * Arbetsbeskrivning för en uppgift: målet ("så här ska det se ut"),
 * vad man behöver (varor och redskap med bild och plats på butikskartan)
 * och steg för steg med bild, samt hur sakerna ställs tillbaka.
 * Sparas i kolumnen guide på checklist_items och checklist_template_items.
 */

export type GuideStep = {
  text: string;
  image?: string | null;
  /** Fler bilder på steget, bläddras åt höger och vänster. */
  images?: string[];
  /** Kort videoklipp, högst ett halvt minut. */
  video?: string | null;
  /** Viktig punkt: det som avgör om resultatet blir rätt. */
  keyPoint?: string;
  /** Varför steget görs. */
  why?: string;
  /** Uppskattad tid för steget. */
  minutes?: number | null;
  /** Säkerhet att tänka på. */
  safety?: string;
  /** HACCP när det är relevant. */
  haccp?: string;
  /** Markerade rutor i stegbilden med kort text, andel av bildens mått (0–1). */
  marks?: GuideMark[];
};

export type GuideMark = {
  id: string;
  region: { x: number; y: number; w: number; h: number };
  label: string;
};
export type GuideMaterial = {
  name: string;
  image?: string | null;
  /** Ytan på butikskartan där saken finns. */
  zoneId?: string | null;
  /** Plats i klartext, t.ex. "hyllan över vasken". */
  place?: string;
};

export type TaskGuide = {
  /** Vad målet är, i löpande text. */
  goal: string;
  /** Bilder som visar hur det ska se ut när det är klart. */
  goalImages: string[];
  /** Varor och redskap som behövs. */
  materials: GuideMaterial[];
  /** Steg för steg, med bild per steg. */
  steps: GuideStep[];
  /** Hur sakerna ställs tillbaka när arbetet är klart. */
  putBack: string;
  /** Bilder som visar rätt läge när sakerna är tillbaka. */
  putBackImages: string[];
};

export const EMPTY_GUIDE: TaskGuide = {
  goal: "",
  goalImages: [],
  materials: [],
  steps: [],
  putBack: "",
  putBackImages: [],
};

function str(v: unknown) {
  return typeof v === "string" ? v : "";
}

function urls(v: unknown) {
  return Array.isArray(v) ? (v as unknown[]).map((u) => str(u)).filter(Boolean) : [];
}

function marksOf(v: unknown): GuideMark[] {
  if (!Array.isArray(v)) return [];
  return (v as unknown[])
    .map((m) => {
      const r = (m as any)?.region ?? {};
      const num = (x: unknown) => (typeof x === "number" && isFinite(x) ? x : 0);
      return {
        id: str((m as any)?.id) || Math.random().toString(36).slice(2),
        region: { x: num(r.x), y: num(r.y), w: num(r.w), h: num(r.h) },
        label: str((m as any)?.label),
      };
    })
    .filter((m) => m.region.w > 0 && m.region.h > 0);
}

/** Läser guide-kolumnen tolerant, och faller tillbaka på gamla textsteg. */
export function parseGuide(raw: unknown, fallbackSteps?: string[] | null): TaskGuide {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const steps: GuideStep[] = Array.isArray(o.steps)
    ? (o.steps as unknown[])
        .map((s) =>
          typeof s === "string"
            ? { text: s, image: null }
            : {
                text: str((s as any)?.text),
                image: str((s as any)?.image) || null,
                video: str((s as any)?.video) || null,
                keyPoint: str((s as any)?.keyPoint),
                why: str((s as any)?.why),
                minutes: typeof (s as any)?.minutes === "number" ? (s as any).minutes : null,
                safety: str((s as any)?.safety),
                haccp: str((s as any)?.haccp),
                marks: marksOf((s as any)?.marks),
              },
        )
        .filter((s) => s.text.trim().length > 0 || s.image)
    : (fallbackSteps ?? []).map((t) => ({ text: t, image: null }));

  const materials: GuideMaterial[] = Array.isArray(o.materials)
    ? (o.materials as unknown[])
        .map((m) =>
          typeof m === "string"
            ? { name: m, image: null, zoneId: null, place: "" }
            : {
                name: str((m as any)?.name),
                image: str((m as any)?.image) || null,
                zoneId: str((m as any)?.zoneId) || null,
                place: str((m as any)?.place),
              },
        )
        .filter((m) => m.name.trim().length > 0 || m.image)
    : [];

  return {
    goal: str(o.goal),
    goalImages: urls(o.goalImages),
    materials,
    steps,
    putBack: str(o.putBack),
    putBackImages: urls(o.putBackImages),
  };
}

/** Tomt räknas som ingen beskrivning alls, så vi sparar null i stället. */
export function guideIsEmpty(g: TaskGuide) {
  return (
    !g.goal.trim() &&
    g.goalImages.length === 0 &&
    !g.putBack.trim() &&
    g.putBackImages.length === 0 &&
    g.materials.every((m) => !m.name.trim() && !m.image) &&
    g.steps.every((s) => !s.text.trim() && !s.image)
  );
}

/** Rensar bort tomma rader inför sparning. */
export function cleanGuide(g: TaskGuide): TaskGuide | null {
  const cleaned: TaskGuide = {
    goal: g.goal.trim(),
    goalImages: g.goalImages.filter(Boolean),
    materials: g.materials
      .filter((m) => m.name.trim() || m.image)
      .map((m) => ({
        name: m.name.trim(),
        image: m.image ?? null,
        zoneId: m.zoneId ?? null,
        place: (m.place ?? "").trim(),
      })),
    steps: g.steps
      .filter((s) => s.text.trim() || s.image || s.video)
      .map((s) => ({
        text: s.text.trim(),
        image: s.image ?? null,
        video: s.video ?? null,
        keyPoint: (s.keyPoint ?? "").trim(),
        why: (s.why ?? "").trim(),
        minutes: s.minutes ?? null,
        safety: (s.safety ?? "").trim(),
        haccp: (s.haccp ?? "").trim(),
        marks: (s.marks ?? []).filter((m) => m.region.w > 0 && m.region.h > 0),
      })),
    putBack: g.putBack.trim(),
    putBackImages: g.putBackImages.filter(Boolean),
  };
  return guideIsEmpty(cleaned) ? null : cleaned;
}
