/**
 * Vilka butiker som räknas ihop i en lista: en butik, en region eller hela
 * organisationen. Regionen följer bolaget, så Göteborg, Stockholm och
 * Schweiz kan summeras utan att butikerna behöver märkas upp separat.
 */
export type ScopeStore = {
  id: string;
  name: string;
  city: string | null;
  legal_entity_id: string | null;
};

export const RESOURCE_REGIONS = [
  { key: "gbg", label: "Göteborg", entity: "fsab-se" },
  { key: "sthlm", label: "Stockholm", entity: "de-no1" },
  { key: "ch", label: "Schweiz", entity: "fsab-ch" },
] as const;

export type ScopeValue = string; // "butik:<id>" | "region:<key>" | "allt"

export function scopeLabel(scope: ScopeValue, stores: ScopeStore[]) {
  if (scope === "allt") return "Hela organisationen";
  if (scope.startsWith("region:")) {
    const key = scope.slice(7);
    return RESOURCE_REGIONS.find((r) => r.key === key)?.label ?? "Region";
  }
  const id = scope.replace("butik:", "");
  return stores.find((s) => s.id === id)?.name ?? "Butik";
}

/** Butikerna som ingår i vald nivå. */
export function storesInScope(scope: ScopeValue, stores: ScopeStore[]): ScopeStore[] {
  if (scope === "allt") return stores;
  if (scope.startsWith("region:")) {
    const region = RESOURCE_REGIONS.find((r) => r.key === scope.slice(7));
    return region ? stores.filter((s) => s.legal_entity_id === region.entity) : [];
  }
  const id = scope.replace("butik:", "");
  return stores.filter((s) => s.id === id);
}
