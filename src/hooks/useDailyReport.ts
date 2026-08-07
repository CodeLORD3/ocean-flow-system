import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type StaffEntry = {
  staff_id: string;
  start: string;
  end: string;
  deviation?: string;
  deviation_note?: string;
};
export type WasteItem = { item: string; weight_kg: number | null; value_sek: number | null; reason: string };

export type DailyReport = {
  id: string;
  store_id: string;
  report_date: string;
  gross_sales: number | null;
  net_sales: number | null;
  receipt_count: number | null;
  largest_sale: number | null;
  staff_entries: StaffEntry[];
  staff_notes: string | null;
  waste_items: WasteItem[];
  comment: string | null;
  created_by: string | null;
  created_at: string;
  updated_at?: string;
};

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatWeekdayDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const s = new Date(y, m - 1, d).toLocaleDateString("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function useDailyReport(storeId?: string | null, date = todayIso()) {
  return useQuery({
    queryKey: ["daily-report", storeId, date],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("daily_reports")
        .select("*")
        .eq("store_id", storeId)
        .eq("report_date", date)
        .maybeSingle();
      if (error) throw error;
      return (data as DailyReport | null) ?? null;
    },
  });
}

export function useSaveDailyReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<DailyReport> & { store_id: string; report_date: string }) => {
      const { data, error } = await (supabase as any)
        .from("daily_reports")
        .upsert(payload, { onConflict: "store_id,report_date" })
        .select()
        .single();
      if (error) throw error;
      return data as DailyReport;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["daily-report", vars.store_id] });
    },
  });
}
