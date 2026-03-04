import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const SALES_CATEGORIES = [
  "Grossistförsäljning",
  "Butiksförsäljning",
  "Onlineförsäljning",
  "Eventförsäljning",
  "Annan försäljning",
] as const;

export const PURCHASE_CATEGORIES = [
  "Grossist",
  "Extern leverantör",
  "Frukt & Grönt",
  "Emballage",
  "Förbrukningsmaterial",
  "Annat inköp",
] as const;

export type ReportLine = {
  line_type: "sale" | "purchase";
  category: string;
  amount: number;
  notes?: string;
};

export function useWeeklyReports(storeId: string | null) {
  return useQuery({
    queryKey: ["shop_reports", "weekly", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shop_reports")
        .select("*, shop_report_lines(*)")
        .eq("store_id", storeId!)
        .eq("report_type", "weekly")
        .order("year", { ascending: false })
        .order("week_number", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useMonthlyAggregation(storeId: string | null, year: number, weeks: number[]) {
  return useQuery({
    queryKey: ["shop_reports", "monthly_agg", storeId, year, weeks],
    enabled: !!storeId && weeks.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shop_reports")
        .select("*, shop_report_lines(*)")
        .eq("store_id", storeId!)
        .eq("report_type", "weekly")
        .eq("year", year)
        .in("week_number", weeks);
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateWeeklyReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      store_id: string;
      year: number;
      week_number: number;
      opening_inventory: number;
      closing_inventory: number;
      notes?: string;
      lines: ReportLine[];
    }) => {
      const { data: report, error } = await supabase
        .from("shop_reports")
        .insert({
          store_id: params.store_id,
          report_type: "weekly",
          year: params.year,
          week_number: params.week_number,
          opening_inventory: params.opening_inventory,
          closing_inventory: params.closing_inventory,
          notes: params.notes,
        })
        .select()
        .single();
      if (error) throw error;

      if (params.lines.length > 0) {
        const lines = params.lines
          .filter((l) => l.amount > 0)
          .map((l) => ({
            report_id: report.id,
            line_type: l.line_type,
            category: l.category,
            amount: l.amount,
            notes: l.notes,
          }));
        if (lines.length > 0) {
          const { error: lineErr } = await supabase.from("shop_report_lines").insert(lines);
          if (lineErr) throw lineErr;
        }
      }

      return report;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["shop_reports", "weekly", vars.store_id] });
    },
  });
}

export function useUpdateWeeklyReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      id: string;
      store_id: string;
      opening_inventory: number;
      closing_inventory: number;
      notes?: string;
      lines: ReportLine[];
    }) => {
      const { error } = await supabase
        .from("shop_reports")
        .update({
          opening_inventory: params.opening_inventory,
          closing_inventory: params.closing_inventory,
          notes: params.notes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", params.id);
      if (error) throw error;

      // Delete old lines and re-insert
      await supabase.from("shop_report_lines").delete().eq("report_id", params.id);

      const lines = params.lines
        .filter((l) => l.amount > 0)
        .map((l) => ({
          report_id: params.id,
          line_type: l.line_type,
          category: l.category,
          amount: l.amount,
          notes: l.notes,
        }));
      if (lines.length > 0) {
        const { error: lineErr } = await supabase.from("shop_report_lines").insert(lines);
        if (lineErr) throw lineErr;
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["shop_reports", "weekly", vars.store_id] });
    },
  });
}
