import { supabase } from "@/integrations/supabase/client";

const GROSSIST_FLYTANDE_ID = "5da57ad6-f72c-4a84-9873-87174d194e10";

/**
 * When a product enters Grossist Flytande, find pending order lines
 * for that product and set their status to "Behandlas".
 */
export async function markOrderLinesBehandlas(productIds: string[]) {
  if (!productIds.length) return;

  // Find open shop_order_lines for these products where status is empty or 'Ny'
  // Only for non-archived orders
  const { data: orderLines } = await supabase
    .from("shop_order_lines")
    .select("id, status, shop_order_id, product_id, shop_orders!inner(status)")
    .in("product_id", productIds)
    .in("status", ["", "Ny"])
    .not("shop_orders.status", "in", '("Arkiverad","Klar / Levererad")');

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
 * Sync ALL pending order lines against current Grossist Flytande stock.
 * Any order line whose product exists in Grossist Flytande gets set to "Behandlas".
 * Call this on page load or after order creation.
 */
export async function syncBehandlasFromStock() {
  // Get all products currently in Grossist Flytande
  const { data: stock } = await supabase
    .from("product_stock_locations")
    .select("product_id")
    .eq("location_id", GROSSIST_FLYTANDE_ID)
    .gt("quantity", 0);

  if (!stock?.length) return;

  const productIdsInStock = stock.map((s) => s.product_id);

  // Find all pending order lines matching these products
  const { data: orderLines } = await supabase
    .from("shop_order_lines")
    .select("id, status, shop_order_id, product_id, shop_orders!inner(status)")
    .in("product_id", productIdsInStock)
    .in("status", ["", "Ny"])
    .not("shop_orders.status", "in", '("Arkiverad","Klar / Levererad")');

  if (!orderLines?.length) return;

  const lineIds = orderLines.map((l) => l.id);
  await supabase
    .from("shop_order_lines")
    .update({ status: "Behandlas" })
    .in("id", lineIds);

  // Update parent order statuses
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
 * Reverse sync: revert order lines whose status was set based on stock
 * that no longer exists. For each "Behandlas" order line, check if the product
 * still has quantity > 0 in Grossist Flytande. If not, revert to "Ny".
 * For each "Packad" order line, check if the product still exists in the
 * relevant Pre-location. If not, check Grossist Flytande – if present revert
 * to "Behandlas", otherwise revert to "Ny".
 * Call this after any stock deletion or movement out of Grossist Flytande.
 */
export async function revertOrderLinesIfStockGone() {
  // 1) Get all products currently in Grossist Flytande with qty > 0
  const { data: gfStock } = await supabase
    .from("product_stock_locations")
    .select("product_id, quantity")
    .eq("location_id", GROSSIST_FLYTANDE_ID)
    .gt("quantity", 0);

  const gfProductIds = new Set((gfStock || []).map((s) => s.product_id));

  // 2) Get all Pre-location stock
  const { data: preLocations } = await supabase
    .from("storage_locations")
    .select("id, store_id, name")
    .like("name", "Pre-%");

  const preLocationMap = new Map<string, string>(); // location_id -> store_id
  for (const loc of preLocations || []) {
    if (loc.store_id) preLocationMap.set(loc.id, loc.store_id);
  }

  const preLocationIds = [...preLocationMap.keys()];
  let preStock: { product_id: string; location_id: string }[] = [];
  if (preLocationIds.length) {
    const { data } = await supabase
      .from("product_stock_locations")
      .select("product_id, location_id")
      .in("location_id", preLocationIds)
      .gt("quantity", 0);
    preStock = data || [];
  }

  // Build a set of "store_id:product_id" for quick lookup
  const preStockSet = new Set(
    preStock.map((s) => `${preLocationMap.get(s.location_id)}:${s.product_id}`)
  );

  // 3) Find all "Behandlas" order lines on active orders
  const { data: behandlasLines } = await supabase
    .from("shop_order_lines")
    .select("id, product_id, shop_order_id, shop_orders!inner(status)")
    .eq("status", "Behandlas")
    .not("shop_orders.status", "in", '("Arkiverad","Klar / Levererad")');

  // Revert "Behandlas" lines where product is no longer in Grossist Flytande
  const revertToNyIds: string[] = [];
  const revertToNyOrderIds = new Set<string>();
  for (const line of behandlasLines || []) {
    if (!gfProductIds.has(line.product_id)) {
      revertToNyIds.push(line.id);
      revertToNyOrderIds.add(line.shop_order_id);
    }
  }

  if (revertToNyIds.length) {
    await supabase
      .from("shop_order_lines")
      .update({ status: "Ny" })
      .in("id", revertToNyIds);
  }

  // 4) Find all "Packad" order lines on active orders
  const { data: packadLines } = await supabase
    .from("shop_order_lines")
    .select("id, product_id, shop_order_id, shop_orders!inner(status, store_id)")
    .eq("status", "Packad")
    .not("shop_orders.status", "in", '("Arkiverad","Klar / Levererad")');

  const revertPackadToBehandlasIds: string[] = [];
  const revertPackadToNyIds: string[] = [];
  const affectedOrderIds = new Set<string>();

  for (const line of packadLines || []) {
    const storeId = (line as any).shop_orders?.store_id;
    const inPreLocation = preStockSet.has(`${storeId}:${line.product_id}`);
    if (!inPreLocation) {
      affectedOrderIds.add(line.shop_order_id);
      if (gfProductIds.has(line.product_id)) {
        revertPackadToBehandlasIds.push(line.id);
      } else {
        revertPackadToNyIds.push(line.id);
      }
    }
  }

  if (revertPackadToBehandlasIds.length) {
    await supabase
      .from("shop_order_lines")
      .update({ status: "Behandlas" })
      .in("id", revertPackadToBehandlasIds);
  }
  if (revertPackadToNyIds.length) {
    await supabase
      .from("shop_order_lines")
      .update({ status: "Ny" })
      .in("id", revertPackadToNyIds);
  }

  // 5) Recalculate parent order statuses for all affected orders
  const allAffectedOrderIds = new Set([...revertToNyOrderIds, ...affectedOrderIds]);
  for (const orderId of allAffectedOrderIds) {
    const { data: allLines } = await supabase
      .from("shop_order_lines")
      .select("status")
      .eq("shop_order_id", orderId);

    if (!allLines?.length) continue;

    const statuses = allLines.map((l) => l.status || "");
    let newOrderStatus: string;
    if (statuses.every((s) => s === "Klar / Levererad")) {
      newOrderStatus = "Klar / Levererad";
    } else if (statuses.every((s) => s === "Packad" || s === "Klar / Levererad")) {
      newOrderStatus = "Packad";
    } else if (statuses.some((s) => s === "Behandlas" || s === "Packad" || s === "Klar / Levererad")) {
      newOrderStatus = "Behandlas";
    } else {
      newOrderStatus = "Ny";
    }

    await supabase
      .from("shop_orders")
      .update({ status: newOrderStatus })
      .eq("id", orderId)
      .not("status", "in", '("Arkiverad","Klar / Levererad")');
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
