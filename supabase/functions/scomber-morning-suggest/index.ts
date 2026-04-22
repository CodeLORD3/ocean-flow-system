// POST /scomber-morning-suggest
// Computes suggested morning prices for every article × store.
// Uses scomber_pricing_rules + the oldest active batch (FIFO) to derive cost.
// Compares against the current effective price (override → default).
// No writes — pure suggestion. Manager approves via PUT /scomber-price-resolve overrides.

import {
  corsHeaders,
  errorResponse,
  getServiceClient,
  jsonResponse,
  readJson,
  ValidationError,
} from "../_shared/scomber.ts";

interface Suggestion {
  article_id: string;
  sku: string | null;
  name: string;
  unit: string;
  vat_rate: number;
  store_id: string;
  store_name: string;
  current_price_ore: number;
  current_source: "override" | "default";
  suggested_price_ore: number;
  change_ore: number;
  margin_percent: number | null;
  rationale: string;
  oldest_batch_id: string | null;
  cost_ore: number | null;
  strategy: string;
}

const round = (n: number) => Math.round(n);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const body = await readJson(req);
    const storeIds = Array.isArray(body.store_ids) ? (body.store_ids as string[]) : null;
    if (!storeIds || storeIds.length === 0) {
      throw new ValidationError("store_ids[] is required");
    }

    const sb = getServiceClient();
    const today = new Date().toISOString().slice(0, 10);

    // Load stores (for display names)
    const { data: stores } = await sb
      .from("stores")
      .select("id, name")
      .in("id", storeIds);
    const storeMap = new Map((stores ?? []).map((s: any) => [s.id, s.name as string]));

    // Load all active articles + their pricing rules
    const { data: articles, error: artErr } = await sb
      .from("makrilltrade_articles_cache")
      .select("article_id, sku, name, unit, vat_rate, default_price_ore, active");
    if (artErr) throw artErr;

    const activeArticles = (articles ?? []).filter((a: any) => a.active);
    if (activeArticles.length === 0) {
      return jsonResponse({ ok: true, suggestions: [], generated_at: new Date().toISOString() });
    }

    const { data: rules } = await sb
      .from("scomber_pricing_rules")
      .select("*")
      .in(
        "article_id",
        activeArticles.map((a: any) => a.article_id),
      );
    const ruleMap = new Map((rules ?? []).map((r: any) => [r.article_id, r]));

    // Load oldest batch per article (FIFO cost basis)
    const { data: batches } = await sb
      .from("makrilltrade_batches_cache")
      .select("batch_id, article_id, caught_at, raw, quantity_remaining")
      .gt("quantity_remaining", 0)
      .order("caught_at", { ascending: true, nullsFirst: false });

    const oldestBatchByArticle = new Map<string, any>();
    for (const b of batches ?? []) {
      if (!oldestBatchByArticle.has(b.article_id)) {
        oldestBatchByArticle.set(b.article_id, b);
      }
    }

    // Load existing overrides (for "current price")
    const { data: overrides } = await sb
      .from("price_overrides")
      .select("article_id, store_id, price_ore, channel, effective_date")
      .eq("effective_date", today)
      .in("channel", ["pos", "any", "morning"]);

    const overrideKey = (a: string, s: string) => `${a}::${s}`;
    const overrideMap = new Map<string, number>();
    for (const o of overrides ?? []) {
      // Prefer most-specific (store-bound) over store=null
      const k = overrideKey(o.article_id, o.store_id ?? "*");
      overrideMap.set(k, o.price_ore);
    }

    const suggestions: Suggestion[] = [];

    for (const article of activeArticles) {
      const rule = ruleMap.get(article.article_id);
      const batch = oldestBatchByArticle.get(article.article_id);

      // Try to read cost from batch.raw.purchase_price_ore (Makrilltrade convention)
      let costOre: number | null = null;
      if (batch?.raw && typeof batch.raw === "object") {
        const raw = batch.raw as Record<string, unknown>;
        if (typeof raw.purchase_price_ore === "number") costOre = raw.purchase_price_ore;
        else if (typeof raw.cost_ore === "number") costOre = raw.cost_ore;
      }

      for (const storeId of storeIds) {
        const storeName = storeMap.get(storeId) ?? storeId;

        // Resolve current price (override per store, then any-store override, then default)
        const currentOverride =
          overrideMap.get(overrideKey(article.article_id, storeId)) ??
          overrideMap.get(overrideKey(article.article_id, "*"));
        const currentPriceOre = currentOverride ?? article.default_price_ore;
        const currentSource: "override" | "default" =
          currentOverride !== undefined ? "override" : "default";

        // Compute suggested price
        let suggestedOre = currentPriceOre;
        let rationale = "Inget regelverk – nuvarande pris kvar";
        let strategy = "none";

        if (rule) {
          strategy = rule.strategy;
          const multiplier =
            (rule.store_multiplier as Record<string, number> | null)?.[storeId] ?? 1;

          if (rule.strategy === "fixed" && rule.fixed_price_ore != null) {
            suggestedOre = rule.fixed_price_ore;
            rationale = `Fast pris ${(rule.fixed_price_ore / 100).toFixed(2)} kr`;
          } else if (rule.strategy === "markup" && rule.markup_percent != null && costOre != null) {
            suggestedOre = round(costOre * (1 + rule.markup_percent / 100) * multiplier);
            const mult = multiplier !== 1 ? ` × ${multiplier} (butik ${storeName})` : "";
            rationale = `Inköp ${(costOre / 100).toFixed(2)} kr + ${rule.markup_percent}% påslag${mult}`;
          } else if (
            rule.strategy === "target-margin" &&
            rule.target_margin_percent != null &&
            costOre != null
          ) {
            const m = rule.target_margin_percent / 100;
            suggestedOre = round((costOre / (1 - m)) * multiplier);
            const mult = multiplier !== 1 ? ` × ${multiplier} (butik ${storeName})` : "";
            rationale = `Inköp ${(costOre / 100).toFixed(2)} kr → ${rule.target_margin_percent}% bruttomarginal${mult}`;
          } else if (costOre == null) {
            rationale = "Saknar inköpspris i batchdata";
          }

          if (rule.min_price_ore != null && suggestedOre < rule.min_price_ore) {
            suggestedOre = rule.min_price_ore;
            rationale += " (golvat vid min)";
          }
          if (rule.max_price_ore != null && suggestedOre > rule.max_price_ore) {
            suggestedOre = rule.max_price_ore;
            rationale += " (kapat vid max)";
          }
        }

        const marginPercent =
          costOre != null && suggestedOre > 0
            ? Number((((suggestedOre - costOre) / suggestedOre) * 100).toFixed(1))
            : null;

        suggestions.push({
          article_id: article.article_id,
          sku: article.sku,
          name: article.name,
          unit: article.unit,
          vat_rate: Number(article.vat_rate),
          store_id: storeId,
          store_name: storeName,
          current_price_ore: currentPriceOre,
          current_source: currentSource,
          suggested_price_ore: suggestedOre,
          change_ore: suggestedOre - currentPriceOre,
          margin_percent: marginPercent,
          rationale,
          oldest_batch_id: batch?.batch_id ?? null,
          cost_ore: costOre,
          strategy,
        });
      }
    }

    return jsonResponse({
      ok: true,
      generated_at: new Date().toISOString(),
      suggestions,
    });
  } catch (e) {
    if (e instanceof ValidationError) return errorResponse(e.message, 400);
    console.error("scomber-morning-suggest error:", e);
    return errorResponse("Internal error", 500, String(e));
  }
});
