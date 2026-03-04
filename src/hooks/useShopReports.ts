import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useShopReports(storeId: string | null) {
  return useQuery({
    queryKey: ["shop_reports", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shop_reports")
        .select("*")
        .eq("store_id", storeId!)
        .order("report_month", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertShopReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      store_id: string;
      report_month: string;
      purchase: number;
      sales: number;
      opening_inventory: number;
      closing_inventory: number;
      notes?: string;
    }) => {
      const { data, error } = await supabase
        .from("shop_reports")
        .upsert(
          {
            store_id: params.store_id,
            report_month: params.report_month,
            purchase: params.purchase,
            sales: params.sales,
            opening_inventory: params.opening_inventory,
            closing_inventory: params.closing_inventory,
            notes: params.notes,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "store_id,report_month" }
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["shop_reports", vars.store_id] });
    },
  });
}
