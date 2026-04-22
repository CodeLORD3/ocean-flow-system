// POST /scomber-price-resolve
// Resolves the effective price for one or more articles given
// (article_id, store_id?, channel, customer_tier_id?, date?).
// Picks the most specific matching override; falls back to default_price_ore.

import {
  corsHeaders,
  errorResponse,
  getServiceClient,
  jsonResponse,
  readJson,
  requireString,
  ValidationError,
} from "../_shared/scomber.ts";

interface ResolveItem {
  article_id: string;
  store_id?: string | null;
  channel?: string;
  customer_tier_id?: string | null;
  effective_date?: string;
}

interface ResolvedPrice {
  article_id: string;
  price_ore: number;
  source: "override" | "default";
  override_id?: string;
  vat_rate: number;
  unit: string;
  name: string;
}

const VALID_CHANNELS = new Set(["pos", "b2b", "morning", "any"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const body = await readJson(req);
    const items = Array.isArray(body.items) ? body.items as ResolveItem[] : null;
    if (!items || items.length === 0) {
      throw new ValidationError("items[] is required");
    }
    if (items.length > 200) throw new ValidationError("Max 200 items per call");

    const sb = getServiceClient();
    const today = new Date().toISOString().slice(0, 10);
    const results: ResolvedPrice[] = [];

    for (const item of items) {
      const articleId = requireString(item.article_id, "article_id");
      const channel = item.channel ?? "any";
      if (!VALID_CHANNELS.has(channel)) {
        throw new ValidationError(`Invalid channel "${channel}"`);
      }
      const date = item.effective_date ?? today;

      const { data: article, error: artErr } = await sb
        .from("makrilltrade_articles_cache")
        .select("article_id, name, unit, vat_rate, default_price_ore, active")
        .eq("article_id", articleId)
        .maybeSingle();
      if (artErr) throw artErr;
      if (!article) {
        throw new ValidationError(`Article ${articleId} not found in cache`);
      }

      // Try most specific → least specific override
      const { data: overrides, error: ovErr } = await sb
        .from("price_overrides")
        .select("id, store_id, channel, customer_tier_id, price_ore")
        .eq("article_id", articleId)
        .eq("effective_date", date)
        .in("channel", [channel, "any"]);
      if (ovErr) throw ovErr;

      const score = (o: {
        store_id: string | null;
        channel: string;
        customer_tier_id: string | null;
      }) =>
        (o.store_id === item.store_id ? 4 : o.store_id === null ? 0 : -100) +
        (o.channel === channel ? 2 : 0) +
        (o.customer_tier_id === (item.customer_tier_id ?? null) ? 1
          : o.customer_tier_id === null ? 0 : -100);

      const best = (overrides ?? [])
        .map((o) => ({ o, s: score(o) }))
        .filter((x) => x.s >= 0)
        .sort((a, b) => b.s - a.s)[0];

      results.push({
        article_id: article.article_id,
        name: article.name,
        unit: article.unit,
        vat_rate: Number(article.vat_rate),
        price_ore: best ? best.o.price_ore : article.default_price_ore,
        source: best ? "override" : "default",
        override_id: best?.o.id,
      });
    }

    return jsonResponse({ ok: true, results });
  } catch (e) {
    if (e instanceof ValidationError) return errorResponse(e.message, 400);
    console.error("scomber-price-resolve error:", e);
    return errorResponse("Internal error", 500, String(e));
  }
});
