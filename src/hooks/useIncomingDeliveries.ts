import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/hooks/useActivityLog";

export function useIncomingDeliveries() {
  return useQuery({
    queryKey: ["incoming_deliveries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incoming_deliveries")
        .select("*, suppliers(name), incoming_delivery_lines(*, products(name))")
        .order("received_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateIncomingDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      supplier_id: string;
      received_date: string;
      received_by: string;
      notes?: string;
      lines: { product_id: string; quantity: number; unit_cost: number; batch_number?: string; best_before?: string }[];
    }) => {
      const { count } = await supabase.from("incoming_deliveries").select("*", { count: "exact", head: true });
      const num = (count || 0) + 1;
      const deliveryNumber = `IL-2026-${String(num).padStart(4, "0")}`;
      const totalWeight = params.lines.reduce((s, l) => s + l.quantity, 0);
      const totalCost = params.lines.reduce((s, l) => s + l.quantity * l.unit_cost, 0);

      const { data: del, error } = await supabase.from("incoming_deliveries").insert({
        delivery_number: deliveryNumber,
        supplier_id: params.supplier_id,
        received_date: params.received_date,
        received_by: params.received_by,
        notes: params.notes,
        total_weight: totalWeight,
        total_cost: totalCost,
      }).select().single();
      if (error) throw error;

      const lines = params.lines.map(l => ({
        delivery_id: del.id,
        product_id: l.product_id,
        quantity: l.quantity,
        unit_cost: l.unit_cost,
        batch_number: l.batch_number,
        best_before: l.best_before,
      }));
      const { error: lineErr } = await supabase.from("incoming_delivery_lines").insert(lines);
      if (lineErr) throw lineErr;

      // Increase stock for each product
      for (const line of params.lines) {
        const { data: prod } = await supabase.from("products").select("stock").eq("id", line.product_id).single();
        if (prod) {
          await supabase.from("products").update({ stock: Number(prod.stock) + line.quantity }).eq("id", line.product_id);
        }
      }

      await logActivity({
        action_type: "create",
        description: `Inleverans registrerad: ${deliveryNumber}`,
        entity_type: "incoming_delivery",
        entity_id: del.id,
      });
      return del;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incoming_deliveries"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
