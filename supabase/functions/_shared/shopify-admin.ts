/**
 * Delad hjälpkod för Shopify Admin API.
 *
 * Tokenkällor, i tur och ordning:
 *   1. OAuth-token från tabellen shopify_oauth_tokens (offline, permanent)
 *   2. Hemligheten SHOPIFY_ADMIN_TOKEN (äldre shpat_-token)
 *
 * Klienthemligheten (shpss_...) ligger i SHOPIFY_API_SECRET eller
 * SHOPIFY_ACCESS_TOKEN och läses bara från miljön — aldrig ur koden.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const SHOPIFY_API_VERSION = "2026-07";

/** Normaliserar butiksdomänen: "min-butik" → "min-butik.myshopify.com". */
export function shopDomain(raw: string): string {
  let d = (raw ?? "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (d && !d.includes(".")) d = `${d}.myshopify.com`;
  return d;
}

export function configuredShop(): string {
  return shopDomain(Deno.env.get("SHOPIFY_SHOP_DOMAIN") ?? "");
}

export function apiKey(): string {
  return Deno.env.get("SHOPIFY_API_KEY") ?? "";
}

export function apiSecret(): string {
  return Deno.env.get("SHOPIFY_API_SECRET") ?? Deno.env.get("SHOPIFY_ACCESS_TOKEN") ?? "";
}

/** Hämtar giltig Admin-token för butiken, eller null om ingen finns. */
export async function getAdminToken(
  db: SupabaseClient,
  shop = configuredShop(),
): Promise<string | null> {
  if (shop) {
    const { data } = await db
      .from("shopify_oauth_tokens")
      .select("access_token")
      .eq("shop", shop)
      .maybeSingle();
    if (data?.access_token) return data.access_token as string;
  }
  const legacy = Deno.env.get("SHOPIFY_ADMIN_TOKEN") ?? "";
  return legacy || null;
}

/** Anropar Admin REST API med rätt token och version. */
export async function adminFetch(
  token: string,
  shop: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = path.startsWith("http")
    ? path
    : `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/${path.replace(/^\//, "")}`;
  return await fetch(url, {
    ...init,
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}
