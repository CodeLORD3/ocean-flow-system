// POST /scomber-set-override
// Persists one or many price overrides (the morning dashboard "accept" button calls this).
// Body: { overrides: [{ article_id, store_id?, price_ore, channel?, set_by? }, ...] }

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

interface OverrideInput {
  article_id: string;
  store_id?: string | null;
  price_ore: number;
  channel?: string;
  set_by?: string;
  effective_date?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const body = await readJson(req);
    const overrides = Array.isArray(body.overrides) ? (body.overrides as OverrideInput[]) : null;
    if (!overrides || overrides.length === 0) {
      throw new ValidationError("overrides[] is required");
    }
    if (overrides.length > 500) throw new ValidationError("Max 500 overrides per call");

    const today = new Date().toISOString().slice(0, 10);
    const sb = getServiceClient();
    const setBy = typeof body.set_by === "string" ? body.set_by : null;

    const rows = overrides.map((o) => {
      const articleId = requireString(o.article_id, "article_id");
      const priceOre = requireNumber(o.price_ore, "price_ore");
      return {
        article_id: articleId,
        store_id: o.store_id ?? null,
        price_ore: Math.round(priceOre),
        channel: o.channel ?? "any",
        effective_date: o.effective_date ?? today,
        set_by: o.set_by ?? setBy,
      };
    });

    // Delete existing overrides for the same (article, store, channel, date) to avoid duplicates
    for (const r of rows) {
      await sb
        .from("price_overrides")
        .delete()
        .eq("article_id", r.article_id)
        .eq("effective_date", r.effective_date)
        .eq("channel", r.channel)
        .filter("store_id", r.store_id === null ? "is" : "eq", r.store_id);
    }

    const { data, error } = await sb.from("price_overrides").insert(rows).select("id");
    if (error) throw error;

    return jsonResponse({ ok: true, inserted: data?.length ?? 0 });
  } catch (e) {
    if (e instanceof ValidationError) return errorResponse(e.message, 400);
    console.error("scomber-set-override error:", e);
    return errorResponse("Internal error", 500, String(e));
  }
});
