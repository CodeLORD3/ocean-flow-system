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
  tillverkningslager: "Tillverkningslager",
  leveranslager: "Leveranslager",
  butik: "Butik",
};

export const LEVEL_DESCRIPTION: Record<LocationLevel, string> = {
  inkopslager: "I vår ägo, ännu inte fysiskt hos oss",
  grossistlager: "Fysiskt på plats hos oss i Göteborg",
  tillverkningslager: "Planerat för produktion eller ute på externt uppdrag",
  leveranslager: "Bokat till butik, ännu inte mottaget",
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

/** Grossistlagret (gemensamt). */
export async function grossistlagerId(): Promise<string> {
  return locationIdForLevel("grossistlager");
}

/** Enhetens inköpslager — allt som är köpt men ännu inte hos oss. */
export async function inkopslagerId(storeId: string): Promise<string> {
  return locationIdForLevel("inkopslager", storeId);
}

/** Enhetens tillverkningslager. */
export async function tillverkningslagerId(storeId: string): Promise<string> {
  return locationIdForLevel("tillverkningslager", storeId);
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
