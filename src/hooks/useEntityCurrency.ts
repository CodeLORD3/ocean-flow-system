import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSite } from "@/contexts/SiteContext";
import { getStoreCurrency } from "@/lib/currency";

/**
 * Bolagets valuta för den butik man arbetar i. Componia AG (Zollikon, Morges)
 * → CHF, svenska bolag → SEK. Alla vyer (lager, försäljning, löner, rapporter)
 * ska visa den här valutan; bara inköp från leverantörer med annan valuta
 * visar ursprungsvalutan som primär.
 */
export function useEntityCurrency() {
  const { activeStoreId } = useSite();

  const { data } = useQuery({
    queryKey: ["entity_currency", activeStoreId],
    enabled: !!activeStoreId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: store } = await supabase
        .from("stores")
        .select("id, name, city, country, currency, legal_entity_id")
        .eq("id", activeStoreId!)
        .maybeSingle();
      if (!store) return null;

      let entityCurrency: string | null = null;
      if ((store as any).legal_entity_id) {
        const { data: entity } = await supabase
          .from("legal_entities")
          .select("currency")
          .eq("legal_entity_id", (store as any).legal_entity_id)
          .maybeSingle();
        entityCurrency = ((entity as any)?.currency || "").trim().toUpperCase() || null;
      }

      return {
        currency: entityCurrency || getStoreCurrency(store as any),
        legalEntityId: (store as any).legal_entity_id as string | null,
        store,
      };
    },
  });

  return {
    currency: data?.currency ?? "SEK",
    legalEntityId: data?.legalEntityId ?? null,
    store: data?.store ?? null,
  };
}
