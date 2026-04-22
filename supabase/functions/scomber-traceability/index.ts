// POST /scomber-traceability
// Returns batches + origin info for a given POS product (by erp_id) within a store.
// Reads makrilltrade article + batches via the cache tables, joined to current allocations.

import {
  corsHeaders,
  errorResponse,
  getServiceClient,
  jsonResponse,
  readJson,
  requireString,
  ValidationError,
} from "../_shared/scomber.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const body = await readJson(req);
    const sku = requireString(body.sku, "sku");
    const storeId = typeof body.store_id === "string" ? body.store_id : null;

    const sb = getServiceClient();

    // 1. Find the POS product to learn its erp_id (so we can look up an article id)
    const { data: posProduct } = await sb
      .from("pos_products")
      .select("id, sku, name, erp_id")
      .eq("sku", sku)
      .maybeSingle();

    // 2. Try to find a matching article in cache (by sku)
    const { data: article } = await sb
      .from("makrilltrade_articles_cache")
      .select("article_id, name, sku, unit, vat_rate, category")
      .eq("sku", sku)
      .maybeSingle();

    // 3. List active batches for the article (FIFO order)
    let batches: Array<Record<string, unknown>> = [];
    if (article) {
      const { data } = await sb
        .from("makrilltrade_batches_cache")
        .select(
          "batch_id, article_id, supplier_name, caught_at, best_before, quantity_remaining, unit, raw"
        )
        .eq("article_id", article.article_id)
        .gt("quantity_remaining", 0)
        .order("caught_at", { ascending: true, nullsFirst: false });
      batches = data ?? [];
    }

    return jsonResponse({
      ok: true,
      product: posProduct,
      article,
      batches,
      store_id: storeId,
    });
  } catch (e) {
    if (e instanceof ValidationError) return errorResponse(e.message, 400);
    console.error("scomber-traceability error:", e);
    return errorResponse("Internal error", 500, String(e));
  }
});
