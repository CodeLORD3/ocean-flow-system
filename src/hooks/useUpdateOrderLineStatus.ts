import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const STATUS_FLOW = ["Ny", "Behandlas", "Packad", "Skickad"] as const;

export function useUpdateOrderLineStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { lineId: string; newStatus: string; orderId: string }) => {
      // Update line status
      const { error } = await supabase
        .from("shop_order_lines")
        .update({ status: params.newStatus })
        .eq("id", params.lineId);
      if (error) throw error;

      // Recalculate parent order status
      const { data: allLines } = await supabase
        .from("shop_order_lines")
        .select("status")
        .eq("shop_order_id", params.orderId);

      if (!allLines?.length) return;

      const statuses = allLines.map((l) => l.status || "Ny");
      let newOrderStatus = "Ny";
      if (statuses.every((s) => s === "Klar / Levererad" || s === "Levererad")) {
        newOrderStatus = "Klar / Levererad";
      } else if (statuses.every((s) => s === "Skickad" || s === "Klar / Levererad")) {
        newOrderStatus = "Skickad";
      } else if (statuses.every((s) => s === "Packad" || s === "Skickad" || s === "Klar / Levererad")) {
        newOrderStatus = "Packad";
      } else if (statuses.some((s) => s === "Behandlas" || s === "Packad" || s === "Skickad" || s === "Klar / Levererad")) {
        newOrderStatus = "Behandlas";
      }

      await supabase
        .from("shop_orders")
        .update({ status: newOrderStatus })
        .eq("id", params.orderId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shop_orders"] });
    },
  });
}

export { STATUS_FLOW };
