// POST /scomber-b2b-order
// Creates a B2B (restaurant) order with lines. Optionally allocates batches at confirm time.

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

interface B2BLine {
  article_id: string;
  product_name: string;
  quantity: number;
  unit: string;
  unit_price_ore: number;
  line_total_ore: number;
  vat_rate: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const body = await readJson(req);
    const customerName = requireString(body.customer_name, "customer_name");
    const totalOre = requireNumber(body.total_ore, "total_ore");
    const lines = Array.isArray(body.lines) ? body.lines as B2BLine[] : null;
    if (!lines || lines.length === 0) throw new ValidationError("lines[] is required");

    const sb = getServiceClient();

    const { data: order, error: ordErr } = await sb
      .from("b2b_orders")
      .insert({
        customer_name: customerName,
        customer_org_no: typeof body.customer_org_no === "string" ? body.customer_org_no : null,
        customer_email: typeof body.customer_email === "string" ? body.customer_email : null,
        customer_tier_id: typeof body.customer_tier_id === "string" ? body.customer_tier_id : null,
        delivery_date: typeof body.delivery_date === "string" ? body.delivery_date : null,
        store_id: typeof body.store_id === "string" ? body.store_id : null,
        status: typeof body.status === "string" ? body.status : "draft",
        total_ore: totalOre,
        vat_breakdown: body.vat_breakdown ?? {},
        notes: typeof body.notes === "string" ? body.notes : null,
        created_by: typeof body.created_by === "string" ? body.created_by : null,
      })
      .select("id, order_no")
      .single();
    if (ordErr) throw ordErr;

    const linesInsert = lines.map((l) => ({
      order_id: order.id,
      article_id: l.article_id,
      product_name: l.product_name,
      quantity: l.quantity,
      unit: l.unit,
      unit_price_ore: l.unit_price_ore,
      line_total_ore: l.line_total_ore,
      vat_rate: l.vat_rate,
    }));

    const { data: insertedLines, error: linErr } = await sb
      .from("b2b_order_lines")
      .insert(linesInsert)
      .select("id, article_id, quantity, unit");
    if (linErr) throw linErr;

    // If order is being confirmed, allocate batches now (FIFO)
    let allocCount = 0;
    if (body.status === "confirmed" || body.allocate === true) {
      const allocations: Array<Record<string, unknown>> = [];
      for (const l of insertedLines) {
        const { data: batches } = await sb
          .from("makrilltrade_batches_cache")
          .select("batch_id, quantity_remaining, caught_at, synced_at")
          .eq("article_id", l.article_id)
          .gt("quantity_remaining", 0)
          .order("caught_at", { ascending: true, nullsFirst: false })
          .order("synced_at", { ascending: true });

        let toAllocate = Number(l.quantity);
        for (const b of batches ?? []) {
          if (toAllocate <= 0) break;
          const take = Math.min(toAllocate, Number(b.quantity_remaining));
          allocations.push({
            batch_id: b.batch_id,
            article_id: l.article_id,
            source_type: "b2b_order_line",
            source_id: l.id,
            quantity: take,
            unit: l.unit,
          });
          await sb
            .from("makrilltrade_batches_cache")
            .update({ quantity_remaining: Number(b.quantity_remaining) - take })
            .eq("batch_id", b.batch_id);
          toAllocate -= take;
        }
      }
      if (allocations.length > 0) {
        const { error: aErr } = await sb.from("batch_allocations").insert(allocations);
        if (aErr) throw aErr;
        allocCount = allocations.length;
      }
    }

    return jsonResponse({
      ok: true,
      order: { id: order.id, order_no: order.order_no },
      allocations: allocCount,
    });
  } catch (e) {
    if (e instanceof ValidationError) return errorResponse(e.message, 400);
    console.error("scomber-b2b-order error:", e);
    return errorResponse("Internal error", 500, String(e));
  }
});
