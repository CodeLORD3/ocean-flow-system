// POST /scomber-makrilltrade-sync
// Pulls articles + batches from Makrilltrade MySQL into the local read-models.
// Currently STUBBED — when MAKRILLTRADE_MYSQL_URL is configured this will
// connect via deno-mysql and run the real SELECTs. For now it accepts a
// `mock` payload so the pipeline can be exercised end-to-end.

import {
  corsHeaders,
  errorResponse,
  getServiceClient,
  jsonResponse,
  readJson,
  ValidationError,
} from "../_shared/scomber.ts";

interface ArticleSyncRow {
  article_id: string;
  sku?: string;
  name: string;
  category?: string;
  unit?: string;
  vat_rate?: number;
  default_price_ore?: number;
  active?: boolean;
  raw?: Record<string, unknown>;
}

interface BatchSyncRow {
  batch_id: string;
  article_id: string;
  supplier_name?: string;
  caught_at?: string;
  best_before?: string;
  quantity_remaining: number;
  unit?: string;
  raw?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const body = await readJson(req);
    const sb = getServiceClient();

    const mysqlUrl = Deno.env.get("MAKRILLTRADE_MYSQL_URL");

    let articles: ArticleSyncRow[] = [];
    let batches: BatchSyncRow[] = [];

    if (mysqlUrl) {
      // Real path — to be implemented when the read-only MySQL user exists.
      // Intentionally not connecting yet so the function stays safe.
      return errorResponse(
        "MySQL client not yet wired. Configure MAKRILLTRADE_MYSQL_URL and update this function.",
        501,
      );
    }

    // Stub / mock path: caller can pass payloads to seed the cache.
    if (Array.isArray(body.articles)) articles = body.articles as ArticleSyncRow[];
    if (Array.isArray(body.batches)) batches = body.batches as BatchSyncRow[];

    if (articles.length === 0 && batches.length === 0) {
      throw new ValidationError(
        "No MySQL configured and no mock articles/batches provided",
      );
    }

    let articleCount = 0;
    let batchCount = 0;

    if (articles.length > 0) {
      const upserts = articles.map((a) => ({
        article_id: a.article_id,
        sku: a.sku ?? null,
        name: a.name,
        category: a.category ?? null,
        unit: a.unit ?? "kg",
        vat_rate: a.vat_rate ?? 12,
        default_price_ore: a.default_price_ore ?? 0,
        active: a.active ?? true,
        raw: a.raw ?? null,
        synced_at: new Date().toISOString(),
      }));
      const { error } = await sb
        .from("makrilltrade_articles_cache")
        .upsert(upserts, { onConflict: "article_id" });
      if (error) throw error;
      articleCount = upserts.length;
    }

    if (batches.length > 0) {
      const upserts = batches.map((b) => ({
        batch_id: b.batch_id,
        article_id: b.article_id,
        supplier_name: b.supplier_name ?? null,
        caught_at: b.caught_at ?? null,
        best_before: b.best_before ?? null,
        quantity_remaining: b.quantity_remaining,
        unit: b.unit ?? "kg",
        raw: b.raw ?? null,
        synced_at: new Date().toISOString(),
      }));
      const { error } = await sb
        .from("makrilltrade_batches_cache")
        .upsert(upserts, { onConflict: "batch_id" });
      if (error) throw error;
      batchCount = upserts.length;
    }

    return jsonResponse({
      ok: true,
      mode: "stub",
      articles: articleCount,
      batches: batchCount,
    });
  } catch (e) {
    if (e instanceof ValidationError) return errorResponse(e.message, 400);
    console.error("scomber-makrilltrade-sync error:", e);
    return errorResponse("Internal error", 500, String(e));
  }
});
