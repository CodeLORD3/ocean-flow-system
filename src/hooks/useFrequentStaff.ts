import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Vem jobbar oftast på en enhet? Räknar pass per person de senaste 12 veckorna
 * och används som snabbval när man lägger till personer i schemaveckan.
 */
export function useFrequentStaff(storeId: string | null, weeks = 12) {
  return useQuery({
    queryKey: ["frequent-staff", storeId, weeks],
    enabled: !!storeId,
    queryFn: async () => {
      const from = new Date();
      from.setDate(from.getDate() - weeks * 7);
      const { data, error } = await supabase
        .from("shifts")
        .select("employee_id, status")
        .eq("store_id", storeId!)
        .gte("date", from.toISOString().slice(0, 10));
      if (error) throw error;
      const counts = new Map<string, number>();
      for (const row of data ?? []) {
        const id = (row as { employee_id: string | null }).employee_id;
        if (!id || (row as { status?: string }).status === "cancelled") continue;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      return Array.from(counts.entries())
        .map(([employee_id, shifts]) => ({ employee_id, shifts }))
        .sort((a, b) => b.shifts - a.shifts);
    },
  });
}
