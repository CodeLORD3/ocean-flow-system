import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { moveStockToTransport } from "@/lib/stockTransfer";

const STATUS_FLOW = ["Ny", "Pågående", "Packad", "Skickad"] as const;

/**
 * When a line moves to "Packad", transfer the ordered quantity
 * from "Grossist Flytande" to the store's "Pre-" location.
 */
async function transferToPreLocation(lineId: string, orderId: string) {
  // Get the order line (product + qty) and the order's store
  const { data: line } = await supabase
    .from("shop_order_lines")
    .select("product_id, quantity_ordered, quantity_delivered")
    .eq("id", lineId)
    .single();
  if (!line) return;

  const { data: order } = await supabase
    .from("shop_orders")
    .select("store_id, stores(name)")
    .eq("id", orderId)
    .single();
  if (!order?.store_id) return;

  // Find "Grossist Flytande" location
  const { data: gfLoc } = await supabase
    .from("storage_locations")
    .select("id")
    .ilike("name", "Grossist Flytande")
    .single();
  if (!gfLoc) return;

  // Find the Pre- location for this store
  const { data: preLocs } = await supabase
    .from("storage_locations")
    .select("id, name")
    .eq("store_id", order.store_id)
    .ilike("name", "Pre-%")
    .limit(1);
  const preLoc = preLocs?.[0];
  if (!preLoc) return;

  const qty = Number(line.quantity_delivered || line.quantity_ordered);

  // Deduct from Grossist Flytande
  const { data: srcStock } = await supabase
    .from("product_stock_locations")
    .select("id, quantity")
    .eq("product_id", line.product_id)
    .eq("location_id", gfLoc.id)
    .single();

  if (srcStock) {
    const newSrcQty = Math.max(0, Number(srcStock.quantity) - qty);
    await supabase
      .from("product_stock_locations")
      .update({ quantity: newSrcQty, updated_at: new Date().toISOString() })
      .eq("id", srcStock.id);
  }

  // Upsert into Pre- location
  const { data: destStock } = await supabase
    .from("product_stock_locations")
    .select("id, quantity")
    .eq("product_id", line.product_id)
    .eq("location_id", preLoc.id)
    .maybeSingle();

  if (destStock) {
    await supabase
      .from("product_stock_locations")
      .update({
        quantity: Number(destStock.quantity) + qty,
        updated_at: new Date().toISOString(),
      })
      .eq("id", destStock.id);
  } else {
    await supabase.from("product_stock_locations").insert({
      product_id: line.product_id,
      location_id: preLoc.id,
      quantity: qty,
      updated_at: new Date().toISOString(),
    });
  }
}

/**
 * When a line moves FROM "Packad" back to "Pågående", reverse the transfer:
 * move quantity from the store's "Pre-" location back to "Grossist Flytande".
 */
async function transferFromPreLocationBack(lineId: string, orderId: string) {
  const { data: line } = await supabase
    .from("shop_order_lines")
    .select("product_id, quantity_ordered, quantity_delivered")
    .eq("id", lineId)
    .single();
  if (!line) return;

  const { data: order } = await supabase
    .from("shop_orders")
    .select("store_id")
    .eq("id", orderId)
    .single();
  if (!order?.store_id) return;

  // Find "Grossist Flytande" location
  const { data: gfLoc } = await supabase
    .from("storage_locations")
    .select("id")
    .ilike("name", "Grossist Flytande")
    .single();
  if (!gfLoc) return;

  // Find the Pre- location for this store
  const { data: preLocs } = await supabase
    .from("storage_locations")
    .select("id, name")
    .eq("store_id", order.store_id)
    .ilike("name", "Pre-%")
    .limit(1);
  const preLoc = preLocs?.[0];
  if (!preLoc) return;

  const qty = Number(line.quantity_delivered || line.quantity_ordered);

  // Deduct from Pre- location
  const { data: preStock } = await supabase
    .from("product_stock_locations")
    .select("id, quantity")
    .eq("product_id", line.product_id)
    .eq("location_id", preLoc.id)
    .single();

  if (preStock) {
    const newPreQty = Math.max(0, Number(preStock.quantity) - qty);
    await supabase
      .from("product_stock_locations")
      .update({ quantity: newPreQty, updated_at: new Date().toISOString() })
      .eq("id", preStock.id);
  }

  // Add back to Grossist Flytande
  const { data: gfStock } = await supabase
    .from("product_stock_locations")
    .select("id, quantity")
    .eq("product_id", line.product_id)
    .eq("location_id", gfLoc.id)
    .maybeSingle();

  if (gfStock) {
    await supabase
      .from("product_stock_locations")
      .update({
        quantity: Number(gfStock.quantity) + qty,
        updated_at: new Date().toISOString(),
      })
      .eq("id", gfStock.id);
  } else {
    await supabase.from("product_stock_locations").insert({
      product_id: line.product_id,
      location_id: gfLoc.id,
      quantity: qty,
      updated_at: new Date().toISOString(),
    });
  }
}

export function useUpdateOrderLineStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { lineId: string; newStatus: string; orderId: string }) => {
      // Get current status before updating
      const { data: currentLine } = await supabase
        .from("shop_order_lines")
        .select("status")
        .eq("id", params.lineId)
        .single();
      const oldStatus = currentLine?.status || "";

      // Update line status
      const { error } = await supabase
        .from("shop_order_lines")
        .update({ status: params.newStatus })
        .eq("id", params.lineId);
      if (error) throw error;

      // If moving to Packad, transfer stock from Grossist Flytande → Pre-location
      if (params.newStatus === "Packad") {
        await transferToPreLocation(params.lineId, params.orderId);
      }

      // If moving FROM Packad back to Pågående/Ny, reverse the transfer
      if (oldStatus === "Packad" && (params.newStatus === "Pågående" || params.newStatus === "Ny")) {
        await transferFromPreLocationBack(params.lineId, params.orderId);
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
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shop_orders"] });
      qc.invalidateQueries({ queryKey: ["product_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["all_stock_locations"] });
    },
  });
}

export { STATUS_FLOW };
