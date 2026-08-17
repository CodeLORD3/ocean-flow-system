/**
 * Backfyllnad av webbordrar från Shopify.
 *
 * Hämtar öppna, betalda ordrar via Shopify Admin API (REST orders.json,
 * status=open, financial_status=paid, paginerat med Link-huvudets page_info)
 * och lägger varje order i den BEFINTLIGA webhook-kön (shopify_webhook_events)
 * med topic orders/create och exakt samma payloadformat som en riktig webhook.
 *
 * Idempotens: kön har order-id PLUS topic som nyckel, så en order som redan
 * tagits emot blir "duplikat" och skapar aldrig en andra kundorder. Funktionen
 * är därför säker att köra hur många gånger som helst.
 *
 * Behörighet: endast inloggad personal (JWT valideras i koden).
 * Hemligheter: SHOPIFY_ADMIN_TOKEN och SHOPIFY_SHOP_DOMAIN — aldrig i koden.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { adminToken, listShops, mintClientCredentialsToken, resolveShop } from "../_shared/shopify-shops.ts";

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

function service(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** Nästa sida ur Shopifys Link-huvud (cursor-paginering). */
function nextPageInfo(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    if (!/rel="next"/.test(part)) continue;
    const url = part.match(/<([^>]+)>/)?.[1];
    if (!url) continue;
    return new URL(url).searchParams.get("page_info");
  }
  return null;
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Endast POST" }, 405);

  const db = service();

  /* ---- Behörighet: inloggad personal ---- */
  const auth = req.headers.get("Authorization") ?? "";
  const { data: userData } = await db.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (!userData?.user) return json({ ok: false, error: "Inloggning krävs" }, 401);

  let body: any = {};
  try {
    body = req.body ? await req.json() : {};
  } catch {
    body = {};
  }
  const maxPages = Math.min(Math.max(Number(body?.max_pages ?? 10), 1), 50);

  /* ---- Vilken webbutik? Backfyllnaden körs alltid per butik ---- */
  const shop = await resolveShop(db, { shop: body?.shop, shop_id: body?.shop_id });
  if (!shop) {
    const shops = await listShops(db);
    return json(
      {
        ok: false,
        error: "Ange vilken webbutik som ska backfyllas",
        shops: shops.map((s) => ({ id: s.id, shop_domain: s.shop_domain, label: s.label })),
      },
      400,
    );
  }
  const domain = shop.shop_domain;
  const API_VERSION = shop.api_version;
  const token = await adminToken(db, shop);
  if (!token) {
    // Visa exakt varför client_credentials-flödet inte gav någon token.
    const minted = await mintClientCredentialsToken(db, shop);
    return json(
      {
        ok: false,
        error:
          minted.error ??
          `Ingen Admin-token finns för ${shop.label}. Lägg hemligheten ${shop.admin_token_env}, eller anslut butiken via OAuth.`,
        needs_oauth: true,
      },
      400,
    );
  }



  const result = {
    ok: true,
    fetched: 0,
    queued: 0,
    duplicates: 0,
    errors: 0,
    unsorted: 0,
    pages: 0,
    shop: domain,
    shop_label: shop.label,
    messages: [] as string[],
  };

  let pageInfo: string | null = null;

  try {
    for (let page = 0; page < maxPages; page++) {
      const url = new URL(`https://${domain}/admin/api/${API_VERSION}/orders.json`);
      url.searchParams.set("limit", "250");
      if (pageInfo) {
        // Vid cursor-paginering får bara limit och page_info skickas med.
        url.searchParams.set("page_info", pageInfo);
      } else {
        url.searchParams.set("status", "open");
        url.searchParams.set("financial_status", "paid");
      }

      const res = await fetch(url.toString(), {
        headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
      });

      if (res.status === 401 || res.status === 403) {
        return json(
          {
            ...result,
            ok: false,
            error:
              "Shopify nekade åtkomst (401/403). Token behöver läsbehörighet för ordrar: read_orders (plus read_all_orders om ordrar äldre än 60 dagar ska hämtas).",
          },
          400,
        );
      }
      if (!res.ok) {
        const text = await res.text();
        return json(
          { ...result, ok: false, error: `Shopify svarade ${res.status}: ${text.slice(0, 300)}` },
          400,
        );
      }

      const data = await res.json();
      const orders: any[] = Array.isArray(data?.orders) ? data.orders : [];
      result.pages++;
      result.fetched += orders.length;

      for (const order of orders) {
        const shopifyOrderId = order?.id != null ? String(order.id) : null;
        if (!shopifyOrderId) {
          result.errors++;
          continue;
        }

        // Redan mottagen som orders/create? Räknas som duplikat, inget köas.
        const { data: existing } = await db
          .from("shopify_webhook_events")
          .select("id")
          .eq("shopify_order_id", shopifyOrderId)
          .eq("topic", "orders/create")
          .eq("shop_domain", domain)
          .in("status", ["skapad", "duplikat", "osorterad", "avbokad", "avbokad_larm"])
          .limit(1);
        if ((existing || []).length) {
          result.duplicates++;
          continue;
        }

        const raw = JSON.stringify(order);
        const { data: queued, error: qErr } = await db
          .from("shopify_webhook_events")
          .insert({
            topic: "orders/create",
            hmac_valid: true,
            status: "koad",
            raw_body: raw,
            payload: order,
            shopify_order_id: shopifyOrderId,
            shopify_order_number: order?.name ?? order?.order_number ?? null,
            shop_domain: domain,
            shop_id: shop.id,
          })
          .select("id")
          .single();

        if (qErr || !queued) {
          result.errors++;
          result.messages.push(`${order?.name ?? shopifyOrderId}: kön kunde inte skrivas`);
          continue;
        }

        /**
         * Bearbetningen görs av webhook-funktionen så att backfyllnaden och
         * realtidsflödet delar exakt samma kodväg. Personalens token skickas
         * med — /reprocess kräver inloggning.
         */
        const fnRes = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/shopify-order-webhook/reprocess`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: auth,
              apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
            },
            body: JSON.stringify({ event_id: queued.id }),
          },
        );
        const out = await fnRes.json().catch(() => ({}));
        const status = String((out as any)?.status ?? "");
        if (status === "skapad") result.queued++;
        else if (status === "duplikat") result.duplicates++;
        else if (status === "osorterad") {
          result.unsorted++;
          result.messages.push(`${order?.name ?? shopifyOrderId}: butiken kunde inte avgöras`);
        } else {
          result.errors++;
          result.messages.push(
            `${order?.name ?? shopifyOrderId}: ${(out as any)?.error ?? "bearbetningen misslyckades"}`,
          );
        }
      }

      pageInfo = nextPageInfo(res.headers.get("link") ?? res.headers.get("Link"));
      if (!pageInfo) break;
    }
  } catch (e) {
    return json(
      { ...result, ok: false, error: e instanceof Error ? e.message : String(e) },
      500,
    );
  }

  return json(result);
});
