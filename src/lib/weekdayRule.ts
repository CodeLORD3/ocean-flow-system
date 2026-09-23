/**
 * Veckodagar i scheman anges i ISO: måndag = 1, söndag = 7.
 * Gamla `checklist_templates.weekdays` använde 0 för söndag.
 * Gamla `checklist_template_items.weekdays` var redan ISO.
 */

export type ScheduleRule =
  | { type: "daily" }
  | { type: "weekdays"; days: number[] };

/** Räknar om en gammal mall-lista (0 = söndag) till ISO 1 till 7. */
export function legacyTemplateWeekdaysToIso(weekdays: number[] | null | undefined): number[] {
  if (!weekdays || weekdays.length === 0) return [];
  const iso = weekdays.map((d) => (d === 0 ? 7 : d)).filter((d) => d >= 1 && d <= 7);
  return [...new Set(iso)].sort((a, b) => a - b);
}

/** Uppgiftsrader lagrade redan ISO. Rensar bara dubbletter och ogiltiga värden. */
export function itemWeekdaysToIso(weekdays: number[] | null | undefined): number[] {
  if (!weekdays || weekdays.length === 0) return [];
  const iso = weekdays.filter((d) => d >= 1 && d <= 7);
  return [...new Set(iso)].sort((a, b) => a - b);
}

/**
 * Regeln för en standarduppgift. Företräde: radens egna dagar, annars mallens
 * dagar (0 räknas om till 7), annars dagligen.
 */
export function ruleForTemplateItem(
  itemWeekdays: number[] | null | undefined,
  templateWeekdays: number[] | null | undefined,
): ScheduleRule {
  const own = itemWeekdaysToIso(itemWeekdays);
  if (own.length > 0) return { type: "weekdays", days: own };
  const fromTemplate = legacyTemplateWeekdaysToIso(templateWeekdays);
  if (fromTemplate.length > 0) return { type: "weekdays", days: fromTemplate };
  return { type: "daily" };
}

/** Regeln för en mall. */
export function ruleForTemplate(templateWeekdays: number[] | null | undefined): ScheduleRule {
  const days = legacyTemplateWeekdaysToIso(templateWeekdays);
  return days.length > 0 ? { type: "weekdays", days } : { type: "daily" };
}
