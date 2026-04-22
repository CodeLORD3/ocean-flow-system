// POST /scomber-pos-checkout
// Persists a POS sale: creates pos_transactions + pos_transaction_items,
// then writes batch_allocations for each line (FIFO over makrilltrade_batches_cache).
// Replaces the direct-table writes the POS UI used to do.

import {
  corsHeaders,
  errorResponse,
  getServiceClient,
  jsonResponse,
  readJson,
  requireNumber,
  requireString,
  ValidationError,
} from "../_shared/scomber.ts";

interface CheckoutLine {
  article_id: string;          // Makrilltrade native article id
  pos_product_id?: string;     // optional link back to pos_products
  product_name: string;
  sku?: string;
  quantity: number;
  unit: "piece" | "kg" | "custom";
  unit_price_ore: number;
  line_total_ore: number;
  vat_rate: number;
  discount_ore?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const body = await readJson(req);
    const cashierId = requireString(body.cashier_id, "cashier_id");
    const paymentMethod = requireString(body.payment_method, "payment_method");
    const totalOre = requireNumber(body.total_ore, "total_ore");
    const vatBreakdown = body.vat_breakdown ?? {};
    const shiftId = typeof body.shift_id === "string" ? body.shift_id : null;
    const paymentDetails = body.payment_details ?? null;
    const controlCode = typeof body.control_code === "string" ? body.control_code : null;

    const lines = Array.isArray(body.lines) ? body.lines as CheckoutLine[] : null;
    if (!lines || lines.length === 0) {
      throw new ValidationError("lines[] is required");
    }

    const sb = getServiceClient();

    // 1. Insert transaction
    const { data: tx, error: txErr } = await sb
      .from("pos_transactions")
      .insert({
        cashier_id: cashierId,
        shift_id: shiftId,
        payment_method: paymentMethod,
        payment_details: paymentDetails,
        total_ore: totalOre,
        vat_breakdown: vatBreakdown,
        control_code: controlCode,
        status: "completed",
      })
      .select("id, receipt_no, occurred_at")
      .single();
    if (txErr) throw txErr;

    // 2. Insert line items
    const itemsInsert = lines.map((l) => ({
      transaction_id: tx.id,
      product_id: l.pos_product_id ?? null,
      product_name: l.product_name,
      sku: l.sku ?? null,
      quantity: l.quantity,
      unit: l.unit,
      unit_price_ore: l.unit_price_ore,
      line_total_ore: l.line_total_ore,
      discount_ore: l.discount_ore ?? 0,
      vat_rate: l.vat_rate,
    }));

    const { data: insertedItems, error: itErr } = await sb
      .from("pos_transaction_items")
      .insert(itemsInsert)
      .select("id");
    if (itErr) throw itErr;

    // 3. Allocate against batches (FIFO by caught_at, then synced_at)
    const allocations: Array<{
      batch_id: string;
      article_id: string;
      source_type: string;
      source_id: string;
      quantity: number;
      unit: string;
    }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const itemId = insertedItems[i].id;

      const { data: batches } = await sb
        .from("makrilltrade_batches_cache")
        .select("batch_id, quantity_remaining, caught_at, synced_at")
        .eq("article_id", line.article_id)
        .gt("quantity_remaining", 0)
        .order("caught_at", { ascending: true, nullsFirst: false })
        .order("synced_at", { ascending: true });

      let toAllocate = Number(line.quantity);
      for (const b of batches ?? []) {
        if (toAllocate <= 0) break;
        const take = Math.min(toAllocate, Number(b.quantity_remaining));
        allocations.push({
          batch_id: b.batch_id,
          article_id: line.article_id,
          source_type: "pos_transaction_item",
          source_id: itemId,
          quantity: take,
          unit: line.unit,
        });
        await sb
          .from("makrilltrade_batches_cache")
          .update({ quantity_remaining: Number(b.quantity_remaining) - take })
          .eq("batch_id", b.batch_id);
        toAllocate -= take;
      }
      // If no batches available, we still record the sale but skip allocation.
      // Reconciliation runs later via scomber-makrilltrade-sync.
    }

    if (allocations.length > 0) {
      const { error: allocErr } = await sb.from("batch_allocations").insert(allocations);
      if (allocErr) throw allocErr;
    }

    return jsonResponse({
      ok: true,
      transaction: {
        id: tx.id,
        receipt_no: tx.receipt_no,
        occurred_at: tx.occurred_at,
      },
      allocations: allocations.length,
    });
  } catch (e) {
    if (e instanceof ValidationError) return errorResponse(e.message, 400);
    console.error("scomber-pos-checkout error:", e);
    return errorResponse("Internal error", 500, String(e));
  }
});
