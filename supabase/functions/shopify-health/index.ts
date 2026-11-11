/**
 * Daglig hälsokontroll av Shopify-butikerna.
 *
 * För varje aktiv butik i shopify_shops:
 *   1. Prenumerationer: orders/create, orders/paid och orders/cancelled ska
 *      peka på shopify-order-webhook. Saknas någon läggs den tillbaka.
 *   2. Missade order: butikens order från de senaste 72 timmarna jämförs mot
 *      customer_orders och webhook-kön. En betald order som saknas läggs i kön
 *      och bearbetas av shopify-order-webhook/reprocess — samma kodväg som en
 *      riktig webhook, så dubblettkontrollen alltid gäller.
 *
 * Tystnad är normalt (inga order = inga webhooks), så kontoret får notis
 * BARA när något lades tillbaka, hämtades eller inte gick att kontrollera.
 * En notis per butik och dag. Loggen visar bara ordernummer, aldrig kund-
 * uppgifter eller nycklar.
 *
 * Behörighet: schemalagt anrop (LOVABLE_CRON_SECRET) eller inloggad admin.
 * Body: { dry_run?: boolean, hours?: number }
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticateCronRequest } from "../_shared/cron-auth.ts";
import { adminToken, listShops, type ShopifyShop } from "../_shared/shopify-shops.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const TOPICS = ["orders/create", "orders/paid", "orders/cancelled"];
const DONE = ["skapad", "duplikat", "osorterad", "avbokad", "avbokad_larm"];
const PENDING = ["koad", "bearbetar", "fel"];
const PAID = ["paid", "partially_refunded"];

function service(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

const webhookAddress = () => `${Deno.env.get("SUPABASE_URL")}/functions/v1/shopify-order-webhook`;

async function shopifyFetch(shop: ShopifyShop, token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`https://${shop.shop_domain}/admin/api/${shop.api_version}/${path}`, {
    ...init,
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 300) }; }
  return { ok: res.ok, status: res.status, body, link: res.headers.get("link") };
}

function nextPageInfo(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    if (!/rel="next"/.test(part)) continue;
    const url = part.match(/<([^>]+)>/)?.[1];
    if (url) return new URL(url).searchParams.get("page_info");
  }
  return null;
}

/** Inloggad admin eller plattformsadmin, prövat serversidigt. */
async function isAdmin(db: SupabaseClient, req: Request): Promise<boolean> {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return false;
  const { data } = await db.auth.getUser(jwt);
  const uid = data?.user?.id;
  if (!uid) return false;
  const { data: roles } = await db.from("user_roles").select("role").eq("user_id", uid);
  return (roles || []).some((r: any) => ["admin", "platform_admin"].includes(String(r.role)));
}

type ShopResult = {
  shop: string;
  label: string;
  ok: boolean;
  subscriptions_ok: number;
  restored: string[];
  restore_failed: string[];
  orders_checked: number;
  recovered: string[];
  recover_failed: string[];
  pending: string[];
  unpaid_skipped: number;
  error?: string;
};

async function checkShop(db: SupabaseClient, shop: ShopifyShop, hours: number, dryRun: boolean): Promise<ShopResult> {
  const r: ShopResult = {
    shop: shop.shop_domain, label: shop.label, ok: true, subscriptions_ok: 0, restored: [],
    restore_failed: [], orders_checked: 0, recovered: [], recover_failed: [], pending: [], unpaid_skipped: 0,
  };
  const token = await adminToken(db, shop);
  if (!token) return { ...r, ok: false, error: "Ingen Admin-nyckel för butiken" };

  /* ---- 1. Prenumerationer ---- */
  const address = webhookAddress();
  const list = await shopifyFetch(shop, token, "webhooks.json?limit=250");
  if (!list.ok) return { ...r, ok: false, error: `Shopify svarade ${list.status} på prenumerationslistan` };
  const hooks: any[] = Array.isArray(list.body?.webhooks) ? list.body.webhooks : [];
  for (const topic of TOPICS) {
    if (hooks.some((w) => String(w.topic) === topic && String(w.address) === address)) {
      r.subscriptions_ok++;
      continue;
    }
    if (dryRun) { r.restored.push(`${topic} (saknas, torrkörning)`); continue; }
    const res = await shopifyFetch(shop, token, "webhooks.json", {
      method: "POST",
      body: JSON.stringify({ webhook: { topic, address, format: "json" } }),
    });
    if (res.ok && res.body?.webhook?.id) r.restored.push(topic);
    else { r.restore_failed.push(`${topic} (${res.status})`); r.ok = false; }
  }

  /* ---- 2. Missade order ---- */
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const orders: any[] = [];
  let pageInfo: string | null = null;
  for (let page = 0; page < 5; page++) {
    const q = new URLSearchParams({ limit: "250" });
    if (pageInfo) q.set("page_info", pageInfo);
    else { q.set("status", "any"); q.set("created_at_min", since); }
    const res = await shopifyFetch(shop, token, `orders.json?${q}`);
    if (!res.ok) return { ...r, ok: false, error: `Shopify svarade ${res.status} på orderlistan` };
    orders.push(...(Array.isArray(res.body?.orders) ? res.body.orders : []));
    pageInfo = nextPageInfo(res.link);
    if (!pageInfo) break;
  }
  r.orders_checked = orders.length;
  if (!orders.length) return r;

  const ids = orders.map((o) => String(o.id));
  const { data: existing } = await db.from("customer_orders").select("shopify_order_id").in("shopify_order_id", ids);
  const inOrders = new Set((existing || []).map((x: any) => String(x.shopify_order_id)));
  const { data: events } = await db
    .from("shopify_webhook_events")
    .select("shopify_order_id, status")
    .eq("shop_domain", shop.shop_domain)
    .in("shopify_order_id", ids)
    .in("topic", ["orders/create", "orders/paid"]);
  const evStatus = new Map<string, string[]>();
  for (const e of events || []) {
    const k = String((e as any).shopify_order_id);
    evStatus.set(k, [...(evStatus.get(k) || []), String((e as any).status)]);
  }

  for (const order of orders) {
    const id = String(order.id);
    const name = String(order?.name ?? order?.order_number ?? id);
    if (inOrders.has(id)) continue;
    const st = evStatus.get(id) || [];
    if (st.some((s) => DONE.includes(s))) continue;
    if (st.some((s) => PENDING.includes(s))) { r.pending.push(name); continue; }
    if (order?.cancelled_at || !PAID.includes(String(order?.financial_status ?? ""))) { r.unpaid_skipped++; continue; }
    if (dryRun) { r.recovered.push(`${name} (saknas, torrkörning)`); continue; }

    const { data: queued, error: qErr } = await db
      .from("shopify_webhook_events")
      .insert({
        topic: "orders/create",
        hmac_valid: true,
        status: "koad",
        raw_body: JSON.stringify(order),
        payload: order,
        shopify_order_id: id,
        shopify_order_number: order?.name ?? order?.order_number ?? null,
        shop_domain: shop.shop_domain,
        shop_id: shop.id,
      })
      .select("id")
      .single();
    if (qErr || !queued) { r.recover_failed.push(name); r.ok = false; continue; }

    const fnRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/shopify-order-webhook/reprocess`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("LOVABLE_CRON_SECRET") ?? ""}`,
      },
      body: JSON.stringify({ event_id: queued.id }),
    });
    const out: any = await fnRes.json().catch(() => ({}));
    if (["skapad", "duplikat", "osorterad"].includes(String(out?.status ?? ""))) r.recovered.push(name);
    else { r.recover_failed.push(name); r.ok = false; }
  }
  return r;
}

function summary(r: ShopResult): string {
  if (r.error) return `${r.label}: kontrollen misslyckades – ${r.error}`.slice(0, 300);
  const parts = [`${r.label}: ${r.subscriptions_ok} av ${TOPICS.length} prenumerationer fanns`];
  if (r.restored.length) parts.push(`lade tillbaka ${r.restored.join(", ")}`);
  if (r.restore_failed.length) parts.push(`kunde inte lägga tillbaka ${r.restore_failed.join(", ")}`);
  parts.push(`${r.orders_checked} order kontrollerade`);
  if (r.recovered.length) parts.push(`hämtade missade ${r.recovered.join(", ")}`);
  if (r.recover_failed.length) parts.push(`kunde inte hämta ${r.recover_failed.join(", ")}`);
  if (r.pending.length) parts.push(`väntar i kön ${r.pending.join(", ")}`);
  if (!r.restored.length && !r.recovered.length && !r.recover_failed.length && !r.restore_failed.length) {
    parts.push("0 missade order");
  }
  return parts.join(" · ").slice(0, 300);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Endast POST" }, 405);

  const db = service();
  const cronDenied = authenticateCronRequest(req);
  if (cronDenied && !(await isAdmin(db, req))) {
    return json({ ok: false, error: "Behörighet saknas" }, 401);
  }
  const via = cronDenied ? "admin" : "schema";

  let body: any = {};
  try { body = req.body ? await req.json() : {}; } catch { body = {}; }
  const dryRun = body?.dry_run === true;
  const hours = Math.min(Math.max(Number(body?.hours ?? 72), 1), 24 * 14);

  const day = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
  const results: ShopResult[] = [];
  for (const shop of await listShops(db)) {
    const t0 = Date.now();
    let r: ShopResult;
    try {
      r = await checkShop(db, shop, hours, dryRun);
    } catch (e) {
      r = {
        shop: shop.shop_domain, label: shop.label, ok: false, subscriptions_ok: 0, restored: [], restore_failed: [],
        orders_checked: 0, recovered: [], recover_failed: [], pending: [], unpaid_skipped: 0,
        error: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200),
      };
    }
    results.push(r);
    const text = summary(r);
    const acted = r.restored.length > 0 || r.recovered.length > 0;
    await db.from("integration_log").insert({
      kalla: "shopify-health",
      action: dryRun ? "torrkorning" : "daglig_kontroll",
      butik: shop.label,
      av: via,
      data_sammanfattning: text,
      result: !r.ok ? "fel" : acted ? "granskning" : "ok",
      error: r.error ?? null,
      duration_ms: Date.now() - t0,
      svar: { ...r, dry_run: dryRun, hours },
    });
    if (!dryRun && (!r.ok || acted)) {
      // En notis per butik och dag; unikt index på dedupe_key stoppar dubbletter (23505).
      await db.from("notifications").insert({
        portal: "wholesale",
        target_page: "/system-status",
        message: `Shopify-kontroll: ${text}`.slice(0, 500),
        entity_type: "shopify_health",
        dedupe_key: `shopify_health:${shop.shop_domain}:${day}`,
      });
    }
  }
  return json({ ok: results.every((r) => r.ok), dry_run: dryRun, hours, results });
});
