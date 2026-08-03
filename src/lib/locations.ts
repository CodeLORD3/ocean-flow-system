import { supabase } from "@/integrations/supabase/client";

/**
 * Lagerplatser slås alltid upp på id, aldrig på namn.
 *
 * Namnen är inte unika: det finns sex lagerplatser som heter "Grossist
 * Flytande" (en per butik) och flera "Försäljningslager", "Kyllager" och
 * "Raw Lager". En namnuppslagning med limit(1) träffar därför en slumpmässig
 * plats och bokför lagret på fel ställe utan att något syns.
 */

/** Grossist Flytande — grossistens flytande lager för råvara och detaljer. */
export const GROSSIST_FLYTANDE_ID = "5da57ad6-f72c-4a84-9873-87174d194e10";

/** Transportlager — gemensamt lager för varor på väg till butik. */
export const TRANSPORTLAGER_ID = "b45d35d9-6a40-4c0e-80c4-6ce97c017c43";

/**
 * Uppslag på namn för de fall där id inte kan hårdkodas (butiksspecifika
 * Raw-/Pre-lager). Kastar om namnet inte är unikt inom sitt scope, så att en
 * tvetydighet blir ett synligt fel i stället för en tyst felbokning.
 */
export async function uniqueLocationIdByName(
  namePattern: string,
  storeId?: string | null,
): Promise<string | null> {
  let q = supabase.from("storage_locations").select("id, name").ilike("name", namePattern);
  if (storeId) q = q.eq("store_id", storeId);
  const { data, error } = await q;
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return null;
  if (rows.length > 1) {
    throw new Error(
      `Lagerplatsen "${namePattern}" är inte unik (${rows.length} träffar)${
        storeId ? " för butiken" : ""
      } — bokföringen avbröts för att inte hamna på fel lager.`,
    );
  }
  return (rows[0] as any).id as string;
}
