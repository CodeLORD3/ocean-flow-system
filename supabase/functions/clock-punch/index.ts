/**
 * Uppslag och stämpling från klockan.
 *
 * mode = "lookup": returnerar förnamn + maskerat personnummer för bekräftelse.
 * mode = "punch": skriver time_entry (append-only journal).
 *
 * Härdningar (revision 2026-09):
 *  - Serverns tid gäller alltid. Enhetens tid godtas bara för offlineköade
 *    stämplingar, och bara inom ett rimligt fönster (14 dygn bakåt, ingen framtid).
 *  - Ogiltigt format avvisas direkt och skapar aldrig provisorisk personal.
 *  - Provisorisk personal skapas bara vid faktisk stämpling, aldrig vid uppslag.
 *  - Spärren för upprepade felförsök gäller okända identiteter, aldrig känd personal.
 *  - Samma person + samma typ inom 90 sekunder ger en enda journalrad (dubbeltryck).
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
  resetFailedLookup,
  requireStation,
  service,
  type PunchType,
} from "../_shared/clock.ts";

interface EmployeeHit { id: string; first_name: string; last_name: string; pnr_masked: string | null; is_active: boolean; }
interface WorkSite { id: string; name: string; posting_cost_center: string; store_id: string | null; legal_entity_id: string | null; geofence_lat: number | null; geofence_lng: number | null; geofence_radius_m: number; allow_mobile_punch: boolean; }

const WORK_SITE_COLUMNS =
  "id, name, posting_cost_center, store_id, legal_entity_id, geofence_lat, geofence_lng, geofence_radius_m, allow_mobile_punch";

/** Dubbeltrycksfönster: samma person, samma typ, inom denna tid = samma stämpling. */
const DUPLICATE_WINDOW_MS = 90_000;
/** Hur långt bakåt en offlineköad stämpling får ligga. */
const MAX_OFFLINE_AGE_MS = 14 * 24 * 3600_000;
/** Tillåten klockdrift framåt på enheten. */
const MAX_FUTURE_DRIFT_MS = 120_000;

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

/** Ogiltiga identifierare ska aldrig bli personalposter. */
function plausibleIdentifier(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 12) return true;
  // Enbart siffror men fel längd = feltryckt personnummer, aldrig kortnummer.
  if (/^\d+$/.test(raw.replace(/[\s-]/g, ""))) return false;
  // Kortnummer/RFID: minst 6 tecken, måste innehålla minst en siffra.
  return /^[A-Za-z0-9-]{6,32}$/.test(raw) && /\d/.test(raw);
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
  const offlineQueued = body.offline_queued === true;
  if (!rawIdentifier) return json(req, { error: "Ange personnummer eller kortnummer." }, 400);

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

  // Ogiltigt format som inte heller är ett registrerat kortnummer avvisas här:
  // det ska aldrig skapa avvikelsepost eller provisorisk personal.
  if (!hit && !pnr && !plausibleIdentifier(rawIdentifier)) {
    return json(req, { error: "Personnummer ska vara 10 eller 12 siffror. Kontrollera och försök igen." }, 400);
  }

  // En person som redan är instämplad måste alltid kunna stämpla ut, även om
  // posten är provisorisk eller inaktiverad. Annars står tiden öppen tills
  // nattjobbet stänger den, och personen får inget kvitto på sin utstämpling.
  let openShift = false;
  if (hit && !hit.is_active) {
    const { data: lastRows } = await db
      .from("time_entries")
      .select("id, type, occurred_at, corrects_entry_id, correction_kind")
      .eq("employee_id", hit.id)
      .order("occurred_at", { ascending: false })
      .limit(60);
    openShift = isOpenShift(effectiveLast(lastRows ?? [])?.type);
  }
  const blocked = !hit || (!hit.is_active && !openShift);

  // Spärren för upprepade felförsök gäller bara okända identiteter. Känd
  // personal i kön ska aldrig hindras av någon annans felslag.
  if (blocked && !(await checkRateLimit(db, station.id))) {
    return json(req, { error: "För många felaktiga försök på den här stationen. Vänta en minut." }, 429);
  }

  if (blocked) {
    // Okänd person: stämplingen får inte kastas bort. Vi lägger en post i
    // granskningskön, och vid en faktisk stämpling också en provisorisk
    // personalpost så att tiden kan bokföras och kopplas av chef.
    const pendingRow = {
      pnr_hash: hash,
      pnr_masked: pnr ? maskPnr(pnr) : null,
      identifier_masked: pnr ? null : `****${rawIdentifier.slice(-4)}`,
      station_id: station.id,
      store_id: station.store_id,
      legal_entity_id: station.legal_entity_id,
      stated_name: body.stated_name ? String(body.stated_name).slice(0, 120) : null,
      occurred_at: new Date().toISOString(),
    };
    if (hash) {
      const { data: existing } = await db.from("clock_pending_registrations").select("id, attempts").eq("pnr_hash", hash).eq("status", "pending").maybeSingle();
      if (existing) await db.from("clock_pending_registrations").update({ attempts: ((existing.attempts as number) ?? 1) + 1 }).eq("id", existing.id);
      else await db.from("clock_pending_registrations").insert(pendingRow);
    } else await db.from("clock_pending_registrations").insert(pendingRow);

    await registerFailedLookup(db, station.id);

    // Vid uppslag stannar vi här: ingen provisorisk personal skapas av en felslagen siffra.
    if (mode === "lookup" || !hit) {
      if (mode === "lookup") {
        return json(req, {
          status: "pending_registration",
          message: "Personnummret finns inte i personalregistret. Registreringen ligger nu i avvikelsekön för chefens granskning.",
          expires_at: expiresAt,
        });
      }
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
  } else {
    await resetFailedLookup(db, station.id);
  }

  // Behörighet att stämpla: testpersoner, avslutade anställningar och personer
  // utan anställning i stationens bolag ska avvisas med ett tydligt besked.
  // Utstämpling släpps alltid igenom så att ingen kan fastna instämplad.
  {
    const { data: person } = await db
      .from("employees")
      .select("is_test, status")
      .eq("id", hit.id)
      .maybeSingle();
    if (person?.is_test === true) {
      return json(req, { error: "Det här är en testperson i systemet och kan inte stämpla. Kontakta kontoret." }, 403);
    }
    if (mode === "lookup" || action !== "ut") {
      const today = new Date().toISOString().slice(0, 10);
      const { data: employments } = await db
        .from("employments")
        .select("legal_entity_id, is_active, start_date, end_date")
        .eq("employee_id", hit.id);
      const rows = employments ?? [];
      const live = rows.filter(
        (e) =>
          e.is_active === true &&
          (!e.end_date || String(e.end_date) >= today) &&
          (!e.start_date || String(e.start_date) <= today),
      );
      if (rows.length > 0 && live.length === 0) {
        return json(req, { error: "Din anställning är avslutad i systemet. Stämpling är stängd — prata med din chef." }, 403);
      }
      if (station.legal_entity_id && live.length > 0 && !live.some((e) => e.legal_entity_id === station.legal_entity_id)) {
        return json(req, {
          error: "Du har ingen anställning i det bolag den här klockan tillhör. Stämpla på din egen butiks klocka eller säg till chefen.",
        }, 403);
      }
    }
  }

  const { data: recent } = await db.from("time_entries").select("id, type, occurred_at").eq("employee_id", hit.id).order("occurred_at", { ascending: false }).limit(1);
  const last = recent?.[0]?.type as PunchType | undefined;
  const suggested: PunchType = last === "in" || last === "rast_slut" ? "ut" : last === "rast_start" ? "rast_slut" : "in";
  if (mode === "lookup") return json(req, { status: "found", employee: { id: hit.id, first_name: hit.first_name, pnr_masked: hit.pnr_masked ?? (pnr ? maskPnr(pnr) : null) }, last_type: last ?? null, suggested_action: suggested, expires_at: expiresAt });
  if (!PUNCH_TYPES.includes(action)) return json(req, { error: "Ogiltig åtgärd." }, 400);
  // Ett öppet pass får avslutas, men en provisorisk eller inaktiverad person
  // ska inte kunna starta ett nytt pass innan chefen godkänt registreringen.
  if (openShift && action === "in") {
    return json(req, { status: "pending_registration", message: "Registrering väntar på godkännande.", expires_at: expiresAt });
  }

  const workSiteId = body.work_site_id ? String(body.work_site_id) : null;
  let workSite: WorkSite | null = null;
  if (workSiteId) {
    const { data } = await db.from("work_sites").select(WORK_SITE_COLUMNS).eq("id", workSiteId).eq("is_active", true).maybeSingle();
    workSite = (data as WorkSite | null) ?? null;
    if (!workSite) return json(req, { error: "Driftstället är inte aktivt." }, 400);
  } else if (station.store_id) {
    const { data } = await db.from("work_sites").select(WORK_SITE_COLUMNS).eq("store_id", station.store_id).eq("is_active", true).order("sort_order").limit(2);
    if ((data ?? []).length === 1) workSite = (data?.[0] as WorkSite) ?? null;
  }
  // Fallback: butiken kanske inte har egna driftställen. Då gäller bolagets
  // enda driftställe. Saknas även det stämplar vi på stationens enhet — en
  // stämpling får aldrig blockeras av att kostnadsställen inte är uppsatta.
  if (!workSite && station.legal_entity_id) {
    const { data } = await db.from("work_sites").select(WORK_SITE_COLUMNS).is("store_id", null).eq("legal_entity_id", station.legal_entity_id).eq("is_active", true).order("sort_order").limit(2);
    if ((data ?? []).length === 1) workSite = (data?.[0] as WorkSite) ?? null;
  }
  if (workSite && station.store_id && workSite.store_id && workSite.store_id !== station.store_id) {
    return json(req, { error: "Driftstället tillhör en annan butik." }, 403);
  }

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

  // Serverns tid gäller. Enhetens tid godtas bara för offlineköade stämplingar
  // och aldrig i framtiden eller äldre än fjorton dygn.
  const serverNow = Date.now();
  let occurredAt = new Date(serverNow).toISOString();
  let timeNote: string | null = null;
  if (offlineQueued && body.occurred_at) {
    const claimed = new Date(String(body.occurred_at)).getTime();
    if (Number.isFinite(claimed) && claimed <= serverNow + MAX_FUTURE_DRIFT_MS && claimed >= serverNow - MAX_OFFLINE_AGE_MS) {
      occurredAt = new Date(claimed).toISOString();
    } else {
      timeNote = "Offlinepost med orimlig enhetstid — serverns synktid använd.";
    }
  }
  const roundedAt = action === "in" || action === "ut" ? applyRounding(occurredAt, station.profile) : occurredAt;

  // Idempotens: samma knapptryck (client_punch_id) får aldrig bli två journalrader,
  // hur många gånger offlinekön än försöker synka om.
  const clientPunchId = typeof body.client_punch_id === "string" && /^[0-9a-f-]{36}$/i.test(body.client_punch_id)
    ? body.client_punch_id
    : null;
  const duplicateResponse = (entry: unknown) => json(req, {
    status: "punched",
    duplicate: true,
    entry,
    employee: { first_name: hit!.first_name, pnr_masked: hit!.pnr_masked },
    expires_at: expiresAt,
  });
  if (clientPunchId) {
    const { data: existing } = await db
      .from("time_entries")
      .select("id, type, occurred_at, registered_at, work_site_id, cost_center, geofence_ok")
      .eq("employee_id", hit.id)
      .eq("client_punch_id", clientPunchId)
      .maybeSingle();
    if (existing) return duplicateResponse(existing);
  }

  // Dubbeltryck utan gemensamt client_punch_id: samma typ inom 90 sekunder är
  // ett och samma tryck och ska inte bli två rader i journalen. Fönstret måste
  // vara stängt även framåt — en rad med framtida tid får aldrig läsas som ett
  // dubbeltryck och blockera en verklig stämpling.
  if (!offlineQueued) {
    const { data: near } = await db
      .from("time_entries")
      .select("id, type, occurred_at, registered_at, work_site_id, cost_center, geofence_ok")
      .eq("employee_id", hit.id)
      .eq("type", action)
      .lte("occurred_at", new Date(serverNow + DUPLICATE_WINDOW_MS).toISOString())
      .gte("occurred_at", new Date(serverNow - DUPLICATE_WINDOW_MS).toISOString())
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (near) return duplicateResponse(near);
  }

  const entryPayload = {
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
    offline_queued: offlineQueued,
    synced_at: new Date().toISOString(),
    type: action,
    occurred_at: occurredAt,
    rounded_at: roundedAt,
    registered_at: new Date().toISOString(),
    source: "clock",
    note: [body.note ? String(body.note).slice(0, 400) : null, timeNote].filter(Boolean).join(" ") || null,
  };
  const { data: inserted, error } = await db
    .from("time_entries")
    .upsert(entryPayload, { onConflict: "employee_id,client_punch_id", ignoreDuplicates: true })
    .select("id, type, occurred_at, registered_at, work_site_id, cost_center, geofence_ok")
    .maybeSingle();
  if (error) { console.error("clock-punch insert failed", error.message); return json(req, { error: "Kunde inte spara stämplingen." }, 500); }
  if (!inserted && clientPunchId) {
    const { data: existing } = await db.from("time_entries").select("id, type, occurred_at, registered_at, work_site_id, cost_center, geofence_ok").eq("employee_id", hit.id).eq("client_punch_id", clientPunchId).maybeSingle();
    return duplicateResponse(existing);
  }
  return json(req, { status: "punched", entry: inserted, employee: { first_name: hit.first_name, pnr_masked: hit.pnr_masked }, expires_at: expiresAt });
});
