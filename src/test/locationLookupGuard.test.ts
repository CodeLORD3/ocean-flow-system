import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * SPÄRR: lagerplatser slås upp på nivå (location_type), aldrig på namn.
 *
 * Namnen är inte unika och den gamla strukturen är inaktiverad. Två gånger har
 * ett namnuppslag orsakat ett tyst fel: först maybeSingle mot "Grossist
 * Flytande" när sex platser hade samma namn, sedan tre filer som letade efter
 * inaktiverade "Pre-%", "Raw-%" och "Transportlager".
 *
 * Det enda stället som får slå upp en plats på namn är src/lib/locations.ts,
 * där locationIdByName kastar fel både vid tvetydigt namn och vid inaktiv
 * träff. Undantagslistan startar tom och får bara krympa.
 */
const ALLOWED_NAME_LOOKUPS: string[] = [];

/** Filen som äger alla uppslag mot storage_locations. */
const OWNER = "src/lib/locations.ts";

/** Namnfilter i ett Supabase-anrop: .eq("name", .ilike("name", .in("name", .like("name", .or("name.eq... */
const NAME_FILTER =
  /\.(eq|neq|ilike|like|in|not)\s*\(\s*["']name["']|\.or\s*\(\s*["'][^"']*\bname\.(eq|ilike|like|in)/;

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) acc.push(full);
  }
  return acc;
}

/** Filer där ett anrop mot storage_locations filtrerar på name. */
function findNameLookups(): string[] {
  const offenders: string[] = [];
  for (const file of walk("src")) {
    const rel = file.replace(/\\/g, "/");
    if (rel === OWNER) continue;
    if (rel === "src/integrations/supabase/types.ts") continue;
    const text = readFileSync(file, "utf8");
    if (!text.includes("storage_locations")) continue;

    const lines = text.split("\n");
    let hit = false;
    lines.forEach((line, i) => {
      if (!line.includes("storage_locations")) return;
      // Filtret står i den kedjade frågan strax efter tabellnamnet
      const window = lines.slice(i, i + 8).join("\n");
      if (NAME_FILTER.test(window)) hit = true;
    });
    if (hit) offenders.push(rel);
  }
  return offenders;
}

describe("lagerplatser slås upp på nivå, inte på namn", () => {
  it("ingen fil utanför locations.ts slår upp en lagerplats på namn", () => {
    const offenders = findNameLookups().filter((f) => !ALLOWED_NAME_LOOKUPS.includes(f));
    expect(
      offenders,
      `Använd locationIdForLevel/activeLocationsForLevel i src/lib/locations.ts istället: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("undantagslistan innehåller inga inaktuella poster", () => {
    const offenders = findNameLookups();
    const stale = ALLOWED_NAME_LOOKUPS.filter((f) => !offenders.includes(f));
    expect(stale, `Ta bort ur ALLOWED_NAME_LOOKUPS: ${stale.join(", ")}`).toEqual([]);
  });

  it("locationIdByName kastar vid tvetydigt namn och vid inaktiv träff", () => {
    const text = readFileSync(OWNER, "utf8");
    expect(text).toContain("export async function locationIdByName");
    // Båda spärrarna måste finnas kvar i funktionen
    expect(text).toMatch(/matchar \$\{rows\.length\} lagerplatser/);
    expect(text).toMatch(/rows\[0\]\.active === false/);
  });

  it("de tre tidigare hålen är stängda", () => {
    const closed: Record<string, RegExp[]> = {
      "src/pages/Receiving.tsx": [/ilike\("name", "Raw-/],
      "src/lib/orderStatusSync.ts": [/like\("name", "Pre-/, /startsWith\("pre-"\)/],
      "src/pages/Inventory.tsx": [/name === "Transportlager"/, /startsWith\("raw-"\)/],
    };
    for (const [file, patterns] of Object.entries(closed)) {
      const text = readFileSync(file, "utf8");
      for (const p of patterns) {
        expect(p.test(text), `${file} innehåller fortfarande ${p}`).toBe(false);
      }
    }
  });
});
