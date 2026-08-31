/**
 * Uppslag och stämpling från klockan.
 *
 * mode = "lookup": returnerar förnamn + maskerat personnummer för bekräftelse.
 * mode = "punch": skriver time_entry (append-only journal).
 */
import {
  applyRounding,
  checkRateLimit,
  corsHeaders,
  json,
  maskPnr,
  normalizePnr,
  pnrHash,
  PUNCH_TYPES,
  registerFailedLookup,
  requireStation,
  service,
  type PunchType,
} from "../_shared/clock.ts";

interface EmployeeHit { id: string; first_name: string; last_name: string; pnr_masked: string | null; is_active: boolean; }
interface WorkSite { id: string; name: string; posting_cost_center: string; store_id: string | null; legal_entity_id: string | null; geofence_lat: number | null; geofence_lng: number | null; geofence_radius_m: number; allow_mobile_punch: boolean; }

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function distanceMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * rad / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin((lng2 - lng1) * rad / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(req, { error: "Ogiltig förfrågan" }, 400); }

  const db = service();
  const ctx = await requireStation(db, req, body);
  if (!ctx) return json(req, { error: "Stationen är inte aktiverad. Ange aktiveringskod." }, 401);
  const { station, expiresAt } = ctx;
  const mode = String(body.mode ?? "lookup");
  const rawIdentifier = String(body.identifier ?? "").trim();
  const action = String(body.action ?? "") as PunchType;
  const occurredAtInput = body.occurred_at ? String(body.occurred_at) : null;
  if (!rawIdentifier) return json(req, { error: "Ange personnummer eller kortnummer." }, 400);
  if (!(await checkRateLimit(db, station.id))) return json(req, { error: "För många försök. Vänta en minut och försök igen." }, 429);

  const pnr = normalizePnr(rawIdentifier);
  let hit: EmployeeHit | null = null;
  let hash: string | null = null;
  if (pnr) {
    hash = await pnrHash(pnr);
    const { data } = await db.from("employees").select("id, first_name, last_name, pnr_masked, is_active").eq("pnr_hash", hash).maybeSingle();
    hit = (data as EmployeeHit | null) ?? null;
  }
  if (!hit) {
    const { data } = await db.from("employees").select("id, first_name, last_name, pnr_masked, is_active").eq("alt_clock_identifier", rawIdentifier).maybeSingle();
    hit = (data as EmployeeHit | null) ?? null;
  }

  if (!hit || !hit.is_active) {
    // Okänd person: stämplingen får inte kastas bort. Vi lägger upp en
    // provisorisk personal så att tiden kan bokföras, och en post i
    // granskningskön så att en chef kopplar den till rätt anställd.
    const pendingRow = {
      pnr_hash: hash,
      pnr_masked: pnr ? maskPnr(pnr) : null,
      identifier_masked: pnr ? null : `****${rawIdentifier.slice(-4)}`,
      station_id: station.id,
      store_id: station.store_id,
      legal_entity_id: station.legal_entity_id,
      stated_name: body.stated_name ? String(body.stated_name).slice(0, 120) : null,
      occurred_at: occurredAtInput ?? new Date().toISOString(),
    };
    if (hash) {
      const { data: existing } = await db.from("clock_pending_registrations").select("id, attempts").eq("pnr_hash", hash).eq("status", "pending").maybeSingle();
      if (existing) await db.from("clock_pending_registrations").update({ attempts: ((existing.attempts as number) ?? 1) + 1 }).eq("id", existing.id);
      else await db.from("clock_pending_registrations").insert(pendingRow);
    } else await db.from("clock_pending_registrations").insert(pendingRow);

    await registerFailedLookup(db, station.id);
    if (!hit) {
      const statedName = body.stated_name ? String(body.stated_name).slice(0, 120).trim() : "";
      const [firstName, ...restName] = statedName.split(/\s+/).filter(Boolean);
      const { data: provisional } = await db
        .from("employees")
        .insert({
          first_name: firstName || "Oidentifierad",
          last_name: restName.join(" ") || (pnr ? maskPnr(pnr) : "stämpling"),
          pnr_hash: hash,
          pnr_masked: pnr ? maskPnr(pnr) : null,
          alt_clock_identifier: pnr ? null : rawIdentifier,
          status: "provisional",
          is_active: false,
          notes: "Provisorisk post skapad av stämpelklockan vid okänd identitet.",
        })
        .select("id, first_name, last_name, pnr_masked, is_active")
        .maybeSingle();
      if (provisional) hit = { ...(provisional as EmployeeHit), is_active: true };
    }

    if (!hit || !hit.is_active) {
      return json(req, { status: "pending_registration", message: "Registrering väntar på godkännande.", expires_at: expiresAt });
    }
    // En uppslagning ska fortfarande kräva chefens godkännande. Vid en faktisk
    // offline-/klockstämpling går vi vidare och skriver journalraden.
    if (mode === "lookup") {
      return json(req, { status: "pending_registration", message: "Registrering väntar på godkännande.", expires_at: expiresAt });
    }
  }

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const { data: recent } = await db.from("time_entries").select("id, type, occurred_at").eq("employee_id", hit.id).gte("occurred_at", dayStart.toISOString()).order("occurred_at", { ascending: false }).limit(1);
  const last = recent?.[0]?.type as PunchType | undefined;
  const suggested: PunchType = last === "in" || last === "rast_slut" ? "ut" : last === "rast_start" ? "rast_slut" : "in";
  if (mode === "lookup") return json(req, { status: "found", employee: { id: hit.id, first_name: hit.first_name, pnr_masked: hit.pnr_masked ?? (pnr ? maskPnr(pnr) : null) }, last_type: last ?? null, suggested_action: suggested, expires_at: expiresAt });
  if (!PUNCH_TYPES.includes(action)) return json(req, { error: "Ogiltig åtgärd." }, 400);

  const workSiteId = body.work_site_id ? String(body.work_site_id) : null;
  let workSite: WorkSite | null = null;
  if (workSiteId) {
    const { data } = await db.from("work_sites").select("id, name, posting_cost_center, store_id, legal_entity_id, geofence_lat, geofence_lng, geofence_radius_m, allow_mobile_punch").eq("id", workSiteId).eq("is_active", true).maybeSingle();
    workSite = (data as WorkSite | null) ?? null;
    if (!workSite) return json(req, { error: "Driftstället är inte aktivt." }, 400);
  } else if (station.store_id) {
    const { data } = await db.from("work_sites").select("id, name, posting_cost_center, store_id, legal_entity_id, geofence_lat, geofence_lng, geofence_radius_m, allow_mobile_punch").eq("store_id", station.store_id).eq("is_active", true).order("sort_order").limit(2);
    if ((data ?? []).length === 1) workSite = (data?.[0] as WorkSite) ?? null;
  }
  if (workSite && station.store_id && workSite.store_id !== station.store_id) return json(req, { error: "Driftstället tillhör en annan butik." }, 403);
  if (action === "in" && !workSite) return json(req, { error: "Välj driftställe innan du stämplar in." }, 400);

  const latitude = numberOrNull(body.punch_lat);
  const longitude = numberOrNull(body.punch_lng);
  const accuracy = numberOrNull(body.punch_accuracy_m);
  if (latitude !== null && (latitude < -90 || latitude > 90) || longitude !== null && (longitude < -180 || longitude > 180)) return json(req, { error: "Ogiltig platsinformation." }, 400);
  let distance: number | null = null;
  let geofenceOk: boolean | null = null;
  if (workSite && workSite.geofence_lat !== null && workSite.geofence_lng !== null) {
    if (latitude === null || longitude === null) {
      if (workSite.allow_mobile_punch) return json(req, { error: "Platsåtkomst krävs för mobil stämpling." }, 403);
    } else {
      distance = distanceMetres(latitude, longitude, workSite.geofence_lat, workSite.geofence_lng);
      geofenceOk = distance <= workSite.geofence_radius_m;
      if (!geofenceOk) return json(req, { error: `Du är ${Math.round(distance)} meter från driftstället. Stämpling nekad.`, distance_m: distance }, 403);
    }
  }

  const occurredAt = occurredAtInput ?? new Date().toISOString();
  const roundedAt = action === "in" || action === "ut" ? applyRounding(occurredAt, station.profile) : occurredAt;

  // Idempotens: samma knapptryck (client_punch_id) får aldrig bli två journalrader,
  // hur många gånger offlinekön än försöker synka om.
  const clientPunchId = typeof body.client_punch_id === "string" && /^[0-9a-f-]{36}$/i.test(body.client_punch_id)
    ? body.client_punch_id
    : null;
  if (clientPunchId) {
    const { data: existing } = await db
      .from("time_entries")
      .select("id, type, occurred_at, registered_at, work_site_id, cost_center, geofence_ok")
      .eq("employee_id", hit.id)
      .eq("client_punch_id", clientPunchId)
      .maybeSingle();
    if (existing) {
      return json(req, {
        status: "punched",
        duplicate: true,
        entry: existing,
        employee: { first_name: hit.first_name, pnr_masked: hit.pnr_masked },
        expires_at: expiresAt,
      });
    }
  }

  const { data: inserted, error } = await db.from("time_entries").insert({
    client_punch_id: clientPunchId,
    employee_id: hit.id,
    station_id: station.id,
    store_id: station.store_id,
    legal_entity_id: station.legal_entity_id,
    work_site_id: workSite?.id ?? null,
    cost_center: workSite?.posting_cost_center ?? (body.cost_center ? String(body.cost_center).slice(0, 30) : null),
    punch_lat: latitude,
    punch_lng: longitude,
    punch_accuracy_m: accuracy,
    distance_m: distance,
    geofence_ok: geofenceOk,
    offline_queued: body.offline_queued === true,
    synced_at: new Date().toISOString(),
    type: action,
    occurred_at: occurredAt,
    rounded_at: roundedAt,
    registered_at: new Date().toISOString(),
    source: "clock",
    note: body.note ? String(body.note).slice(0, 500) : null,
  }).select("id, type, occurred_at, registered_at, work_site_id, cost_center, geofence_ok").single();
  if (error) { console.error("clock-punch insert failed", error.message); return json(req, { error: "Kunde inte spara stämplingen." }, 500); }
  return json(req, { status: "punched", entry: inserted, employee: { first_name: hit.first_name, pnr_masked: hit.pnr_masked }, expires_at: expiresAt });
});
