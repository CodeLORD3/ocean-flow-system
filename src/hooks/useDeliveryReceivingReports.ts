import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useDeliveryReceivingReports(storeId?: string) {
  return useQuery({
    queryKey: ["delivery_receiving_reports", storeId],
    queryFn: async () => {
      let q = supabase
        .from("delivery_receiving_reports")
        .select("*")
        .order("reported_at", { ascending: false });
      if (storeId) q = q.eq("store_id", storeId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useSubmitReceivingReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reports: {
      shop_order_id: string;
      order_line_id: string;
      store_id: string;
      status: string;
      report_type?: string;
      notes?: string;
      quantity_received?: number;
      reported_by?: string;
    }[]) => {
      const { error } = await supabase
        .from("delivery_receiving_reports")
        .insert(reports);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["delivery_receiving_reports"] });
      qc.invalidateQueries({ queryKey: ["shop_orders"] });
      qc.invalidateQueries({ queryKey: ["shop-orders-shop"] });
    },
  });
}
