/**
 * Krav på en uppgift. Kan man inte bara bocka av — det som krävs måste fyllas i.
 */
export type RequirementTask = {
  requires_photo?: boolean | null;
  requires_note?: boolean | null;
  requires_value?: boolean | null;
  value_label?: string | null;
  completion_note?: string | null;
  completion_value?: number | null;
};

export type MissingRequirement = "photo" | "note" | "value";

export function valueLabel(task: RequirementTask) {
  return task.value_label?.trim() || "Värde";
}

/** Vad som saknas innan uppgiften får markeras klar. */
export function missingRequirements(
  task: RequirementTask,
  opts: { photoCount?: number; checkPhoto?: boolean } = {},
): MissingRequirement[] {
  const missing: MissingRequirement[] = [];
  if (opts.checkPhoto !== false && task.requires_photo && (opts.photoCount ?? 0) === 0) missing.push("photo");
  if (task.requires_note && !(task.completion_note ?? "").trim()) missing.push("note");
  if (task.requires_value && (task.completion_value === null || task.completion_value === undefined)) {
    missing.push("value");
  }
  return missing;
}

export function missingText(task: RequirementTask, missing: MissingRequirement[]) {
  const parts = missing.map((m) => (m === "photo" ? "bild" : m === "note" ? "kommentar" : valueLabel(task).toLowerCase()));
  return `Fyll i ${parts.join(" och ")} först.`;
}
