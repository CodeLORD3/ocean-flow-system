/**
 * Webhook-prenumerationer i Shopify: visa och laga.
 *
 *   POST /shopify-webhooks           → listar prenumerationer för butiken
 *   POST /shopify-webhooks/ensure    → registrerar saknade topics
 *
 * Shopify raderar prenumerationer som svarar fel för många gånger, och en app
 * som installeras om tappar dem helt. Den här funktionen jämför butikens
 * prenumerationer mot de topics systemet faktiskt hanterar och skapar det som
 * saknas — pekande på shopify-order-webhook.
 *
 * Behörighet: inloggad personal (JWT valideras i koden).
 * Hemligheter: butikens Admin-token hämtas via shopify_shops/OAuth, aldrig i kod.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { adminToken, listShops, resolveShop, type ShopifyShop } from "../_shared/shopify-shops.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Topics systemet hanterar i shopify-order-webhook. */
const TOPICS = ["orders/create", "orders/paid", "orders/cancelled"];

function service(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function webhookAddress(): string {
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/shopify-order-webhook`;
}

async function shopifyFetch(
  shop: ShopifyShop,
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; body: any }> {
  const res = await fetch(`https://${shop.shop_domain}/admin/api/${shop.api_version}/${path}`, {
    ...init,
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 400) };
  }
  return { ok: res.ok, status: res.status, body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Endast POST" }, 405);

  const db = service();
  const auth = req.headers.get("Authorization") ?? "";
  const { data: userData } = await db.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (!userData?.user) return json({ ok: false, error: "Inloggning krävs" }, 401);

  const action = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "";
  let body: any = {};
  try {
    body = req.body ? await req.json() : {};
  } catch {
    body = {};
  }

  const shop = await resolveShop(db, { shop: body?.shop, shop_id: body?.shop_id });
  if (!shop) {
    const shops = await listShops(db);
    return json(
      {
        ok: false,
        error: "Ange vilken webbutik som ska kontrolleras",
        shops: shops.map((s) => ({ id: s.id, shop_domain: s.shop_domain, label: s.label })),
      },
      400,
    );
  }

  const token = await adminToken(db, shop);
  if (!token) {
    return json(
      {
        ok: false,
        needs_oauth: true,
        error: `Ingen Admin-token finns för ${shop.label}. Anslut butiken via OAuth först.`,
      },
      400,
    );
  }

  const address = webhookAddress();
  const list = await shopifyFetch(shop, token, "webhooks.json?limit=250");
  if (!list.ok) {
    return json(
      {
        ok: false,
        error:
          list.status === 401 || list.status === 403
            ? "Shopify nekade åtkomst till webhooks. Appen behöver behörighet att läsa/skriva webhook-prenumerationer."
            : `Shopify svarade ${list.status}: ${JSON.stringify(list.body).slice(0, 300)}`,
      },
      400,
    );
  }

  const existing: any[] = Array.isArray(list.body?.webhooks) ? list.body.webhooks : [];
  const summary = existing.map((w) => ({
    id: String(w.id),
    topic: String(w.topic ?? ""),
    address: String(w.address ?? ""),
    created_at: w.created_at ?? null,
    updated_at: w.updated_at ?? null,
    ours: String(w.address ?? "") === address,
  }));
  const missing = TOPICS.filter(
    (t) => !summary.some((w) => w.topic === t && w.ours),
  );

  if (action !== "ensure") {
    return json({
      ok: true,
      shop: shop.shop_domain,
      shop_label: shop.label,
      address,
      topics: TOPICS,
      webhooks: summary,
      missing,
      healthy: missing.length === 0,
    });
  }

  /* ---- Laga: skapa saknade prenumerationer ---- */
  const created: string[] = [];
  const failed: { topic: string; error: string }[] = [];
  for (const topic of missing) {
    const res = await shopifyFetch(shop, token, "webhooks.json", {
      method: "POST",
      body: JSON.stringify({ webhook: { topic, address, format: "json" } }),
    });
    if (res.ok && res.body?.webhook?.id) created.push(topic);
    else {
      const msg =
        res.body?.errors
          ? JSON.stringify(res.body.errors)
          : `Shopify svarade ${res.status}`;
      failed.push({ topic, error: String(msg).slice(0, 300) });
    }
  }

  const after = await shopifyFetch(shop, token, "webhooks.json?limit=250");
  const nowList: any[] = Array.isArray(after.body?.webhooks) ? after.body.webhooks : [];
  const stillMissing = TOPICS.filter(
    (t) => !nowList.some((w) => String(w.topic) === t && String(w.address) === address),
  );

  return json({
    ok: failed.length === 0,
    shop: shop.shop_domain,
    shop_label: shop.label,
    address,
    created,
    failed,
    missing: stillMissing,
    healthy: stillMissing.length === 0,
    note:
      created.length > 0
        ? `Nya prenumerationer signeras med appens API-hemlighet. Kontrollera att ${shop.webhook_secret_env} innehåller samma värde som appens client secret.`
        : undefined,
  });
});
