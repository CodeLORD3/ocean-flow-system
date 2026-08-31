import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-clock-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const service = () => createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const db = service();
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const stationToken = req.headers.get("x-clock-session") ?? String(body.session_token ?? "");
  if (!stationToken) return json({ error: "Stationen är inte aktiverad." }, 401);
  const tokenBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`CLOCKSESSION:${stationToken}`));
  const tokenHash = Array.from(new Uint8Array(tokenBytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const { data: session } = await db.from("clock_station_sessions").select("station_id, expires_at").eq("token_hash", tokenHash).maybeSingle();
  if (!session || new Date(session.expires_at).getTime() <= Date.now()) return json({ error: "Stationens session har gått ut." }, 401);
  const { data: station } = await db.from("clock_stations").select("id, store_id, legal_entity_id").eq("id", session.station_id).maybeSingle();
  if (!station) return json({ error: "Stationen saknas." }, 404);
  const payload = {
    station_id: station.id,
    store_id: station.store_id,
    legal_entity_id: station.legal_entity_id,
    identifier_masked: typeof body.identifier_masked === "string" ? body.identifier_masked.slice(0, 80) : null,
    identifier_cipher: typeof body.identifier_cipher === "string" ? body.identifier_cipher.slice(0, 20000) : null,
    identifier_iv: typeof body.identifier_iv === "string" ? body.identifier_iv.slice(0, 500) : null,
    punch_type: String(body.action ?? ""),
    occurred_at: String(body.occurred_at ?? new Date().toISOString()),
    queued_at: body.queued_at ? String(body.queued_at) : new Date().toISOString(),
    work_site_id: typeof body.work_site_id === "string" ? body.work_site_id : null,
    cost_center: typeof body.cost_center === "string" ? body.cost_center.slice(0, 30) : null,
    reason: String(body.reason ?? "Offlinepost kunde inte synkroniseras").slice(0, 500),
    attempts: Number.isFinite(Number(body.attempts)) ? Math.max(1, Number(body.attempts)) : 1,
  };
  const { error } = await db.from("clock_sync_failures").insert(payload);
  if (error) return json({ error: "Kunde inte registrera synkroniseringsfelet." }, 500);
  return json({ ok: true });
});
