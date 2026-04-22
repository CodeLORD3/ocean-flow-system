// POST /scomber-batch-allocate
// Manual / corrective batch allocation. Used by Morning-rutin and admin tools
// to fix or override automatic FIFO allocations.

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const body = await readJson(req);
    const batchId = requireString(body.batch_id, "batch_id");
    const articleId = requireString(body.article_id, "article_id");
    const sourceType = requireString(body.source_type, "source_type");
    const sourceId = requireString(body.source_id, "source_id");
    const quantity = requireNumber(body.quantity, "quantity");
    const unit = requireString(body.unit, "unit");

    if (!["pos_transaction_item", "b2b_order_line"].includes(sourceType)) {
      throw new ValidationError("source_type must be pos_transaction_item or b2b_order_line");
    }
    if (quantity <= 0) throw new ValidationError("quantity must be > 0");

    const sb = getServiceClient();

    // Verify batch has enough stock
    const { data: batch, error: bErr } = await sb
      .from("makrilltrade_batches_cache")
      .select("batch_id, quantity_remaining")
      .eq("batch_id", batchId)
      .maybeSingle();
    if (bErr) throw bErr;
    if (!batch) throw new ValidationError(`Batch ${batchId} not found`);
    if (Number(batch.quantity_remaining) < quantity) {
      throw new ValidationError(
        `Batch ${batchId} only has ${batch.quantity_remaining} remaining`,
      );
    }

    const { data: alloc, error: aErr } = await sb
      .from("batch_allocations")
      .insert({
        batch_id: batchId,
        article_id: articleId,
        source_type: sourceType,
        source_id: sourceId,
        quantity,
        unit,
      })
      .select("id, allocated_at")
      .single();
    if (aErr) throw aErr;

    await sb
      .from("makrilltrade_batches_cache")
      .update({ quantity_remaining: Number(batch.quantity_remaining) - quantity })
      .eq("batch_id", batchId);

    return jsonResponse({ ok: true, allocation: alloc });
  } catch (e) {
    if (e instanceof ValidationError) return errorResponse(e.message, 400);
    console.error("scomber-batch-allocate error:", e);
    return errorResponse("Internal error", 500, String(e));
  }
});
