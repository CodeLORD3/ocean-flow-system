import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MonthlyStoreReport = {
  store_id: string;
  store_name: string;
  region: string | null;
  active: boolean;
  year: number;
  month: number;
  month_start: string;
  month_end: string;
  total_sales_sek: number;
  avg_sales_per_day_sek: number;
  staff_hours: number;
  staff_shifts: number;
  daily_reports_count: number;
  expected_open_days: number;
  corrected: boolean;
  status: string;
};

export type MonthlyRegionReport = {
  group_key: string;
  group_label: string;
  year: number;
  month: number;
  month_start: string;
  month_end: string;
  total_sales_sek: number;
  avg_sales_per_day_sek: number;
  staff_hours: number;
  staff_shifts: number;
  daily_reports_count: number;
  expected_open_days: number;
  corrected: boolean;
  status: string;
  missing_stores: string[] | null;
  prev_total_sales_sek: number | null;
  diff_kr: number | null;
  diff_procent: number | null;
};

export function useMonthlyStoreReports() {
  return useQuery({
    queryKey: ["monthly-store-reports"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("monthly_store_reports")
        .select("*")
        .order("month_start", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MonthlyStoreReport[];
    },
  });
}

export function useMonthlyRegionReports() {
  return useQuery({
    queryKey: ["monthly-region-reports"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("monthly_region_reports")
        .select("*")
        .order("month_start", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MonthlyRegionReport[];
    },
  });
}

export type DailyReportEdit = {
  id: string;
  report_id: string;
  store_id: string;
  report_date: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  changed_at: string;
};

export const EDIT_FIELD_LABELS: Record<string, string> = {
  gross_sales: "Bruttoförsäljning",
  net_sales: "Nettoförsäljning",
  receipt_count: "Antal kvitton",
  largest_sale: "Största köp",
  staff_entries: "Bemanning",
  staff_notes: "Bemanningsanteckning",
  waste_items: "Svinn",
  comment: "Kommentar",
};

/** Ändringslogg för en enskild dagsrapport. */
export function useDailyReportEdits(reportId?: string | null) {
  return useQuery({
    queryKey: ["daily-report-edits", reportId],
    enabled: !!reportId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("daily_report_edits")
        .select("*")
        .eq("report_id", reportId)
        .order("changed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DailyReportEdit[];
    },
  });
}

/** Alla ändringar, används för att markera korrigerade dagar i listan. */
export function useAllDailyReportEdits() {
  return useQuery({
    queryKey: ["daily-report-edits", "all"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("daily_report_edits")
        .select("id, report_id, store_id, report_date, field, changed_at")
        .order("changed_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as DailyReportEdit[];
    },
  });
}
