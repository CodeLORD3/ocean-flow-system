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
 * Add quantity to a destination location, handling multiple existing rows safely.
 */
async function addToLocation(productId: string, locationId: string, quantity: number, shopOrderId?: string) {
  // Find existing row(s) — use limit(1) to avoid maybeSingle errors with split rows
  const q = supabase
    .from("product_stock_locations")
    .select("id, quantity")
    .eq("product_id", productId)
    .eq("location_id", locationId);

  // If shopOrderId specified, filter by it; otherwise only look at untagged rows
  if (shopOrderId) {
    q.eq("shop_order_id", shopOrderId);
  } else {
    q.is("shop_order_id", null);
  }

  const { data: existing } = await q.limit(1);
  const row = existing?.[0];

  if (row) {
    await supabase
      .from("product_stock_locations")
      .update({ quantity: Number(row.quantity) + quantity, updated_at: new Date().toISOString() })
      .eq("id", row.id);
  } else {
    await supabase.from("product_stock_locations").insert({
      product_id: productId,
      location_id: locationId,
      quantity: quantity,
      shop_order_id: shopOrderId || null,
      updated_at: new Date().toISOString(),
    });
  }
}

/**
 * When an order is marked as "Skickad", move all ordered products
 * from Pre-{store} locations to Transportlager.
 * Also checks Grossist Flytande as fallback if Pre-locations don't have enough stock.
 * Each product gets its own row tagged with shop_order_id.
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
    .select("store_id, shop_order_lines(product_id, quantity_delivered, quantity_ordered)")
    .eq("id", orderId)
    .single();

  if (!order?.store_id || !order.shop_order_lines?.length) return;

  // Find all Pre- locations for this store
  const { data: preLocations } = await supabase
    .from("storage_locations")
    .select("id")
    .eq("store_id", order.store_id)
    .ilike("name", "Pre-%");

  const preLocationIds = (preLocations || []).map((l) => l.id);

  // Find Grossist Flytande as fallback source
  const { data: gfLoc } = await supabase
    .from("storage_locations")
    .select("id")
    .ilike("name", "Grossist Flytande")
    .single();

  // For each order line, deduct from Pre- locations (then Grossist Flytande as fallback) and create tagged Transportlager entry
  for (const line of order.shop_order_lines) {
    let remaining = Number(line.quantity_delivered || line.quantity_ordered) || 0;
    if (remaining <= 0) continue;

    let totalDeducted = 0;

    // 1) Try deducting from Pre- locations first
    if (preLocationIds.length) {
      const { data: preStocks } = await supabase
        .from("product_stock_locations")
        .select("id, location_id, quantity")
        .eq("product_id", line.product_id)
        .in("location_id", preLocationIds)
        .gt("quantity", 0);

      for (const stock of preStocks || []) {
        if (remaining <= 0) break;
        const moveQty = Math.min(remaining, Number(stock.quantity));
        const newQty = Math.max(0, Number(stock.quantity) - moveQty);
        await supabase
          .from("product_stock_locations")
          .update({ quantity: newQty, updated_at: new Date().toISOString() })
          .eq("id", stock.id);
        remaining -= moveQty;
        totalDeducted += moveQty;
      }
    }

    // 2) If still remaining, deduct from Grossist Flytande
    if (remaining > 0 && gfLoc) {
      const { data: gfStocks } = await supabase
        .from("product_stock_locations")
        .select("id, quantity")
        .eq("product_id", line.product_id)
        .eq("location_id", gfLoc.id)
        .gt("quantity", 0);

      for (const stock of gfStocks || []) {
        if (remaining <= 0) break;
        const moveQty = Math.min(remaining, Number(stock.quantity));
        const newQty = Math.max(0, Number(stock.quantity) - moveQty);
        await supabase
          .from("product_stock_locations")
          .update({ quantity: newQty, updated_at: new Date().toISOString() })
          .eq("id", stock.id);
        remaining -= moveQty;
        totalDeducted += moveQty;
      }
    }

    // Create a dedicated Transportlager entry tagged with this order
    if (totalDeducted > 0) {
      await addToLocation(line.product_id, transportId, totalDeducted, orderId);
    }

    if (remaining > 0) {
      console.warn(`moveStockToTransport: Could not find enough stock for product ${line.product_id}. Missing: ${remaining}`);
    }
  }
}

/**
 * When a shop approves an inleverans, move products from Transportlager
 * to the shop's Raw-lager, then delete the order-tagged Transportlager entries.
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

  // Get all Transportlager entries tagged with this order
  const { data: transportEntries } = await supabase
    .from("product_stock_locations")
    .select("id, product_id, quantity")
    .eq("location_id", transportId)
    .eq("shop_order_id", orderId);

  if (!transportEntries?.length) {
    console.warn(`moveStockToRawLager: No tagged Transportlager entries found for order ${orderId}. Stock may not have been transferred to Transportlager.`);
    return; // Do NOT use fallback — it causes duplicates
  }

  // Move each tagged entry to Raw-lager and then delete the Transportlager row
  for (const entry of transportEntries) {
    const qty = Number(entry.quantity) || 0;
    if (qty <= 0) continue;

    // Add to Raw-lager (untagged)
    await addToLocation(entry.product_id, rawLagerId, qty);

    // Delete the Transportlager entry
    await supabase
      .from("product_stock_locations")
      .delete()
      .eq("id", entry.id);
  }
}
