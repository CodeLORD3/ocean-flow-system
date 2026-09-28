import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/** Varnar när butiken har öppna dagar enligt öppettiderna men noll timmar. */
export function ZeroHoursWarning({ storeId, weekStart, weekEnd }: { storeId: string; weekStart: string; weekEnd: string }) {
  const { data } = useQuery({
    queryKey: ["weekly-open-days", weekStart, weekEnd],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("weekly_open_days_count" as never, { _from: weekStart, _to: weekEnd } as never);
      if (error) throw error;
      return (data ?? []) as unknown as { store_id: string; open_days: number }[];
    },
    staleTime: 5 * 60_000,
  });
  const open = data?.find((r) => r.store_id === storeId)?.open_days ?? 0;
  if (open <= 0) return null;
  return (
    <p className="mt-2 flex items-center gap-1 text-[11px] text-destructive">
      <AlertTriangle className="h-3 w-3" />
      {open} öppna dagar enligt öppettiderna men 0 timmar registrerade.
    </p>
  );
}
