import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Butiksportalen får bara se sin egen spårbarhet. Här hämtas butikens
 * lagerplatser och de partier som faktiskt passerat butiken.
 * Grossist och admin skickar in null och ser allt.
 */
export function useStoreLocationIds(storeId?: string | null) {
  return useQuery({
    queryKey: ["store_location_ids", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("storage_locations")
        .select("id")
        .eq("store_id", storeId!);
      if (error) throw error;
      return (data || []).map((r: any) => r.id as string);
    },
  });
}

/** Partier som har rört sig i butikens egna lagerplatser. */
export function useStoreLotIds(storeId?: string | null) {
  const { data: locationIds = [], isLoading: locLoading } = useStoreLocationIds(storeId);
  const q = useQuery({
    queryKey: ["store_lot_ids", storeId, locationIds],
    enabled: !!storeId && !locLoading,
    queryFn: async () => {
      if (!locationIds.length) return new Set<string>();
      const { data, error } = await supabase
        .from("stock_movements")
        .select("lot_id")
        .in("location_id", locationIds)
        .not("lot_id", "is", null)
        .limit(20000);
      if (error) throw error;
      const s = new Set<string>();
      for (const r of data as any[]) if (r.lot_id) s.add(r.lot_id);
      return s;
    },
  });
  return {
    /** null = full åtkomst (ingen butiksbegränsning). */
    lotIds: storeId ? ((q.data as Set<string> | undefined) ?? null) : null,
    locationIds: storeId ? locationIds : null,
    loading: !!storeId && (locLoading || q.isLoading),
  };
}
