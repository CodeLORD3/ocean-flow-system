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
    // Accept either `article_sku` (preferred — direct link to makrilltrade catalog)
    // or `sku` (POS product sku, fallback for backwards compat).
    const articleSku =
      typeof body.article_sku === "string" && body.article_sku.length > 0
        ? body.article_sku
        : null;
    const posSku = typeof body.sku === "string" ? body.sku : null;
    if (!articleSku && !posSku) {
      throw new ValidationError("article_sku or sku is required");
    }
    const storeId = typeof body.store_id === "string" ? body.store_id : null;

    const sb = getServiceClient();

    // 1. Find the POS product (by its own sku) for context
    let posProduct: any = null;
    if (posSku) {
      const { data } = await sb
        .from("pos_products")
        .select("id, sku, name, erp_id, article_sku")
        .eq("sku", posSku)
        .maybeSingle();
      posProduct = data;
    }

    // 2. Find the article in cache, preferring explicit article_sku
    const lookupSku = articleSku ?? posProduct?.article_sku ?? posSku;
    const { data: article } = await sb
      .from("makrilltrade_articles_cache")
      .select("article_id, name, sku, unit, vat_rate, category")
      .eq("sku", lookupSku)
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
