import { supabase } from "@/integrations/supabase/client";

const GROSSIST_FLYTANDE_ID = "5da57ad6-f72c-4a84-9873-87174d194e10";

/**
 * When a product enters Grossist Flytande, find pending order lines
 * for that product and set their status to "Behandlas".
 */
export async function markOrderLinesBehandlas(productIds: string[]) {
  if (!productIds.length) return;

  // Find open shop_order_lines for these products where status is empty or 'Ny'
  const { data: orderLines } = await supabase
    .from("shop_order_lines")
    .select("id, status, shop_order_id, product_id, shop_orders!inner(status)")
    .in("product_id", productIds)
    .in("status", ["", "Ny"]);

  if (!orderLines?.length) return;

  const lineIds = orderLines.map((l) => l.id);
  await supabase
    .from("shop_order_lines")
    .update({ status: "Behandlas" })
    .in("id", lineIds);

  // Also update parent order status
  const orderIds = [...new Set(orderLines.map((l) => l.shop_order_id))];
  for (const orderId of orderIds) {
    await supabase
      .from("shop_orders")
      .update({ status: "Behandlas" })
      .eq("id", orderId)
      .in("status", ["Ny"]);
  }
}

/**
 * When products move from Grossist Flytande to a Pre-location,
 * find matching order lines for the store linked to that Pre-location
 * and set their status to "Packad".
 */
export async function markOrderLinesPackad(productIds: string[], targetLocationId: string) {
  if (!productIds.length) return;

  // Get the store linked to this Pre-location
  const { data: location } = await supabase
    .from("storage_locations")
    .select("store_id, name")
    .eq("id", targetLocationId)
    .single();

  if (!location?.store_id) return;
  // Only apply to Pre-locations
  if (!location.name.startsWith("Pre-")) return;

  // Find order lines for these products belonging to orders for this store
  const { data: orderLines } = await supabase
    .from("shop_order_lines")
    .select("id, status, shop_order_id, product_id, shop_orders!inner(store_id)")
    .in("product_id", productIds)
    .eq("shop_orders.store_id", location.store_id)
    .in("status", ["", "Ny", "Behandlas"]);

  if (!orderLines?.length) return;

  const lineIds = orderLines.map((l) => l.id);
  await supabase
    .from("shop_order_lines")
    .update({ status: "Packad" })
    .in("id", lineIds);

  // Check if ALL lines in the order are now "Packad" to update order status
  const orderIds = [...new Set(orderLines.map((l) => l.shop_order_id))];
  for (const orderId of orderIds) {
    const { data: allLines } = await supabase
      .from("shop_order_lines")
      .select("status")
      .eq("shop_order_id", orderId);

    const allPacked = allLines?.every((l) => l.status === "Packad" || l.status === "Klar / Levererad");
    if (allPacked) {
      await supabase.from("shop_orders").update({ status: "Packad" }).eq("id", orderId);
    }
  }
}
