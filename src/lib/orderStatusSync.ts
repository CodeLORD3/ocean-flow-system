import { supabase } from "@/integrations/supabase/client";

const GROSSIST_FLYTANDE_ID = "5da57ad6-f72c-4a84-9873-87174d194e10";

/**
 * Legacy function — no longer auto-promotes to Behandlas.
 * Kept for API compatibility.
 */
export async function markOrderLinesBehandlas(_productIds: string[]) {
  // No-op: status stays as "Ny" until manually changed
}

/**
 * Legacy function — no longer auto-promotes to Behandlas from Grossist Flytande stock.
 * Kept for API compatibility.
 */
export async function syncBehandlasFromStock() {
  // No-op: statuses stay as "Ny" until manually changed
}

/**
 * Re-evaluates all "Packad" and "Behandlas" order lines against current stock.
 * If stock is insufficient (quantity < ordered), reverts them to "Ny".
 */
export async function revertOrderLinesIfStockGone() {
  // 1) Get all Pre-location stock
  const { data: preLocations } = await supabase
    .from("storage_locations")
    .select("id, store_id, name")
    .like("name", "Pre-%");

  const preLocationMap = new Map<string, string>();
  for (const loc of preLocations || []) {
    if (loc.store_id) preLocationMap.set(loc.id, loc.store_id);
  }

  const preLocationIds = [...preLocationMap.keys()];
  const preStockMap = new Map<string, number>(); // "store_id:product_id" -> quantity
  if (preLocationIds.length) {
    const { data } = await supabase
      .from("product_stock_locations")
      .select("product_id, location_id, quantity")
      .in("location_id", preLocationIds)
      .gt("quantity", 0);
    
    for (const s of data || []) {
      const storeId = preLocationMap.get(s.location_id);
      const key = `${storeId}:${s.product_id}`;
      preStockMap.set(key, (preStockMap.get(key) || 0) + Number(s.quantity));
    }
  }

  // 2) Find all "Packad" order lines
  const { data: packadLines } = await supabase
    .from("shop_order_lines")
    .select("id, product_id, quantity_ordered, shop_order_id, shop_orders!inner(status, store_id, priority, created_at)")
    .eq("status", "Packad")
    .not("shop_orders.status", "in", '("Arkiverad","Klar / Levererad")');

  // Sort them
  const sortedPackadLines = [...(packadLines || [])].sort((a, b) => {
    const aPriority = a.shop_orders.priority || 0;
    const bPriority = b.shop_orders.priority || 0;
    if (aPriority !== bPriority) return bPriority - aPriority;
    return new Date(a.shop_orders.created_at).getTime() - new Date(b.shop_orders.created_at).getTime();
  });

  const linesToRevertFromPackad: string[] = [];
  const affectedOrderIds = new Set<string>();

  for (const line of sortedPackadLines) {
    const storeId = (line as any).shop_orders?.store_id;
    const key = `${storeId}:${line.product_id}`;
    const available = preStockMap.get(key) || 0;
    const qtyOrdered = Number(line.quantity_ordered);

    if (available >= qtyOrdered) {
      preStockMap.set(key, available - qtyOrdered); // Consume it
    } else {
      linesToRevertFromPackad.push(line.id);
      affectedOrderIds.add(line.shop_order_id);
    }
  }

  if (linesToRevertFromPackad.length) {
    await supabase
      .from("shop_order_lines")
      .update({ status: "Ny" }) // Temporarily set to Ny
      .in("id", linesToRevertFromPackad);
  }

  // Reverted lines stay as "Ny" — no auto-promotion to Behandlas

  // Update order statuses for orders that had lines reverted from Packad
  for (const orderId of affectedOrderIds) {
    const { data: allLines } = await supabase
      .from("shop_order_lines")
      .select("status")
      .eq("shop_order_id", orderId);

    if (!allLines?.length) continue;

    const statuses = allLines.map((l) => l.status || "");
    let newOrderStatus = "Ny";
    if (statuses.every((s) => s === "Klar / Levererad")) {
      newOrderStatus = "Klar / Levererad";
    } else if (statuses.every((s) => s === "Packad" || s === "Klar / Levererad")) {
      newOrderStatus = "Packad";
    } else if (statuses.some((s) => s === "Pågående" || s === "Packad" || s === "Klar / Levererad")) {
      newOrderStatus = "Pågående";
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
 * check if the Pre-location has enough stock to cover the full order line.
 * If so, mark it "Packad".
 */
export async function markOrderLinesPackad(productIds: string[], targetLocationId: string) {
  if (!productIds.length) return;

  const { data: location } = await supabase
    .from("storage_locations")
    .select("store_id, name")
    .eq("id", targetLocationId)
    .single();

  if (!location?.store_id) return;
  if (!location.name.toLowerCase().startsWith("pre-")) return;

  // Get stock in this Pre-location for these products
  const { data: preStock } = await supabase
    .from("product_stock_locations")
    .select("product_id, quantity")
    .eq("location_id", targetLocationId)
    .in("product_id", productIds)
    .gt("quantity", 0);

  const stockMap = new Map<string, number>();
  for (const s of preStock || []) {
    stockMap.set(s.product_id, (stockMap.get(s.product_id) || 0) + Number(s.quantity));
  }

  // Find order lines for these products - prioritize "Pågående" status for Pre-location packing
  const { data: orderLines } = await supabase
    .from("shop_order_lines")
    .select("id, status, shop_order_id, product_id, quantity_ordered, shop_orders!inner(store_id, priority, created_at)")
    .in("product_id", productIds)
    .eq("shop_orders.store_id", location.store_id)
    .in("status", ["", "Ny", "Behandlas"])
    .not("shop_orders.status", "in", '("Arkiverad","Klar / Levererad")');

  if (!orderLines?.length) return;

  // Sort them: "Behandlas" first, then by priority, then by creation date
  const sortedLines = [...orderLines].sort((a, b) => {
    // Prioritize lines already "Behandlas" to upgrade them to "Packad"
    if (a.status === "Behandlas" && b.status !== "Behandlas") return -1;
    if (b.status === "Behandlas" && a.status !== "Behandlas") return 1;
    
    const aPriority = a.shop_orders.priority || 0;
    const bPriority = b.shop_orders.priority || 0;
    if (aPriority !== bPriority) return bPriority - aPriority;
    return new Date(a.shop_orders.created_at).getTime() - new Date(b.shop_orders.created_at).getTime();
  });

  const linesToPack: string[] = [];
  const affectedOrderIds = new Set<string>();

  for (const line of sortedLines) {
    const available = stockMap.get(line.product_id) || 0;
    const qtyOrdered = Number(line.quantity_ordered);
    if (available >= qtyOrdered) {
      stockMap.set(line.product_id, available - qtyOrdered);
      linesToPack.push(line.id);
      affectedOrderIds.add(line.shop_order_id);
    }
  }

  if (!linesToPack.length) return;

  await supabase
    .from("shop_order_lines")
    .update({ status: "Packad" })
    .in("id", linesToPack);

  // Update order status
  for (const orderId of affectedOrderIds) {
    const { data: allLines } = await supabase
      .from("shop_order_lines")
      .select("status")
      .eq("shop_order_id", orderId);

    if (!allLines?.length) continue;
    
    const statuses = allLines.map((l) => l.status || "");
    let newOrderStatus = "Ny";
    if (statuses.every((s) => s === "Klar / Levererad")) {
      newOrderStatus = "Klar / Levererad";
    } else if (statuses.every((s) => s === "Packad" || s === "Klar / Levererad")) {
      newOrderStatus = "Packad";
    } else if (statuses.some((s) => s === "Pågående" || s === "Packad" || s === "Klar / Levererad")) {
      newOrderStatus = "Pågående";
    }

    await supabase.from("shop_orders").update({ status: newOrderStatus }).eq("id", orderId);
  }
}
