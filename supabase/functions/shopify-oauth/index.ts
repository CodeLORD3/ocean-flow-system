/**
 * Shopify OAuth 2.0 (offline access token).
 *
 * Dev Dashboard-appar får inga shpat_-tokens längre, så butikens permanenta
 * Admin-token hämtas via OAuth:
 *
 *   POST /shopify-oauth/start   (inloggad personal)  → returnerar authorize-URL
 *   GET  /shopify-oauth/callback (Shopify)           → byter code mot token
 *   GET  /shopify-oauth/status  (inloggad personal)  → visar om token finns
 *
 * Hemligheter per butik: SHOPIFY_CH_API_KEY / SHOPIFY_CH_API_SECRET för
 * Schweiz, SHOPIFY_SE_API_KEY / SHOPIFY_SE_API_SECRET för Sverige. Saknas de
 * används de gamla enbutiksnycklarna SHOPIFY_API_KEY / SHOPIFY_API_SECRET.
 * Prefixet läses ur shopify_shops.admin_token_env. Token lagras i
 * shopify_oauth_tokens och returneras aldrig till klienten.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { apiKey, apiSecret, configuredShop, shopDomain } from "../_shared/shopify-admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SCOPES = "read_orders,read_customers,read_locations";

/**
 * Klientuppgifter för den butik anslutningen gäller. Varje webbutik är en egen
 * Shopify-app med egna nycklar, så prefixet hämtas ur butiksraden
 * (SHOPIFY_CH_ADMIN_TOKEN → SHOPIFY_CH_API_KEY / SHOPIFY_CH_API_SECRET).
 */
async function credentialsFor(
  db: SupabaseClient,
  shop: string,
): Promise<{ clientId: string; clientSecret: string; envNames: string }> {
  let prefix = "";
  if (shop) {
    const { data } = await db
      .from("shopify_shops")
      .select("admin_token_env")
      .eq("shop_domain", shop)
      .maybeSingle();
    const m = String((data as any)?.admin_token_env || "").match(/^SHOPIFY_([A-Z0-9]+)_ADMIN_TOKEN$/);
    if (m) prefix = `SHOPIFY_${m[1]}_`;
  }
  // Städa värdet: klipp bort mellanslag och ett eventuellt "-<tidsstämpel>"-suffix
  // som kan följa med vid kopiering (Shopify-nycklar är 32 hex-tecken).
  const clean = (v: string) => v.trim().replace(/^["']|["']$/g, "").replace(/-\d{6,}$/, "");
  const scoped = {
    id: prefix ? clean(Deno.env.get(`${prefix}API_KEY`) ?? "") : "",
    secret: prefix ? clean(Deno.env.get(`${prefix}API_SECRET`) ?? "") : "",
  };
  if (scoped.id && scoped.secret) {
    return {
      clientId: scoped.id,
      clientSecret: scoped.secret,
      envNames: `${prefix}API_KEY och ${prefix}API_SECRET`,
    };
  }
  return {
    clientId: apiKey(),
    clientSecret: apiSecret(),
    envNames: prefix ? `${prefix}API_KEY och ${prefix}API_SECRET` : "SHOPIFY_API_KEY och SHOPIFY_API_SECRET",
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const html = (title: string, message: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="sv"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;background:#0b1220;color:#e6edf7;display:grid;place-items:center;height:100vh;margin:0}
div{max-width:34rem;padding:2rem;border:1px solid #1e2a44;border-radius:12px;background:#0f1830}
h1{font-size:1.1rem;margin:0 0 .5rem}p{margin:0;color:#9fb0cc;line-height:1.5}</style></head>
<body><div><h1>${title}</h1><p>${message}</p></div></body></html>`,
    { status, headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } },
  );

function service(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function functionBaseUrl(): string {
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/shopify-oauth`;
}

/** Konstant-tidsjämförelse av hex-strängar. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verifierar Shopifys hmac-parameter på callback-URL:en. */
async function verifyQueryHmac(url: URL, secret: string): Promise<boolean> {
  const params = new URLSearchParams(url.search);
  const hmac = params.get("hmac") ?? "";
  if (!hmac) return false;
  params.delete("hmac");
  params.delete("signature");
  const message = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return safeEqual(hex, hmac.toLowerCase());
}

/** Bara .myshopify.com-domäner får användas. */
function isValidShop(shop: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const db = service();

  /* ------------------------------------------------------------ callback */
  if (action === "callback") {
    const shop = shopDomain(url.searchParams.get("shop") ?? "");
    const code = url.searchParams.get("code") ?? "";
    const state = url.searchParams.get("state") ?? "";
    if (!isValidShop(shop) || !code || !state) {
      return html("Ogiltig återkoppling", "Shopify skickade ofullständiga uppgifter.", 400);
    }
    const { clientId, clientSecret, envNames } = await credentialsFor(db, shop);
    if (!clientId || !clientSecret) {
      return html("Konfiguration saknas", `${envNames} måste vara sparade.`, 400);
    }
    if (!(await verifyQueryHmac(url, clientSecret))) {
      return html("Signaturen stämmer inte", "Anropet kunde inte verifieras mot Shopify.", 401);
    }

    // state måste finnas och konsumeras exakt en gång
    const { data: stateRow } = await db
      .from("shopify_oauth_states")
      .select("state, shop, created_at")
      .eq("state", state)
      .maybeSingle();
    if (!stateRow || stateRow.shop !== shop) {
      return html("Sessionen gick inte att verifiera", "Starta anslutningen på nytt från Systemstatus.", 401);
    }
    await db.from("shopify_oauth_states").delete().eq("state", state);
    if (Date.now() - new Date(stateRow.created_at as string).getTime() > 15 * 60 * 1000) {
      return html("Anslutningen tog för lång tid", "Starta anslutningen på nytt från Systemstatus.", 401);
    }

    const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });
    if (!res.ok) {
      const text = await res.text();
      return html("Shopify nekade tokenbytet", `Svar ${res.status}: ${text.slice(0, 200)}`, 400);
    }
    const payload = await res.json();
    const accessToken = payload?.access_token;
    if (!accessToken) return html("Ingen token mottogs", "Shopify svarade utan access_token.", 400);

    const { error } = await db.from("shopify_oauth_tokens").upsert(
      {
        shop,
        access_token: accessToken,
        scope: payload?.scope ?? null,
        access_mode: "offline",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "shop" },
    );
    if (error) return html("Token kunde inte sparas", error.message, 500);

    return html(
      "Shopify är anslutet",
      `Butiken ${shop} är kopplad med behörigheterna ${payload?.scope ?? SCOPES}. Du kan stänga fönstret och köra hämtningen av ordrar.`,
    );
  }

  /* -------------------------------------------- start / status (personal) */
  const auth = req.headers.get("Authorization") ?? "";
  const { data: userData } = await db.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (!userData?.user) return json({ ok: false, error: "Inloggning krävs" }, 401);

  if (action === "status") {
    const shop = shopDomain(url.searchParams.get("shop") || configuredShop());
    const { clientId, clientSecret } = await credentialsFor(db, shop);
    const { data } = await db
      .from("shopify_oauth_tokens")
      .select("shop, scope, access_mode, updated_at")
      .eq("shop", shop)
      .maybeSingle();
    return json({
      ok: true,
      shop,
      connected: Boolean(data),
      scope: data?.scope ?? null,
      access_mode: data?.access_mode ?? null,
      updated_at: data?.updated_at ?? null,
      redirect_uri: `${functionBaseUrl()}/callback`,
      has_credentials: Boolean(clientId && clientSecret),
    });
  }

  if (action === "start") {
    let body: any = {};
    try {
      body = req.body ? await req.json() : {};
    } catch {
      body = {};
    }
    const shop = shopDomain(body?.shop || configuredShop());
    if (!isValidShop(shop)) {
      return json({ ok: false, error: "Ogiltig butiksdomän (ska vara namn.myshopify.com)" }, 400);
    }
    const { clientId, clientSecret, envNames } = await credentialsFor(db, shop);
    if (!clientId || !clientSecret) {
      return json({ ok: false, error: `${envNames} måste vara sparade som hemligheter` }, 400);
    }

    const state = crypto.randomUUID().replace(/-/g, "");
    const { error } = await db.from("shopify_oauth_states").insert({ state, shop });
    if (error) return json({ ok: false, error: error.message }, 500);

    const redirectUri = `${functionBaseUrl()}/callback`;
    const authorizeUrl =
      `https://${shop}/admin/oauth/authorize?client_id=${encodeURIComponent(clientId)}` +
      `&scope=${encodeURIComponent(SCOPES)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${state}&grant_options[]=`;

    return json({ ok: true, shop, authorize_url: authorizeUrl, redirect_uri: redirectUri });
  }

  return json({ ok: false, error: "Okänd åtgärd" }, 404);
});
