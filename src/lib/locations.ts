import { supabase } from "@/integrations/supabase/client";

/**
 * Lagerplatser slås upp på nivå (location_type) och enhet, aldrig på namn.
 *
 * Namnen är inte unika och den gamla strukturen är inaktiverad. Ett uppslag
 * som träffar en inaktiverad plats kastar fel i stället för att tyst bokföra
 * lagret på fel ställe.
 */

export type LocationLevel =
  | "inkopslager"
  | "grossistlager"
  | "tillverkningslager"
  | "leveranslager"
  | "butik";

/** Nivåerna i flödesordning från vänster till höger. */
export const LEVEL_ORDER: LocationLevel[] = [
  "inkopslager",
  "grossistlager",
  "tillverkningslager",
  "leveranslager",
  "butik",
];

export const LEVEL_LABEL: Record<LocationLevel, string> = {
  inkopslager: "Inköpslager",
  grossistlager: "Grossistlager",
  tillverkningslager: "Produktionslager",
  leveranslager: "Transportlager",
  butik: "Butik",
};

export const LEVEL_DESCRIPTION: Record<LocationLevel, string> = {
  inkopslager: "I vår ägo, ännu inte fysiskt hos oss",
  grossistlager: "Fysiskt på plats hos oss i Göteborg",
  tillverkningslager: "Planerat för produktion eller ute på externt uppdrag",
  leveranslager: "Skickat till butik, väntar på butikens godkännande",
  butik: "Butikens eget lager",
};

/**
 * Grossistlagret — en enda plats för hela grossistledet.
 * Motsvarar den tidigare "Grossist Flytande" och behåller all historik.
 */
export const GROSSIST_FLYTANDE_ID = "5da57ad6-f72c-4a84-9873-87174d194e10";

const cache = new Map<string, string>();

/** Kastar om lagerplatsen inte finns eller är inaktiverad. */
export async function assertActiveLocation(locationId: string): Promise<void> {
  const { data, error } = await supabase
    .from("storage_locations")
    .select("id, name, active")
    .eq("id", locationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Lagerplatsen finns inte.");
  if ((data as any).active === false) {
    throw new Error(
      `Lagerplatsen "${(data as any).name}" är inaktiverad i den nya lagerstrukturen — bokföringen avbröts.`,
    );
  }
}

/**
 * Aktiv huvudplats för en nivå. Enhetsbundna nivåer kräver storeId;
 * grossistlagret är gemensamt.
 */
export async function locationIdForLevel(
  level: LocationLevel,
  storeId?: string | null,
): Promise<string> {
  const key = `${level}:${storeId ?? "-"}`;
  const hit = cache.get(key);
  if (hit) return hit;

  let q = supabase
    .from("storage_locations")
    .select("id, name, store_id")
    .eq("location_type", level as any)
    .eq("active", true)
    .is("parent_location_id", null);
  if (storeId) q = q.eq("store_id", storeId);

  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as any[];
  if (rows.length === 0) {
    throw new Error(
      `Ingen aktiv ${LEVEL_LABEL[level].toLowerCase()}-plats hittades${storeId ? " för enheten" : ""}.`,
    );
  }
  if (rows.length > 1) {
    throw new Error(
      `Flera aktiva ${LEVEL_LABEL[level].toLowerCase()}-platser hittades${
        storeId ? " för enheten" : ""
      } — bokföringen avbröts för att inte hamna på fel lager.`,
    );
  }
  cache.set(key, rows[0].id);
  return rows[0].id as string;
}

/** Alla aktiva huvudplatser på en nivå, med enhet. */
export async function activeLocationsForLevel(
  level: LocationLevel,
): Promise<{ id: string; name: string; storeId: string | null }[]> {
  const { data, error } = await supabase
    .from("storage_locations")
    .select("id, name, store_id")
    .eq("location_type", level as any)
    .eq("active", true)
    .is("parent_location_id", null);
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id as string,
    name: (r.name ?? "") as string,
    storeId: (r.store_id ?? null) as string | null,
  }));
}

/**
 * Enda tillåtna vägen att slå upp en lagerplats på namn.
 *
 * Kastar fel om namnet är tvetydigt och om den enda träffen är en inaktiverad
 * plats. Ingen väg returnerar en inaktiv plats eller null tyst — det är så de
 * gamla namnuppslagen kunde peka på inaktiverade platser obemärkt.
 */
export async function locationIdByName(
  name: string,
  storeId?: string | null,
): Promise<string> {
  let q = supabase.from("storage_locations").select("id, name, active").eq("name", name);
  if (storeId) q = q.eq("store_id", storeId);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as any[];
  if (rows.length === 0) throw new Error(`Ingen lagerplats med namnet "${name}" hittades.`);
  if (rows.length > 1)
    throw new Error(
      `Namnet "${name}" matchar ${rows.length} lagerplatser — uppslaget avbröts för att inte hamna på fel lager.`,
    );
  if (rows[0].active === false)
    throw new Error(
      `Lagerplatsen "${name}" är inaktiverad i den nya lagerstrukturen — uppslaget avbröts.`,
    );
  return rows[0].id as string;
}

/** Grossistlagret (gemensamt). */
export async function grossistlagerId(): Promise<string> {
  return locationIdForLevel("grossistlager");
}

/**
 * Inköpslagret — ett enda för hela grossistledet. Allt som är köpt men ännu
 * inte flyttat in i grossistlagret. Enhetsparametern finns kvar för
 * bakåtkompatibilitet men används inte: det finns bara ett inköpslager.
 */
export async function inkopslagerId(_storeId?: string): Promise<string> {
  return locationIdForLevel("inkopslager");
}

/** Produktionslagret — ett enda för hela grossistledet. */
export async function tillverkningslagerId(_storeId?: string): Promise<string> {
  return locationIdForLevel("tillverkningslager");
}

/** Butikens leveranslager — varor lovade till just den butiken. */
export async function leveranslagerId(storeId: string): Promise<string> {
  return locationIdForLevel("leveranslager", storeId);
}

/** Butikens egen lagerplats. */
export async function butikslagerId(storeId: string): Promise<string> {
  return locationIdForLevel("butik", storeId);
}

/** Enheten som äger grossistlagret, används för inköps- och tillverkningslager. */
export async function grossistStoreId(): Promise<string> {
  const { data, error } = await supabase
    .from("storage_locations")
    .select("store_id")
    .eq("id", GROSSIST_FLYTANDE_ID)
    .maybeSingle();
  if (error) throw error;
  const storeId = (data as any)?.store_id as string | null;
  if (!storeId) throw new Error("Grossistlagret saknar enhet.");
  return storeId;
}

/** Nivån och förälder för en lagerplats. */
export async function locationLevel(
  locationId: string,
): Promise<{ level: LocationLevel | null; parentId: string | null; storeId: string | null }> {
  const { data, error } = await supabase
    .from("storage_locations")
    .select("location_type, parent_location_id, store_id")
    .eq("id", locationId)
    .maybeSingle();
  if (error) throw error;
  return {
    level: ((data as any)?.location_type ?? null) as LocationLevel | null,
    parentId: ((data as any)?.parent_location_id ?? null) as string | null,
    storeId: ((data as any)?.store_id ?? null) as string | null,
  };
}

/** Kort förklaring av varför en nivå är tom och vad som fyller den. */
export const LEVEL_EMPTY_HINT: Record<LocationLevel, string> = {
  inkopslager:
    "Inget inköpt som väntar. Nivån fylls när en följesedel bokförs i Inköpsrapportering.",
  grossistlager:
    "Inget fysiskt på plats. Nivån fylls när en ankomst registreras från inköpslagret.",
  tillverkningslager:
    "Inget planerat för produktion. Nivån fylls när råvara flyttas till Filé/Tillverkning.",
  leveranslager:
    "Inget under transport. Nivån fylls när en order ändras från packad till skickad.",
  butik: "Butikens lager är tomt. Nivån fylls när butiken godkänner en inleverans.",
};

/** Vem som äger en nivå när användaren bara får se den. */
export const LEVEL_OWNER: Record<LocationLevel, string> = {
  inkopslager: "Hanteras av grossist",
  grossistlager: "Hanteras av grossist",
  tillverkningslager: "Hanteras av produktion",
  leveranslager: "Hanteras av grossist",
  butik: "Hanteras av butiken",
};

/**
 * Nivåer en portal får hantera. Övriga nivåer visas med saldo men låsta —
 * se men inte röra, så ingen beställer vara som redan är uppbokad.
 */
/**
 * Nivåer en portal överhuvudtaget får se. Butiken ser bara sitt eget
 * transportlager och sitt butikslager — grossistleden är inte butikens sak.
 */
export function visibleLevels(site: string | null | undefined): LocationLevel[] {
  if (site === "shop") return ["leveranslager", "butik"];
  return [...LEVEL_ORDER];
}

export function manageableLevels(site: string | null | undefined): LocationLevel[] {
  // site: "wholesale" = Admin, "production" = Grossist, "shop" = Butik.
  if (site === "wholesale") return [...LEVEL_ORDER];
  // Grossisten ser och hanterar hela kedjan, även butikslagren.
  if (site === "production") return [...LEVEL_ORDER];
  // Butiksportal: butiken hanterar sitt eget lager och tar emot leveranser.
  return ["leveranslager", "butik"];
}
