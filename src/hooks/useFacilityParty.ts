import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FacilityParty {
  storeName: string;
  address: string | null;
  companyName: string | null;
  orgNr: string | null;
}

/** Anläggning, bolag, org.nr och adress för en lagerplats, till följesedeln. */
export function useFacilityParty(locationId: string | null | undefined) {
  return useQuery({
    queryKey: ["facility-party", locationId],
    enabled: !!locationId,
    queryFn: async (): Promise<FacilityParty | null> => {
      const { data: loc } = await supabase
        .from("storage_locations")
        .select("store_id")
        .eq("id", locationId!)
        .maybeSingle();
      const storeId = (loc as any)?.store_id;
      if (!storeId) return null;
      const { data: store } = await supabase
        .from("stores")
        .select("name, address, legal_entity_id")
        .eq("id", storeId)
        .maybeSingle();
      if (!store) return null;
      let companyName: string | null = null;
      let orgNr: string | null = null;
      if ((store as any).legal_entity_id) {
        const { data: le } = await supabase
          .from("legal_entities")
          .select("legal_name, org_nr")
          .eq("legal_entity_id", (store as any).legal_entity_id)
          .maybeSingle();
        companyName = (le as any)?.legal_name ?? null;
        orgNr = (le as any)?.org_nr ?? null;
      }
      return {
        storeName: (store as any).name,
        address: (store as any).address ?? null,
        companyName,
        orgNr,
      };
    },
  });
}
