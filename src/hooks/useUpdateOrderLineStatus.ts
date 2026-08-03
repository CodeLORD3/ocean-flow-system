import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { moveStockToTransport } from "@/lib/stockTransfer";
import { transferStock } from "@/lib/stockLedger";
import { logActivity } from "@/hooks/useActivityLog";

const STATUS_FLOW = ["Ny", "Pågående", "Packad", "Skickad"] as const;

/**
 * När en rad blir "Packad" flyttas endast DELTA-kvantiteten från
 * "Grossist Flytande" till butikens "Pre-"lager. Negativt delta flyttar tillbaka.
 * Allt bokförs via lagerrörelser — saldot skrivs aldrig direkt.
 */
async function transferDeltaToPreLocation(lineId: string, orderId: string, deltaQty: number) {
  if (deltaQty === 0) return;

  const { data: line } = await supabase
    .from("shop_order_lines")
    .select("product_id")
    .eq("id", lineId)
    .single();
  if (!line) return;

  const { data: order } = await supabase
    .from("shop_orders")
    .select("store_id, stores(name)")
    .eq("id", orderId)
    .single();
  if (!order?.store_id) return;

  const { data: gfLocs } = await supabase
    .from("storage_locations")
    .select("id")
    .ilike("name", "Grossist Flytande")
    .limit(1);
  const gfLoc = gfLocs?.[0];
  if (!gfLoc) return;

  const { data: preLocs } = await supabase
    .from("storage_locations")
    .select("id, name")
    .eq("store_id", order.store_id)
    .ilike("name", "Pre-%")
    .limit(1);
  const preLoc = preLocs?.[0];
  if (!preLoc) return;

  const absDelta = Math.abs(deltaQty);
  const from = deltaQty > 0 ? gfLoc.id : preLoc.id;
  const to = deltaQty > 0 ? preLoc.id : gfLoc.id;

  await transferStock({
    productId: line.product_id,
    fromLocationId: from,
    toLocationId: to,
    quantityKg: absDelta,
    referenceType: "shop_order",
    referenceId: orderId,
    note: deltaQty > 0 ? "Packad till Pre-lager" : "Återförd från Pre-lager",
  });
}

}

// transferFromPreLocationBack is now handled by transferDeltaToPreLocation with negative delta

export function useUpdateOrderLineStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { lineId: string; newStatus: string; orderId: string }) => {
      // Get current status and quantity_delivered before updating
      const { data: currentLine } = await supabase
        .from("shop_order_lines")
        .select("status, quantity_delivered, quantity_ordered")
        .eq("id", params.lineId)
        .single();
      const oldStatus = currentLine?.status || "";
      const oldQtyDelivered = Number(currentLine?.quantity_delivered || 0);

      // Update line status
      const { error } = await supabase
        .from("shop_order_lines")
        .update({ status: params.newStatus })
        .eq("id", params.lineId);
      if (error) throw error;

      // If moving to Packad, compute delta from previous quantity_delivered
      if (params.newStatus === "Packad") {
        // Re-read the new quantity_delivered (set by caller before this mutation)
        const { data: updatedLine } = await supabase
          .from("shop_order_lines")
          .select("quantity_delivered, quantity_ordered")
          .eq("id", params.lineId)
          .single();
        let newQtyDelivered = Number(updatedLine?.quantity_delivered || 0);
        
        // If quantity_delivered is still 0, default to quantity_ordered
        if (newQtyDelivered === 0 && updatedLine?.quantity_ordered) {
          newQtyDelivered = Number(updatedLine.quantity_ordered);
          await supabase
            .from("shop_order_lines")
            .update({ quantity_delivered: newQtyDelivered })
            .eq("id", params.lineId);
        }
        
        // If was already Packad, delta is the difference; if newly Packad, delta is full new amount
        const previousPacked = oldStatus === "Packad" ? oldQtyDelivered : 0;
        const delta = newQtyDelivered - previousPacked;
        if (delta !== 0) {
          await transferDeltaToPreLocation(params.lineId, params.orderId, delta);
        }
      }

      // If moving FROM Packad back to Pågående/Ny, reverse the full previously packed amount
      if (oldStatus === "Packad" && (params.newStatus === "Pågående" || params.newStatus === "Ny")) {
        await transferDeltaToPreLocation(params.lineId, params.orderId, -oldQtyDelivered);
      }

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
      } else if (statuses.some((s) => s === "Pågående" || s === "Packad" || s === "Skickad" || s === "Klar / Levererad")) {
        newOrderStatus = "Pågående";
      }

      // If all lines are now "Skickad", trigger stock move to Transportlager
      if (newOrderStatus === "Skickad") {
        try {
          await moveStockToTransport(params.orderId);
        } catch (err) {
          console.error("Stock transfer to transport error:", err);
        }
      }

      await supabase
        .from("shop_orders")
        .update({ status: newOrderStatus })
        .eq("id", params.orderId);

      await logActivity({
        action_type: "status_change",
        description: `Orderrad status ändrad till: ${params.newStatus}`,
        entity_type: "shop_order_line",
        entity_id: params.lineId,
        details: { order_id: params.orderId, new_status: params.newStatus, order_status: newOrderStatus },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shop_orders"] });
      qc.invalidateQueries({ queryKey: ["product_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["all_stock_locations"] });
    },
  });
}

export { STATUS_FLOW };
