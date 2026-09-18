/** Aktiverar en klockstation med aktiveringskod och returnerar en sessionstoken. */
import {
  clockCodeHash,
  corsHeaders,
  json,
  randomToken,
  service,
  SESSION_ABSOLUTE_MINUTES,
  SESSION_TTL_MINUTES,
  sessionTokenHash,
} from "../_shared/clock.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "Ogiltig förfrågan" }, 400);
  }

  const code = String(body.activation_code ?? "").trim();
  if (code.length < 8) return json(req, { error: "Ange en giltig aktiveringskod (minst 8 tecken)." }, 400);

  const db = service();
  const hash = await clockCodeHash(code);
  const { data: station } = await db
    .from("clock_stations")
    .select("id, name, store_id, legal_entity_id, status, profile")
    .eq("activation_code_hash", hash)
    .maybeSingle();

  if (!station) return json(req, { error: "Aktiveringskoden gäller inte." }, 401);
  if (station.status !== "active") return json(req, { error: "Stationen är återkallad. Kontakta administratör." }, 403);

  // Koden binds till en enhet: så länge stationen har en levande session kan
  // samma kod inte aktivera en andra enhet. Byte av enhet kräver rotation.
  const { data: live } = await db
    .from("clock_station_sessions")
    .select("id")
    .eq("station_id", station.id)
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (live) {
    return json(req, {
      error: "Stationen är redan aktiverad på en annan enhet. Rotera aktiveringskoden för att flytta klockan.",
    }, 409);
  }


  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MINUTES * 60_000).toISOString();
  // Absolut tak: sessionen kan förnyas men aldrig leva längre än ett dygn.
  const absoluteExpiresAt = new Date(Date.now() + SESSION_ABSOLUTE_MINUTES * 60_000).toISOString();
  const { error } = await db.from("clock_station_sessions").insert({
    station_id: station.id,
    token_hash: await sessionTokenHash(token),
    expires_at: expiresAt,
    absolute_expires_at: absoluteExpiresAt,
  });
  if (error) return json(req, { error: "Kunde inte aktivera stationen." }, 500);

  await db.from("clock_stations").update({ last_seen_at: new Date().toISOString() }).eq("id", station.id);

  let storeName: string | null = null;
  if (station.store_id) {
    const { data: store } = await db.from("stores").select("name").eq("id", station.store_id).maybeSingle();
    storeName = (store?.name as string | undefined) ?? null;
  }

  type SiteRow = { id: string; name: string; posting_cost_center: string; geofence_radius_m: number; allow_mobile_punch: boolean };
  const SITE_COLS = "id, name, posting_cost_center, geofence_radius_m, allow_mobile_punch, sort_order";
  const collected: SiteRow[] = [];
  const seen = new Set<string>();
  const push = (rows: unknown[] | null) => {
    for (const row of (rows ?? []) as (SiteRow & { sort_order?: number })[]) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      collected.push(row);
    }
  };

  if (station.store_id) {
    const { data: storeSites } = await db
      .from("work_sites")
      .select(SITE_COLS)
      .eq("is_active", true)
      .eq("store_id", station.store_id)
      .order("sort_order");
    push(storeSites);
  }
  // Bolagsgemensamma kostnadsställen (t.ex. Administration) ska kunna väljas
  // även på en station som hör till en butik.
  if (station.legal_entity_id) {
    const { data: entitySites } = await db
      .from("work_sites")
      .select(SITE_COLS)
      .eq("is_active", true)
      .is("store_id", null)
      .eq("legal_entity_id", station.legal_entity_id)
      .order("sort_order");
    push(entitySites);
  }
  const workSites: SiteRow[] = collected;

  return json(req, {
    session_token: token,
    expires_at: expiresAt,
    station: {
      id: station.id,
      name: station.name,
      store_id: station.store_id,
      legal_entity_id: station.legal_entity_id,
      store_name: storeName,
      profile: station.profile,
      work_sites: workSites,
    },
  });
});
