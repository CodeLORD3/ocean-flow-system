/**
 * Enhetstyper. Produktion, admin och overhead har ingen försäljning:
 * inga kassa-/försäljningsytor och aldrig med i försäljningsjämförelser.
 */
export type UnitType = "butik" | "grossist" | "overhead" | "produktion" | "admin";

const NON_SALES: string[] = ["produktion", "admin", "overhead"];

export function unitHasSales(store: { unit_type?: string | null } | null | undefined): boolean {
  if (!store) return true;
  return !NON_SALES.includes(String(store.unit_type ?? "butik"));
}
