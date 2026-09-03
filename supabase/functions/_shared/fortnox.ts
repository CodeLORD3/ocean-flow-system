// Delad Fortnox-klient. Hanterar tokens (Vault), refresh-rotation, 429-backoff, loggning.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export const FORTNOX_API = "https://api.fortnox.se/3";
export const FORTNOX_AUTH_URL = "https://apps.fortnox.se/oauth-v1/auth";
export const FORTNOX_TOKEN_URL = "https://apps.fortnox.se/oauth-v1/token";
export const FORTNOX_SCOPES = [
  "customer", "article", "invoice", "price", "payment", "companyinformation", "settings",
  // Digital post: arkivplats, inkorg (digital inbox) och registrerade leverantörsfakturor.
  "archive", "inbox", "supplierinvoice",

  // Lön: närvaro-, frånvaro- och lönetransaktioner samt anställda (etapp 5).
  "salary",
];

export const LEGAL_ENTITIES: Record<string, string> = {
  "de-no1": "DE No.1 AB",
  "fsab-se": "Fisk & Skaldjursspecialisten AB",
};

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export class FortnoxError extends Error {
  constructor(
    public status: number,
    public fortnoxCode: number | null,
    message: string,
    public path: string,
  ) {
    super(message);
    this.name = "FortnoxError";
  }
}

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export async function requireUser(req: Request) {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false },
    },
  );
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function basicAuth(): string {
  return "Basic " + btoa(`${Deno.env.get("FORTNOX_CLIENT_ID")}:${Deno.env.get("FORTNOX_CLIENT_SECRET")}`);
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
  token_type: string;
};

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(FORTNOX_TOKEN_URL, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new FortnoxError(res.status, null, body.error_description ?? body.error ?? "Token request failed", "/oauth-v1/token");
  }
  return body as TokenResponse;
}

export function redirectUri(): string {
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/fortnox-oauth-callback`;
}

export const APP_URL = "https://makrilltrade.com";

export function exchangeCode(code: string): Promise<TokenResponse> {
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
  });
}

export function refreshGrant(refreshToken: string): Promise<TokenResponse> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

export async function storeTokens(sb: SupabaseClient, entity: string, t: TokenResponse): Promise<void> {
  const expiresAt = new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString();
  const { error } = await sb.rpc("fortnox_store_tokens", {
    p_entity: entity,
    p_access: t.access_token,
    p_refresh: t.refresh_token,
    p_expires_at: expiresAt,
  });
  if (error) throw new Error("Kunde inte spara tokens: " + error.message);
}

/**
 * Returnerar ett giltigt access token. Refreshar vid behov med atomiskt lås,
 * eftersom Fortnox roterar refresh token vid varje förnyelse.
 */
export async function getAccessToken(sb: SupabaseClient, entity: string, force = false): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const { data, error } = await sb.rpc("fortnox_read_tokens", { p_entity: entity });
    if (error) throw new Error(error.message);
    const row = data?.[0];
    if (!row?.refresh_token) throw new Error(`Ingen aktiv Fortnox-koppling för ${entity}. Koppla bolaget under Fortnox-sidan.`);
    if (row.status === "needs_reauth") throw new Error(`Fortnox-kopplingen för ${entity} måste kopplas om.`);

    const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
    const fresh = expiresAt - Date.now() > 5 * 60 * 1000;
    if (fresh && !force && row.access_token) return row.access_token;

    const { data: claimed } = await sb.rpc("fortnox_claim_refresh", { p_entity: entity });
    if (claimed) {
      try {
        const t = await refreshGrant(row.refresh_token);
        await storeTokens(sb, entity, t);
        return t.access_token;
      } catch (e) {
        if (e instanceof FortnoxError && (e.status === 400 || e.status === 401)) {
          await sb.from("fortnox_connections")
            .update({ status: "needs_reauth", last_error: e.message, refresh_lock_until: null })
            .eq("legal_entity_code", entity);
        } else {
          await sb.rpc("fortnox_release_refresh", { p_entity: entity });
        }
        throw e;
      }
    }
    // Någon annan refreshar just nu – vänta och läs om.
    await sleep(1500);
    force = false;
  }
  throw new Error("Kunde inte erhålla access token (lås-timeout)");
}

/**
 * Anropar Fortnox API med automatisk token-hantering, 429-backoff och loggning.
 */
export async function fortnoxRequest<T = any>(
  sb: SupabaseClient,
  entity: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  let forceRefresh = false;
  let did401 = false;

  for (let attempt = 0; attempt < 6; attempt++) {
    const token = await getAccessToken(sb, entity, forceRefresh);
    forceRefresh = false;

    const started = Date.now();
    const res = await fetch(FORTNOX_API + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text }; }

    const ei = parsed?.ErrorInformation;
    await sb.from("fortnox_api_log").insert({
      legal_entity_code: entity,
      method,
      path,
      status_code: res.status,
      duration_ms: Date.now() - started,
      error: res.ok ? null : (ei?.Message ?? text.slice(0, 500)),
    });

    if (res.ok) return parsed as T;

    if (res.status === 429) {
      await sleep(1200 * (attempt + 1));
      continue;
    }
    if (res.status === 401 && !did401) {
      did401 = true;
      forceRefresh = true;
      continue;
    }
    throw new FortnoxError(
      res.status,
      ei?.Code ?? ei?.code ?? ei?.Error ?? null,
      ei?.Message ?? ei?.message ?? `Fortnox svarade ${res.status}`,
      path,
    );

  }
  throw new FortnoxError(429, null, "Fortnox rate limit – gav upp efter 6 försök", path);
}
