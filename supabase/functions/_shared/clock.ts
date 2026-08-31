/**
 * Delad serverlogik för stämpelklockan (etapp 2).
 *
 * All klocklogik ligger här och i klockans edge functions. Klockklienten har
 * ingen tabellåtkomst — den har bara en stationstoken.
 *
 * Personnummer hanteras aldrig i klartext utanför en enskild request: värdet
 * hashas direkt (samma algoritm som public.pnr_hash) och används endast för
 * uppslag. Inget svar och ingen logg innehåller fullständigt personnummer.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ALLOWED_ORIGIN_SUFFIXES = [".lovable.app", ".makrilltrade.com"];
const ALLOWED_PRIMARY_ORIGIN = "https://makrilltrade.com";
const ALLOWED_ORIGINS = new Set([
  "https://makrilltrade.com",
  "https://www.makrilltrade.com",
  "https://ocean-flow-system.lovable.app",
  "http://localhost:8080",
]);

export function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allowed =
    ALLOWED_ORIGINS.has(origin) || ALLOWED_ORIGIN_SUFFIXES.some((s) => origin.endsWith(s));
  return {
    // Ingen wildcard: en okänd origin får aldrig tala med klockans funktioner.
    "Access-Control-Allow-Origin": allowed && origin ? origin : ALLOWED_PRIMARY_ORIGIN,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-clock-session",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });

export function service(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

const enc = new TextEncoder();

async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(value));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Samma normalisering som public.normalize_pnr: 10 siffror (YYMMDDNNNN). */
export function normalizePnr(raw: string): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length === 12) return digits.slice(2);
  if (digits.length === 10) return digits;
  return null;
}

/** Samma hash som public.pnr_hash. */
export const pnrHash = (pnr: string) => sha256Hex(`SE:${pnr}`);

/** Samma hash som public.clock_code_hash. */
export const clockCodeHash = (code: string) =>
  sha256Hex(`CLOCK:${(code ?? "").replace(/\s/g, "").toUpperCase()}`);

export const sessionTokenHash = (token: string) => sha256Hex(`CLOCKSESSION:${token}`);

export function maskPnr(pnr10: string): string {
  return `${pnr10.slice(0, 6)}-****`;
}

export function randomToken(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Sessionen förnyas i 12-timmarssteg men kan aldrig leva längre än ett dygn. */
export const SESSION_TTL_MINUTES = 720;
export const SESSION_ABSOLUTE_MINUTES = 1440;

export interface Station {
  id: string;
  name: string;
  store_id: string | null;
  legal_entity_id: string | null;
  status: string;
  profile: ClockProfile;
}

export interface ClockProfile {
  /** Avrundning för löneunderlag. Faktisk stämplingstid sparas alltid orörd. */
  rounding?: { mode?: string; step?: number; direction?: string };
  tolerance_minutes?: number;
}

/** Läser stationstoken från header eller body och förnyar sessionen. */
export async function requireStation(
  db: SupabaseClient,
  req: Request,
  body: Record<string, unknown>,
): Promise<{ station: Station; sessionId: string; expiresAt: string } | null> {
  const token =
    (req.headers.get("x-clock-session") ?? "") || String(body.session_token ?? "");
  if (!token) return null;
  const hash = await sessionTokenHash(token);
  const { data: session } = await db
    .from("clock_station_sessions")
    .select("id, station_id, expires_at, absolute_expires_at, created_at")
    .eq("token_hash", hash)
    .maybeSingle();
  if (!session) return null;

  const now = Date.now();
  const absolute = new Date(
    (session.absolute_expires_at as string | null) ??
      new Date(new Date(session.created_at as string).getTime() + SESSION_ABSOLUTE_MINUTES * 60_000),
  ).getTime();
  const expired = new Date(session.expires_at as string).getTime() < now || absolute < now;
  if (expired) {
    await db.from("clock_station_sessions").delete().eq("id", session.id);
    return null;
  }
  const { data: station } = await db
    .from("clock_stations")
    .select("id, name, store_id, legal_entity_id, status, profile")
    .eq("id", session.station_id)
    .maybeSingle();
  if (!station || station.status !== "active") return null;

  // Förnyelsen får aldrig sträcka sig förbi det absoluta taket.
  const expiresAt = new Date(
    Math.min(now + SESSION_TTL_MINUTES * 60_000, absolute),
  ).toISOString();
  await db
    .from("clock_station_sessions")
    .update({ expires_at: expiresAt, last_used_at: new Date().toISOString() })
    .eq("id", session.id);
  await db
    .from("clock_stations")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", station.id);

  return { station: station as unknown as Station, sessionId: session.id as string, expiresAt };
}

/**
 * Spärren räknar misslyckade uppslag, inte lyckade stämplingar.
 *
 * En station med kö av personal ska aldrig bli spärrad av att många personer
 * stämplar samma minut. Däremot spärras en station som gissar personnummer:
 * fem misslyckade uppslag inom en minut ger tio minuters karens.
 */
export async function checkRateLimit(
  db: SupabaseClient,
  stationId: string,
  max = 5,
): Promise<boolean> {
  const bucket = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
  const { data } = await db
    .from("clock_rate_limits")
    .select("attempts, failure_count, blocked_until")
    .eq("station_id", stationId)
    .eq("minute_bucket", bucket)
    .maybeSingle();
  const blockedUntil = data?.blocked_until as string | null | undefined;
  if (blockedUntil && new Date(blockedUntil).getTime() > Date.now()) return false;
  const failures = (data?.failure_count as number | undefined) ?? 0;
  if (failures >= max) return false;
  await db.from("clock_rate_limits").upsert(
    {
      station_id: stationId,
      minute_bucket: bucket,
      attempts: ((data?.attempts as number | undefined) ?? 0) + 1,
      failure_count: failures,
    },
    { onConflict: "station_id,minute_bucket" },
  );
  return true;
}

/** Registrerar ett misslyckat uppslag och spärrar stationen vid upprepning. */
export async function registerFailedLookup(
  db: SupabaseClient,
  stationId: string,
  max = 5,
  blockMinutes = 10,
): Promise<void> {
  const bucket = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
  const { data } = await db
    .from("clock_rate_limits")
    .select("attempts, failure_count")
    .eq("station_id", stationId)
    .eq("minute_bucket", bucket)
    .maybeSingle();
  const failures = ((data?.failure_count as number | undefined) ?? 0) + 1;
  await db.from("clock_rate_limits").upsert(
    {
      station_id: stationId,
      minute_bucket: bucket,
      attempts: (data?.attempts as number | undefined) ?? failures,
      failure_count: failures,
      blocked_until:
        failures >= max ? new Date(Date.now() + blockMinutes * 60_000).toISOString() : null,
    },
    { onConflict: "station_id,minute_bucket" },
  );
}

/** Avrundar enligt stationsprofilen. */
export function applyRounding(iso: string, profile: ClockProfile): string {
  const r = profile?.rounding ?? {};
  const step = Number(r.step ?? 0);
  if (!r.mode || r.mode === "none" || !step) return iso;
  const ms = step * 60_000;
  const t = new Date(iso).getTime();
  const dir = r.direction ?? "nearest";
  const rounded =
    dir === "up" ? Math.ceil(t / ms) * ms : dir === "down" ? Math.floor(t / ms) * ms : Math.round(t / ms) * ms;
  return new Date(rounded).toISOString();
}

export type PunchType = "in" | "ut" | "rast_start" | "rast_slut";

export const PUNCH_TYPES: PunchType[] = ["in", "ut", "rast_start", "rast_slut"];
