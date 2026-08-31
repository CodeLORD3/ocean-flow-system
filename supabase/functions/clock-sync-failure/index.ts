import { requireStation, corsHeaders, json, service } from "../_shared/clock.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const db = service();
  const ctx = await requireStation(db, req, body);
  if (!ctx) return json(req, { error: "Stationens session har gått ut." }, 401);
  const payload = {
    station_id: ctx.station.id,
    store_id: ctx.station.store_id,
    legal_entity_id: ctx.station.legal_entity_id,
    identifier_masked: typeof body.identifier_masked === "string" ? body.identifier_masked.slice(0, 80) : "Offlinepost",
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
  if (!(["in", "ut", "rast_start", "rast_slut"] as string[]).includes(payload.punch_type)) {
    return json(req, { error: "Ogiltig stämplingstyp." }, 400);
  }
  const { error } = await db.from("clock_sync_failures").insert(payload);
  if (error) return json(req, { error: "Kunde inte registrera synkroniseringsfelet." }, 500);
  return json(req, { ok: true });
});
