import type { MapZone } from "@/hooks/useStoreMap";

/**
 * Ytor kan ligga inuti ytor. Här räknas släktskapet ut: vilka ytor som ligger
 * direkt inuti en yta, hela vägen in från butiken, och vilka taggar som finns.
 * Taggar är fritext som personalen sätter själv — inga fasta kategorier.
 */

/** Taggar skrivs alltid ned i små bokstäver utan extra blanksteg. */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Ytans egna taggar, alltid som en lista. */
export function tagsOf(zone?: MapZone | null): string[] {
  return (zone?.tags ?? []).filter(Boolean);
}

/** Ytorna som ligger direkt inuti den angivna ytan (tom = direkt i butiken). */
export function childZones(zones: MapZone[], parentId: string | null): MapZone[] {
  return zones.filter((z) => (z.parent_zone_id ?? null) === parentId);
}

/** Alla ytor längre in, i alla nivåer. */
export function descendantZones(zones: MapZone[], parentId: string): MapZone[] {
  const out: MapZone[] = [];
  const walk = (id: string) => {
    childZones(zones, id).forEach((c) => {
      out.push(c);
      walk(c.id);
    });
  };
  walk(parentId);
  return out;
}

/** Vägen in till ytan: butiken → yta → underyta. Ytan själv ligger sist. */
export function zonePath(zones: MapZone[], zoneId: string | null): MapZone[] {
  const path: MapZone[] = [];
  let current = zoneId ? zones.find((z) => z.id === zoneId) ?? null : null;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parent_zone_id ? zones.find((z) => z.id === current!.parent_zone_id) ?? null : null;
  }
  return path;
}

/** Alla taggar som används, med antal ytor per tagg, vanligast först. */
export function tagCounts(zones: MapZone[]): { tag: string; count: number }[] {
  const m = new Map<string, number>();
  zones.forEach((z) => tagsOf(z).forEach((t) => m.set(t, (m.get(t) ?? 0) + 1)));
  return [...m.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "sv"));
}

/** Söker på namn och tagg — samma sökruta för båda. */
export function zoneMatches(zone: MapZone, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return zone.name.toLowerCase().includes(q) || tagsOf(zone).some((t) => t.includes(q));
}
