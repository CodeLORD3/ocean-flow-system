import { supabase } from "@/integrations/supabase/client";

/** Grossist Flytande — lagerplatsen där råvara och tillverkade detaljer ligger. */
export const GROSSIST_FLYTANDE_ID = "5da57ad6-f72c-4a84-9873-87174d194e10";

/** Lägger till kvantitet på en lagerplats med viktat snittkostpris. */
export async function addStock(productId: string, quantity: number, unitCost: number, locationId = GROSSIST_FLYTANDE_ID) {
  const { data: existing } = await supabase
    .from("product_stock_locations")
    .select("id, quantity, unit_cost")
    .eq("product_id", productId)
    .eq("location_id", locationId)
    .limit(1);
  const row = existing?.[0];
  if (row) {
    const oldTotal = Number(row.quantity) * Number(row.unit_cost || 0);
    const newTotal = quantity * unitCost;
    const combined = Number(row.quantity) + quantity;
    const avg = combined > 0 ? (oldTotal + newTotal) / combined : 0;
    await supabase
      .from("product_stock_locations")
      .update({ quantity: combined, unit_cost: avg, updated_at: new Date().toISOString() })
      .eq("id", row.id);
  } else {
    await supabase.from("product_stock_locations").insert({
      product_id: productId,
      location_id: locationId,
      quantity,
      unit_cost: unitCost,
      updated_at: new Date().toISOString(),
    });
  }
}

/** Drar av kvantitet från en lagerplats (aldrig under noll). */
export async function withdrawStock(productId: string, quantity: number, locationId = GROSSIST_FLYTANDE_ID) {
  const { data: existing } = await supabase
    .from("product_stock_locations")
    .select("id, quantity")
    .eq("product_id", productId)
    .eq("location_id", locationId)
    .limit(1);
  const row = existing?.[0];
  if (!row) return;
  const newQty = Math.max(0, Number(row.quantity) - quantity);
  await supabase
    .from("product_stock_locations")
    .update({ quantity: newQty, updated_at: new Date().toISOString() })
    .eq("id", row.id);
}
