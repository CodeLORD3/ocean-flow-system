import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DailyReport, StaffEntry } from "@/hooks/useDailyReport";

/** Timmar ur dagsrapportens personalrader (hanterar pass över midnatt). */
export function entryHours(entries: StaffEntry[] | null | undefined) {
  return (entries ?? []).reduce((sum, e) => {
    const [sh, sm] = String(e.start ?? "").split(":").map(Number);
    const [eh, em] = String(e.end ?? "").split(":").map(Number);
    if ([sh, sm, eh, em].some((v) => Number.isNaN(v))) return sum;
    let minutes = eh * 60 + em - (sh * 60 + sm);
    if (minutes < 0) minutes += 1440;
    return sum + minutes / 60;
  }, 0);
}

/** Dagsrapporter för en butik inom ett datumintervall (dag för dag under veckan). */
export function useDailyReportsRange(storeId?: string | null, from?: string, to?: string) {
  return useQuery({
    queryKey: ["daily-reports", "range", storeId, from, to],
    enabled: !!storeId && !!from && !!to,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("daily_reports")
        .select("id, store_id, report_date, gross_sales, net_sales, receipt_count, staff_entries, comment")
        .eq("store_id", storeId)
        .gte("report_date", from)
        .lte("report_date", to)
        .order("report_date");
      if (error) throw error;
      return (data ?? []) as DailyReport[];
    },
  });
}
