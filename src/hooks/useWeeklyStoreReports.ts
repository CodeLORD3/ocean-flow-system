import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WeeklyStoreReport = {
  id: string;
  store_id: string;
  region: string | null;
  iso_year: number;
  iso_week: number;
  week_start: string;
  week_end: string;
  daily_reports_count: number;
  expected_open_days: number;
  status: string;
  total_sales_sek: number;
  avg_sales_per_day_sek: number;
  staff_hours: number;
  staff_shifts: number;
  locked_at: string | null;
  drift_after_lock: boolean;
  drift_note: string | null;
};

export type WeeklyRegionReport = {
  group_key: string;
  group_label: string;
  iso_year: number;
  iso_week: number;
  week_start: string;
  week_end: string;
  total_sales_sek: number;
  avg_sales_per_day_sek: number;
  staff_hours: number;
  staff_shifts: number;
  daily_reports_count: number;
  expected_open_days: number;
  status: string;
  missing_stores: string[] | null;
  prev_total_sales_sek: number | null;
  diff_kr: number | null;
  diff_procent: number | null;
};

export type WeeklyClosure = {
  id: string;
  store_id: string;
  iso_year: number;
  iso_week: number;
  reason: string | null;
};

export function useWeeklyStoreReports() {
  return useQuery({
    queryKey: ["weekly-store-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_store_reports")
        .select("*")
        .order("week_start", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WeeklyStoreReport[];
    },
  });
}

export function useWeeklyRegionReports() {
  return useQuery({
    queryKey: ["weekly-region-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_region_reports")
        .select("*")
        .order("week_start", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WeeklyRegionReport[];
    },
  });
}

export function useWeeklyClosures() {
  return useQuery({
    queryKey: ["weekly-store-closures"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_store_report_closures")
        .select("id, store_id, iso_year, iso_week, reason");
      if (error) throw error;
      return (data ?? []) as WeeklyClosure[];
    },
  });
}

/** Markerar eller avmarkerar en butik som stängd en enskild ISO-vecka. */
export function useToggleWeeklyClosure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      store_id: string;
      iso_year: number;
      iso_week: number;
      closed: boolean;
      reason?: string;
    }) => {
      if (input.closed) {
        const { data: session } = await supabase.auth.getUser();
        const { error } = await supabase.from("weekly_store_report_closures").insert({
          store_id: input.store_id,
          iso_year: input.iso_year,
          iso_week: input.iso_week,
          reason: input.reason ?? null,
          closed_by: session.user?.id ?? null,
        });
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("weekly_store_report_closures")
        .delete()
        .eq("store_id", input.store_id)
        .eq("iso_year", input.iso_year)
        .eq("iso_week", input.iso_week);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["weekly-store-reports"] });
      qc.invalidateQueries({ queryKey: ["weekly-region-reports"] });
      qc.invalidateQueries({ queryKey: ["weekly-store-closures"] });
    },
  });
}
