// GET /partner-feed — läs-API för externa partners (pris, sortiment, lagerstatus).
// Bygger svaret genom att välja fält explicit; inga kostnader, partier,
// leverantörer eller antal lämnar funktionen.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const CACHE_MS = 10 * 60 * 1000;
const RATE_LIMIT = 60;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function all<T>(build: (from: number, to: number) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

const norm = (s: string | null | undefined) => String(s ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();

async function buildFeed(storeIds: string[]) {
  const { data: stores } = await sb.from("stores")
    .select("id, name, store_code, slug, currency, inventory_location_id, active")
    .in("id", storeIds.length ? storeIds : ["00000000-0000-0000-0000-000000000000"]);
  const now = new Date().toISOString();

  const products = await all<any>((f, t) => sb.from("products")
    .select("id, sku, name, category, unit")
    .eq("active", true).eq("dold_i_partnerfeed", false).not("sku", "is", null).order("id").range(f, t));
  const prodIds = new Set(products.map((p) => p.id));

  const { data: cats } = await sb.from("categories").select("name, visible_store_ids");
  const catRule = new Map((cats ?? []).map((c: any) => [norm(c.name), (c.visible_store_ids ?? []) as string[]]));

  const { data: lists } = await sb.from("pos_price_lists").select("id, currency_code").eq("is_active", true);
  const priceByCurrency = new Map<string, Map<string, number>>();
  for (const l of lists ?? []) {
    const cur = String(l.currency_code).toUpperCase();
    if (priceByCurrency.has(cur)) continue;
    const items = await all<any>((f, t) => sb.from("pos_price_list_items")
      .select("product_id, price_inc_vat, valid_from").eq("price_list_id", l.id).lte("valid_from", now)
      .order("valid_from", { ascending: false }).order("product_id").range(f, t));
    const m = new Map<string, number>();
    for (const i of items) if (!m.has(i.product_id) && i.price_inc_vat != null) m.set(i.product_id, Number(i.price_inc_vat));
    priceByCurrency.set(cur, m);
  }

  const shops = [];
  for (const s of (stores ?? []).filter((s: any) => s.active).sort((a: any, b: any) => a.name.localeCompare(b.name, "sv"))) {
    const currency = String(s.currency ?? "SEK").toUpperCase();
    const prices = priceByCurrency.get(currency) ?? new Map();
    const qty = new Map<string, number>();
    if (s.inventory_location_id) {
      const rows = await all<any>((f, t) => sb.from("product_stock_locations").select("product_id, quantity")
        .eq("location_id", s.inventory_location_id).order("id").range(f, t));
      for (const r of rows) qty.set(r.product_id, (qty.get(r.product_id) ?? 0) + Number(r.quantity ?? 0));
    }
    const res = await all<any>((f, t) => sb.from("customer_order_lines")
      .select("product_id, reserved_quantity, customer_orders!inner(store_id, status)")
      .eq("reservation_status", "reserverad").gt("reserved_quantity", 0).eq("customer_orders.store_id", s.id)
      .order("id").range(f, t));
    for (const r of res) {
      if (r.customer_orders?.status === "avbruten" || !r.product_id) continue;
      qty.set(r.product_id, (qty.get(r.product_id) ?? 0) - Number(r.reserved_quantity ?? 0));
    }
    const items = [];
    for (const p of products) {
      if (!prodIds.has(p.id) || !prices.has(p.id)) continue;
      const rule = catRule.get(norm(p.category));
      if (rule && rule.length > 0 && !rule.includes(s.id)) continue;
      items.push({
        sku: String(p.sku),
        name: String(p.name),
        category: p.category ? String(p.category) : "",
        price: Math.round(prices.get(p.id)! * 100) / 100,
        unit: String(p.unit ?? "st").toLowerCase(),
        available: (qty.get(p.id) ?? 0) > 0,
      });
    }
    items.sort((a, b) => a.category.localeCompare(b.category, "sv") || a.name.localeCompare(b.name, "sv"));
    shops.push({ shopId: String(s.store_code ?? s.slug), currency, items });
  }
  return { generated_at: new Date().toISOString(), shops };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  const log = (partner_id: string | null, http_status: number) =>
    sb.from("feed_hamtningar").insert({ partner_id, ip, http_status });

  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  const m = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(\S+)$/i);
  if (!m) { await log(null, 401); return json({ error: "unauthorized" }, 401); }

  const { data: partner } = await sb.from("feed_partners")
    .select("id, aktiv, butiksurval, cache_json, cache_byggd")
    .eq("api_nyckel_hash", await sha256(m[1])).maybeSingle();
  if (!partner || !partner.aktiv) { await log(null, 401); return json({ error: "unauthorized" }, 401); }

  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await sb.from("feed_hamtningar").select("id", { count: "exact", head: true })
    .eq("partner_id", partner.id).gte("tidpunkt", since);
  if ((count ?? 0) >= RATE_LIMIT) { await log(partner.id, 429); return json({ error: "rate_limited" }, 429); }

  try {
    let feed = partner.cache_json;
    if (!feed || !partner.cache_byggd || Date.now() - new Date(partner.cache_byggd).getTime() > CACHE_MS) {
      feed = await buildFeed(partner.butiksurval ?? []);
      await sb.from("feed_partners").update({ cache_json: feed, cache_byggd: feed.generated_at }).eq("id", partner.id);
    }
    await log(partner.id, 200);
    await sb.from("feed_partners").update({ senast_hamtad: new Date().toISOString() }).eq("id", partner.id);
    return json(feed, 200);
  } catch (e) {
    console.error("partner-feed", e);
    await log(partner.id, 500);
    return json({ error: "internal_error" }, 500);
  }
});
