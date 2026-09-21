/**
 * Arbetsstatus för en bild i bildbiblioteket.
 *
 * Status är aldrig ett kvalitetsbetyg — den säger bara hur långt sorteringen
 * kommit. Ingen väljer status för hand: den räknas alltid ut från vad bilden
 * faktiskt är kopplad till. All kod som behöver veta om en bild är klar ska
 * använda deriveImageStatus, så att "Klar" betyder samma sak överallt.
 */

export type ImageStatus = "unclassified" | "partial" | "classified";

/** Vad bilden visar. Styr vilka kopplingar som krävs för status Klar. */
export type MediaKind = "area" | "resource" | "product" | "observation" | "task" | "other";

export const MEDIA_KINDS: { value: MediaKind; label: string; hint: string }[] = [
  { value: "area", label: "Område/plats", hint: "Butik och område" },
  { value: "resource", label: "Sak/verktyg", hint: "Vald sak i Utrustning & material" },
  { value: "product", label: "Vara/produkt", hint: "Vald produkt" },
  { value: "observation", label: "Iakttagelse", hint: "Vad du såg och var" },
  { value: "task", label: "Uppgift/arbete", hint: "Vald uppgift" },
  { value: "other", label: "Annat", hint: "Butik räcker" },
];

export function mediaKindLabel(kind: string | null | undefined) {
  return MEDIA_KINDS.find((k) => k.value === kind)?.label ?? "Inte valt";
}

/** Bildens roll: varför bilden finns på just det stället. */
export const RELATION_TYPES: { value: string; label: string }[] = [
  { value: "overview", label: "Översikt" },
  { value: "reference", label: "Referensbild" },
  { value: "documentation", label: "Dokumentation" },
  { value: "before", label: "Före" },
  { value: "after", label: "Efter" },
  { value: "proof", label: "Bevis" },
  { value: "instruction", label: "Instruktion" },
  { value: "contains", label: "Innehåller" },
];

export function relationLabel(value: string | null | undefined) {
  return RELATION_TYPES.find((r) => r.value === value)?.label ?? "Dokumentation";
}

export const STATUS_LABEL: Record<ImageStatus, string> = {
  unclassified: "Oplacerad",
  partial: "Delvis klar",
  classified: "Klar",
};

/** Neutrala färger — arbetsstatus, aldrig ett fel. */
export const STATUS_CLASS: Record<ImageStatus, string> = {
  unclassified: "bg-muted text-muted-foreground",
  partial: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200",
  classified: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200",
};

export type StatusLink = { entity_type: string; entity_id: string };

export type StatusImage = {
  media_kind?: string | null;
  /** Bakåtkompatibel hemvist — används bara som stöd när länkar saknas. */
  entity_type?: string | null;
  entity_id?: string | null;
};

const has = (links: StatusLink[], type: string) =>
  links.some((l) => l.entity_type === type && !!l.entity_id);

/**
 * Räknar ut arbetsstatus för en bild.
 *
 * - Utan vald bildtyp: Oplacerad (men Klar om den har en giltig hemvist sedan tidigare).
 * - Med vald bildtyp men utan det som krävs: Delvis klar.
 * - Med det som krävs: Klar. Titel, beskrivning, taggar och exakt position
 *   krävs aldrig — klassificeringen ska inte bli administrativ.
 */
export function deriveImageStatus(
  image: StatusImage,
  links: StatusLink[],
  hasObservation = false,
): ImageStatus {
  const kind = (image.media_kind ?? null) as MediaKind | null;
  const store = has(links, "store") || image.entity_type === "store";

  if (!kind) {
    // Äldre bilder utan bildtyp: hemvisten avgör, aldrig gissningar.
    if (links.length > 0 || image.entity_id) return "classified";
    return "unclassified";
  }

  switch (kind) {
    case "area":
      if (has(links, "zone")) return "classified";
      return store || has(links, "location") ? "partial" : "unclassified";
    case "resource":
      return has(links, "resource") ? "classified" : store ? "partial" : "unclassified";
    case "product":
      return has(links, "product") ? "classified" : store ? "partial" : "unclassified";
    case "task":
      return has(links, "task") || has(links, "task_template")
        ? "classified"
        : store
          ? "partial"
          : "unclassified";
    case "observation":
      if (hasObservation && (store || has(links, "zone"))) return "classified";
      return hasObservation || store ? "partial" : "unclassified";
    case "other":
      return store || links.length > 0 ? "classified" : "unclassified";
    default:
      return "unclassified";
  }
}
