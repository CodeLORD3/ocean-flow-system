import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Landet för butikens bolag ("SE" eller "CH"). Används bland annat för att
 * räkna såser i burkar i Schweiz.
 */
export function useStoreCountry(storeId?: string | null) {
  const { data } = useQuery({
    queryKey: ["store-country", storeId],
    enabled: !!storeId,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<string | null> => {
      const { data: store } = await supabase
        .from("stores")
        .select("country, legal_entity_id")
        .eq("id", storeId!)
        .maybeSingle();
      if (!store) return null;
      const entityId = (store as any).legal_entity_id as string | null;
      if (entityId) {
        const { data: entity } = await supabase
          .from("legal_entities")
          .select("country")
          .eq("legal_entity_id", entityId)
          .maybeSingle();
        const c = ((entity as any)?.country || "").trim().toUpperCase();
        if (c) return c;
      }
      return ((store as any).country || "").trim().toUpperCase() || null;
    },
  });
  return data ?? null;
}
