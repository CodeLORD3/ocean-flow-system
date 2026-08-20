/**
 * Flera Shopify-butiker i samma kodväg.
 *
 * Varje webbutik ligger som en rad i tabellen shopify_shops med sin egen
 * shop-domän, sitt bolag, sin valuta, sin standardbutik och NAMNEN på sina
 * hemligheter. Hemligheterna själva ligger alltid i miljön, aldrig i tabellen
 * eller i koden:
 *
 *   Sverige:  SHOPIFY_SE_WEBHOOK_SECRET / SHOPIFY_SE_ADMIN_TOKEN
 *   Schweiz:  SHOPIFY_CH_WEBHOOK_SECRET / SHOPIFY_CH_ADMIN_TOKEN
 *
 * De gamla enbutiksnycklarna (SHOPIFY_WEBHOOK_SECRET, SHOPIFY_ADMIN_TOKEN)
 * läses fortfarande som reserv så att den svenska butiken fungerar oförändrat
 * under flytten. Ingen kod utanför den här filen får anta att det bara finns
 * en Shopify-butik.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export interface ShopifyShop {
  id: string;
  shop_domain: string;
  label: string;
  legal_entity_id: string | null;
  currency: string;
  default_store_id: string | null;
  sort_by_pickup_location: boolean;
  webhook_secret_env: string;
  admin_token_env: string;
  api_version: string;
  active: boolean;
}

/** Normaliserar butiksdomänen: "min-butik" → "min-butik.myshopify.com". */
export function shopDomain(raw: unknown): string {
  let d = String(raw ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (d && !d.includes(".")) d = `${d}.myshopify.com`;
  return d;
}

const env = (name?: string | null) => (name ? Deno.env.get(name) ?? "" : "");

export async function listShops(db: SupabaseClient): Promise<ShopifyShop[]> {
  const { data } = await db.from("shopify_shops").select("*").eq("active", true).order("label");
  return (data || []) as ShopifyShop[];
}

/** Butiken bakom en inkommande webhook, via X-Shopify-Shop-Domain. */
export async function shopByDomain(
  db: SupabaseClient,
  domain: string | null,
): Promise<ShopifyShop | null> {
  const d = shopDomain(domain);
  if (!d) return null;
  const { data } = await db.from("shopify_shops").select("*").eq("shop_domain", d).maybeSingle();
  return (data as ShopifyShop | null) ?? null;
}

/** Slår upp butik på domän eller id, annars den enda aktiva butiken. */
export async function resolveShop(
  db: SupabaseClient,
  hint?: { shop?: unknown; shop_id?: unknown },
): Promise<ShopifyShop | null> {
  if (hint?.shop_id) {
    const { data } = await db
      .from("shopify_shops")
      .select("*")
      .eq("id", String(hint.shop_id))
      .maybeSingle();
    if (data) return data as ShopifyShop;
  }
  if (hint?.shop) {
    const hit = await shopByDomain(db, String(hint.shop));
    if (hit) return hit;
  }
  const shops = await listShops(db);
  return shops.length === 1 ? shops[0] : null;
}

/**
 * Alla nycklar en webhook från butiken kan vara signerad med, i tur och ordning.
 *
 * Shopify signerar webhooks som skapats via Admin API med APPENS klienthemlighet
 * (Client secret), inte med en egen "webhook secret". Bara webhooks som lagts in
 * manuellt i butikens admin använder butikens notifikationsnyckel. Därför måste
 * alla kandidater provas — annars faller hela butikens flöde bort som
 * "ogiltig signatur" trots att allt annat är rätt.
 */
export function webhookSecrets(shop: ShopifyShop | null): string[] {
  const prefix = shop ? credentialPrefix(shop) : "";
  const candidates = [
    env(shop?.webhook_secret_env),
    prefix ? env(`${prefix}API_SECRET`) : "",
    prefix ? env(`${prefix}WEBHOOK_SECRET`) : "",
    env("SHOPIFY_WEBHOOK_SECRET"),
    env("SHOPIFY_API_SECRET"),
    env("SHOPIFY_ACCESS_TOKEN"),
  ]
    .map((v) => cleanCred(String(v ?? "")))
    .filter(Boolean);
  return [...new Set(candidates)];
}

/** Bakåtkompatibelt: den första kandidaten. */
export function webhookSecret(shop: ShopifyShop | null): string {
  return webhookSecrets(shop)[0] ?? "";
}


/** Klientuppgifternas prefix för butiken: SHOPIFY_CH_ADMIN_TOKEN → SHOPIFY_CH_ */
function credentialPrefix(shop: ShopifyShop): string {
  const m = String(shop.admin_token_env || "").match(/^SHOPIFY_([A-Z0-9]+)_ADMIN_TOKEN$/);
  return m ? `SHOPIFY_${m[1]}_` : "";
}

const cleanCred = (v: string) =>
  v.trim().replace(/^["']|["']$/g, "").replace(/-\d{6,}$/, "");

/**
 * Hämtar en färsk Admin-token med Shopifys client_credentials-flöde. Det är
 * det flöde som gäller för appar man byggt till sin egen butik: butikens app
 * behöver ingen installationsomgång, bara Client ID + Client secret. Tokens
 * lever i 24 timmar och sparas i shopify_oauth_tokens med sitt utgångsdatum.
 */
export async function mintClientCredentialsToken(
  db: SupabaseClient,
  shop: ShopifyShop,
): Promise<{ token: string | null; error?: string }> {
  const prefix = credentialPrefix(shop);
  const clientId =
    cleanCred(env(prefix ? `${prefix}API_KEY` : "") || env("SHOPIFY_API_KEY"));
  const clientSecret = cleanCred(
    env(prefix ? `${prefix}API_SECRET` : "") ||
      env("SHOPIFY_API_SECRET") ||
      env("SHOPIFY_ACCESS_TOKEN"),
  );
  if (!clientId || !clientSecret) {
    return {
      token: null,
      error: `Klientuppgifter saknas för ${shop.label} (${prefix || "SHOPIFY_"}API_KEY / ${prefix || "SHOPIFY_"}API_SECRET).`,
    };
  }
  try {
    const res = await fetch(`https://${shop.shop_domain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      return { token: null, error: `Shopify nekade tokenbegäran (${res.status}): ${text.slice(0, 300)}` };
    }
    const body = JSON.parse(text);
    const token = String(body?.access_token || "");
    if (!token) return { token: null, error: "Shopify svarade utan access_token." };
    const ttl = Number(body?.expires_in);
    const expiresAt = Number.isFinite(ttl) && ttl > 0
      ? new Date(Date.now() + (ttl - 120) * 1000).toISOString()
      : null;
    await db.from("shopify_oauth_tokens").upsert(
      {
        shop: shop.shop_domain,
        access_token: token,
        scope: body?.scope ?? null,
        access_mode: "client_credentials",
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "shop" },
    );
    return { token };
  } catch (e) {
    return { token: null, error: `Kunde inte nå Shopify: ${(e as Error).message}` };
  }
}

/**
 * Admin-token för backfyllnad och API-anrop, i tur och ordning:
 *   1. butikens namngivna hemlighet (shpat_-token som lagts in manuellt)
 *   2. sparad token i shopify_oauth_tokens som inte gått ut
 *   3. ny token via client_credentials (egen butiks-app, förnyas var 24:e timme)
 *   4. den gamla enbutiksnyckeln
 */
export async function adminToken(
  db: SupabaseClient,
  shop: ShopifyShop,
): Promise<string | null> {
  const named = env(shop.admin_token_env);
  if (named) return named;
  const { data } = await db
    .from("shopify_oauth_tokens")
    .select("access_token, expires_at")
    .eq("shop", shop.shop_domain)
    .maybeSingle();
  const stored = data as { access_token?: string; expires_at?: string | null } | null;
  const stillValid =
    !!stored?.access_token &&
    (!stored.expires_at || new Date(stored.expires_at).getTime() > Date.now());
  if (stillValid) return String(stored!.access_token);
  const minted = await mintClientCredentialsToken(db, shop);
  if (minted.token) return minted.token;
  if (stored?.access_token) return String(stored.access_token);
  return env("SHOPIFY_ADMIN_TOKEN") || null;
}


/**
 * Dagskurs mot SEK vid mottagning. Sparas på ordern så att en CHF-order
 * behåller sin kurs även om marknaden rör sig efteråt. Misslyckas hämtningen
 * sparas ingen kurs — beloppen visas då bara i sin egen valuta.
 */
export async function fxRateToSek(currency: string): Promise<number | null> {
  const from = String(currency || "SEK").toUpperCase();
  if (from === "SEK") return 1;
  try {
    const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${from}&symbols=SEK`);
    if (res.ok) {
      const j = await res.json();
      const rate = Number(j?.rates?.SEK);
      if (Number.isFinite(rate) && rate > 0) return rate;
    }
  } catch (_e) {
    // Kursen är en bonus, aldrig ett hinder för att ta emot ordern.
  }
  return null;
}
