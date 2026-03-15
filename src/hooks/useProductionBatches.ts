import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/hooks/useActivityLog";

export function useProductionBatches(date?: string) {
  return useQuery({
    queryKey: ["production_batches", date],
    queryFn: async () => {
      let q = supabase.from("production_batches").select("*, products(name)").order("start_time");
      if (date) q = q.eq("planned_date", date);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      product_id: string;
      description?: string;
      quantity: number;
      planned_date: string;
      start_time?: string;
      end_time?: string;
      operator?: string;
    }) => {
      const { count } = await supabase.from("production_batches").select("*", { count: "exact", head: true });
      const num = (count || 0) + 1;
      const batchNumber = `PROD-${params.planned_date.replace(/-/g, "")}-${String.fromCharCode(64 + num)}`;
      
      const { data, error } = await supabase.from("production_batches").insert({
        batch_number: batchNumber,
        ...params,
      }).select().single();
      if (error) throw error;
      await logActivity({
        action_type: "create",
        description: `Produktionsbatch skapad: ${batchNumber}`,
        portal: "production",
        entity_type: "production_batch",
        entity_id: data.id,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["production_batches"] }),
  });
}

export function useUpdateBatchStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; status: string; waste_kg?: number }) => {
      const { error } = await supabase.from("production_batches").update(params).eq("id", params.id);
      if (error) throw error;
      await logActivity({
        action_type: "status_change",
        description: `Produktionsbatch status ändrad till: ${params.status}`,
        portal: "production",
        entity_type: "production_batch",
        entity_id: params.id,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["production_batches"] }),
  });
}
