import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { OpeningHourRow } from "@/lib/liveStaff";

export const WEEKDAY_LABELS = ["Söndag", "Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag"];
export const WEEKDAY_SHORT = ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"];
/** Veckan börjar på måndag i UI:t, men weekday följer JS (0 = söndag). */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export interface OpeningHourRecord extends OpeningHourRow {
  id: string;
}

/** Strukturerade öppettider per veckodag — alla butiker, eller en enskild. */
export function useStoreOpeningHours(storeId?: string | null) {
  return useQuery({
    queryKey: ["store-opening-hours", storeId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("store_opening_hours")
        .select("id, store_id, weekday, open_time, close_time, closed");
      if (storeId) q = q.eq("store_id", storeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as OpeningHourRecord[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export interface OpeningHourInput {
  weekday: number;
  open_time: string | null;
  close_time: string | null;
  closed: boolean;
}

/** Sparar hela veckan för en butik i ett anrop. */
export function useSaveOpeningHours() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ storeId, week }: { storeId: string; week: OpeningHourInput[] }) => {
      const rows = week.map((w) => ({
        store_id: storeId,
        weekday: w.weekday,
        closed: w.closed,
        open_time: w.closed ? null : w.open_time || null,
        close_time: w.closed ? null : w.close_time || null,
      }));
      const { error } = await supabase
        .from("store_opening_hours")
        .upsert(rows, { onConflict: "store_id,weekday" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store-opening-hours"] });
    },
  });
}
