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
 * Signeringsnyckeln för butiken. Butikens egen nyckel först, sedan den gamla
 * gemensamma nyckeln som reserv (bara under flytten av svenska butiken).
 */
export function webhookSecret(shop: ShopifyShop | null): string {
  return (
    env(shop?.webhook_secret_env) ||
    env("SHOPIFY_WEBHOOK_SECRET") ||
    ""
  );
}

/**
 * Admin-token för backfyllnad: butikens namngivna hemlighet, annars OAuth-token
 * i shopify_oauth_tokens för samma domän, annars den gamla hemligheten.
 */
export async function adminToken(
  db: SupabaseClient,
  shop: ShopifyShop,
): Promise<string | null> {
  const named = env(shop.admin_token_env);
  if (named) return named;
  const { data } = await db
    .from("shopify_oauth_tokens")
    .select("access_token")
    .eq("shop", shop.shop_domain)
    .maybeSingle();
  if (data?.access_token) return String(data.access_token);
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
