import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/hooks/useActivityLog";

export type InventoryLine = {
  product_id: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total: number;
};

export type CostLine = {
  label: string;
  amount: number;
  sort_order: number;
};

export type SalesLine = {
  channel: string;
  quantity: number;
  amount: number;
  last_year_amount?: number;
  sort_order: number;
};

export type SocialLine = {
  platform: string;
  opening_followers: number;
  closing_followers: number;
  follower_change: number;
  posts_count: number;
  sort_order: number;
};

export const DEFAULT_COST_LABELS = [
  "Inköp",
  "Bröd & Övrigt",
  "Svinn",
  "Kredit",
  "Transport",
] as const;

export const DEFAULT_SALES_CHANNELS = [
  "Events & Extra",
  "Försäljning Externt",
  "Sales Sumup",
  "Twint",
  "Shopify",
] as const;

export const DEFAULT_SOCIAL_PLATFORMS = [
  "Instagram",
  "Facebook",
  "YouTube",
  "LinkedIn",
  "TikTok",
] as const;

export function useWeeklyReportsList(storeId: string | null) {
  return useQuery({
    queryKey: ["weekly_reports", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_reports")
        .select("*")
        .eq("store_id", storeId!)
        .order("year", { ascending: false })
        .order("week_number", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useWeeklyReportDetail(reportId: string | null) {
  return useQuery({
    queryKey: ["weekly_report_detail", reportId],
    enabled: !!reportId,
    queryFn: async () => {
      const [reportRes, invRes, costRes, salesRes, socialRes] = await Promise.all([
        supabase.from("weekly_reports").select("*").eq("id", reportId!).single(),
        supabase.from("weekly_report_inventory_lines").select("*").eq("report_id", reportId!),
        supabase.from("weekly_report_cost_lines").select("*").eq("report_id", reportId!).order("sort_order"),
        supabase.from("weekly_report_sales_lines").select("*").eq("report_id", reportId!).order("sort_order"),
        supabase.from("weekly_report_social_lines").select("*").eq("report_id", reportId!).order("sort_order"),
      ]);
      if (reportRes.error) throw reportRes.error;
      return {
        report: reportRes.data,
        inventoryLines: invRes.data || [],
        costLines: costRes.data || [],
        salesLines: salesRes.data || [],
        socialLines: socialRes.data || [],
      };
    },
  });
}

export function usePreviousReport(storeId: string | null, year: number, week: number) {
  return useQuery({
    queryKey: ["previous_weekly_report", storeId, year, week],
    enabled: !!storeId,
    queryFn: async () => {
      // Get reports before this week
      const { data } = await supabase
        .from("weekly_reports")
        .select("*")
        .eq("store_id", storeId!)
        .or(`year.lt.${year},and(year.eq.${year},week_number.lt.${week})`)
        .order("year", { ascending: false })
        .order("week_number", { ascending: false })
        .limit(1);
      if (!data || data.length === 0) return null;
      
      // Also get its social lines
      const { data: socialLines } = await supabase
        .from("weekly_report_social_lines")
        .select("*")
        .eq("report_id", data[0].id);
      
      return { report: data[0], socialLines: socialLines || [] };
    },
  });
}

export function useCreateWeeklyReportFull() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      store_id: string;
      year: number;
      week_number: number;
      status: string;
      opening_inventory: number;
      closing_inventory: number;
      inventory_change: number;
      total_costs: number;
      total_sales: number;
      gross_margin: number;
      gross_margin_pct: number;
      notes?: string;
      inventoryLines: InventoryLine[];
      costLines: CostLine[];
      salesLines: SalesLine[];
      socialLines: SocialLine[];
    }) => {
      const { inventoryLines, costLines, salesLines, socialLines, ...reportData } = params;
      
      const { data: report, error } = await supabase
        .from("weekly_reports")
        .insert(reportData as any)
        .select()
        .single();
      if (error) throw error;

      const reportId = report.id;

      const promises: Promise<any>[] = [];

      if (inventoryLines.length > 0) {
        promises.push(
          supabase.from("weekly_report_inventory_lines").insert(
            inventoryLines.map((l) => ({ ...l, report_id: reportId }))
          ).select().then()
        );
      }
      if (costLines.length > 0) {
        promises.push(
          supabase.from("weekly_report_cost_lines").insert(
            costLines.map((l) => ({ ...l, report_id: reportId }))
          ).select().then()
        );
      }
      if (salesLines.length > 0) {
        promises.push(
          supabase.from("weekly_report_sales_lines").insert(
            salesLines.map((l) => ({ ...l, report_id: reportId }))
          ).select().then()
        );
      }
      if (socialLines.length > 0) {
        promises.push(
          supabase.from("weekly_report_social_lines").insert(
            socialLines.map((l) => ({ ...l, report_id: reportId }))
          ).select().then()
        );
      }

      await Promise.all(promises);

      // If finalized, update stock
      if (params.status === "finalized" && inventoryLines.length > 0) {
        await syncInventoryToStock(reportId, inventoryLines);
      }

      await logActivity({
        action_type: "create",
        description: `Veckorapport skapad: V${params.week_number} ${params.year}`,
        portal: "shop",
        store_id: params.store_id,
        entity_type: "weekly_report",
        entity_id: reportId,
      });

      return report;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["weekly_reports", vars.store_id] });
    },
  });
}

export function useUpdateWeeklyReportFull() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      id: string;
      store_id: string;
      status: string;
      opening_inventory: number;
      closing_inventory: number;
      inventory_change: number;
      total_costs: number;
      total_sales: number;
      gross_margin: number;
      gross_margin_pct: number;
      notes?: string;
      inventoryLines: InventoryLine[];
      costLines: CostLine[];
      salesLines: SalesLine[];
      socialLines: SocialLine[];
    }) => {
      const { id, inventoryLines, costLines, salesLines, socialLines, store_id, ...reportData } = params;

      const { error } = await supabase
        .from("weekly_reports")
        .update({ ...reportData, updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;

      // Delete and re-insert all lines
      await Promise.all([
        supabase.from("weekly_report_inventory_lines").delete().eq("report_id", id).then(),
        supabase.from("weekly_report_cost_lines").delete().eq("report_id", id).then(),
        supabase.from("weekly_report_sales_lines").delete().eq("report_id", id).then(),
        supabase.from("weekly_report_social_lines").delete().eq("report_id", id).then(),
      ]);

      const promises: Promise<any>[] = [];
      if (inventoryLines.length > 0) {
        promises.push(supabase.from("weekly_report_inventory_lines").insert(inventoryLines.map((l) => ({ ...l, report_id: id }))).select().then());
      }
      if (costLines.length > 0) {
        promises.push(supabase.from("weekly_report_cost_lines").insert(costLines.map((l) => ({ ...l, report_id: id }))).select().then());
      }
      if (salesLines.length > 0) {
        promises.push(supabase.from("weekly_report_sales_lines").insert(salesLines.map((l) => ({ ...l, report_id: id }))).select().then());
      }
      if (socialLines.length > 0) {
        promises.push(supabase.from("weekly_report_social_lines").insert(socialLines.map((l) => ({ ...l, report_id: id }))).select().then());
      }
      await Promise.all(promises);

      if (params.status === "finalized" && inventoryLines.length > 0) {
        await syncInventoryToStock(id, inventoryLines);
      }

      await logActivity({
        action_type: "update",
        description: `Veckorapport uppdaterad`,
        portal: "shop",
        store_id: store_id,
        entity_type: "weekly_report",
        entity_id: id,
      });
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["weekly_reports", vars.store_id] });
      qc.invalidateQueries({ queryKey: ["weekly_report_detail", vars.id] });
    },
  });
}

async function syncInventoryToStock(reportId: string, lines: InventoryLine[]) {
  // Update each product's stock to the counted quantity
  for (const line of lines) {
    await supabase
      .from("products")
      .update({ stock: line.quantity, updated_at: new Date().toISOString() })
      .eq("id", line.product_id);

    await logActivity({
      action_type: "update",
      description: `Lagerkorrigering via veckorapport`,
      entity_type: "product",
      entity_id: line.product_id,
      details: { quantity: line.quantity, report_id: reportId },
    });
  }
}
