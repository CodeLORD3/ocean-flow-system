import { supabase } from "@/integrations/supabase/client";

const TRANSPORTLAGER_NAME = "Transportlager";

/**
 * Find or get the Transportlager location ID.
 */
async function getTransportlagerId(): Promise<string | null> {
  const { data } = await supabase
    .from("storage_locations")
    .select("id")
    .eq("name", TRANSPORTLAGER_NAME)
    .single();
  return data?.id || null;
}

/**
 * Find the "Raw Lager" (or "Raw") location for a given store.
 */
async function getRawLagerId(storeId: string): Promise<string | null> {
  const { data } = await supabase
    .from("storage_locations")
    .select("id, name")
    .eq("store_id", storeId)
    .ilike("name", "Raw%")
    .limit(1);
  return data?.[0]?.id || null;
}

/**
 * Transfer stock: deduct from source, add to destination.
 * Uses upsert for destination.
 */
async function transferStock(
  productId: string,
  quantity: number,
  sourceLocationId: string,
  destLocationId: string
) {
  // 1) Get current source stock
  const { data: sourceStock } = await supabase
    .from("product_stock_locations")
    .select("id, quantity")
    .eq("product_id", productId)
    .eq("location_id", sourceLocationId)
    .single();

  if (!sourceStock) return;

  const newSourceQty = Math.max(0, Number(sourceStock.quantity) - quantity);

  // 2) Update source
  await supabase
    .from("product_stock_locations")
    .update({ quantity: newSourceQty, updated_at: new Date().toISOString() })
    .eq("id", sourceStock.id);

  // 3) Upsert destination
  const { data: destStock } = await supabase
    .from("product_stock_locations")
    .select("id, quantity")
    .eq("product_id", productId)
    .eq("location_id", destLocationId)
    .maybeSingle();

  if (destStock) {
    await supabase
      .from("product_stock_locations")
      .update({
        quantity: Number(destStock.quantity) + quantity,
        updated_at: new Date().toISOString(),
      })
      .eq("id", destStock.id);
  } else {
    await supabase.from("product_stock_locations").insert({
      product_id: productId,
      location_id: destLocationId,
      quantity: quantity,
      updated_at: new Date().toISOString(),
    });
  }
}

/**
 * When an order is marked as "Skickad", move all ordered products
 * from Pre-{store} locations to Transportlager.
 */
export async function moveStockToTransport(orderId: string) {
  const transportId = await getTransportlagerId();
  if (!transportId) {
    console.error("Transportlager not found");
    return;
  }

  // Get order with lines and store info
  const { data: order } = await supabase
    .from("shop_orders")
    .select("store_id, shop_order_lines(product_id, quantity_delivered)")
    .eq("id", orderId)
    .single();

  if (!order?.store_id || !order.shop_order_lines?.length) return;

  // Find all Pre- locations for this store
  const { data: preLocations } = await supabase
    .from("storage_locations")
    .select("id")
    .eq("store_id", order.store_id)
    .ilike("name", "Pre-%");

  if (!preLocations?.length) return;

  const preLocationIds = preLocations.map((l) => l.id);

  // For each order line, find stock in Pre- locations and move to Transportlager
  for (const line of order.shop_order_lines) {
    let remaining = Number(line.quantity_delivered) || 0;

    // Get stock from all Pre- locations for this product
    const { data: stocks } = await supabase
      .from("product_stock_locations")
      .select("id, location_id, quantity")
      .eq("product_id", line.product_id)
      .in("location_id", preLocationIds)
      .gt("quantity", 0);

    for (const stock of stocks || []) {
      if (remaining <= 0) break;
      const moveQty = Math.min(remaining, Number(stock.quantity));
      await transferStock(line.product_id, moveQty, stock.location_id, transportId);
      remaining -= moveQty;
    }
  }
}

/**
 * When a shop approves an inleverans, move products from Transportlager
 * to the shop's Raw-lager.
 */
export async function moveStockToRawLager(orderId: string, storeId: string) {
  const transportId = await getTransportlagerId();
  if (!transportId) {
    console.error("Transportlager not found");
    return;
  }

  const rawLagerId = await getRawLagerId(storeId);
  if (!rawLagerId) {
    console.error("Raw Lager not found for store", storeId);
    return;
  }

  // Get order lines
  const { data: orderLines } = await supabase
    .from("shop_order_lines")
    .select("product_id, quantity_delivered")
    .eq("shop_order_id", orderId);

  if (!orderLines?.length) return;

  for (const line of orderLines) {
    const qty = Number(line.quantity_delivered) || 0;
    if (qty <= 0) continue;
    await transferStock(
      line.product_id,
      qty,
      transportId,
      rawLagerId
    );
  }
}
