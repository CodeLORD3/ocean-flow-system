/**
 * Genvägar från en uppgift till det ställe där arbetet faktiskt görs:
 * dagsrapporten, en checklista, egenkontrollen, produktionsrecepten och så
 * vidare. En uppgift kan också peka på ett recept — då går genvägen dit.
 */
export const TASK_LINKS: { url: string; label: string }[] = [
  { url: "/dagsrapport", label: "Dagsrapporten" },
  { url: "/checklist", label: "Dagens checklista" },
  { url: "/food-safety", label: "Egenkontroll" },
  { url: "/customer-orders", label: "Kundbeställningar" },
  { url: "/orders", label: "Beställningar" },
  { url: "/inventory", label: "Lager" },
  { url: "/receiving", label: "Inleveranser" },
  { url: "/produktion-recept", label: "Produktion — recept" },
  { url: "/reports", label: "Rapporter" },
  { url: "/butikskarta", label: "Butikskartan" },
  { url: "/schedule", label: "Kalender" },
];

export function taskLinkLabel(url: string): string {
  return TASK_LINKS.find((l) => l.url === url)?.label ?? url;
}

type LinkableTask = { link_url?: string | null; recipe_id?: string | null };

/** Vart uppgiften leder vidare — recept först, annars vald genväg. */
export function taskTarget(task: LinkableTask, recipeName?: string | null) {
  if (task.recipe_id) {
    return {
      url: `/produktion-recept?recept=${task.recipe_id}`,
      label: recipeName ? `Så gör du ${recipeName}` : "Recept och arbetsgång",
    };
  }
  if (task.link_url) return { url: task.link_url, label: `Öppna ${taskLinkLabel(task.link_url)}` };
  return null;
}
