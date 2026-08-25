/**
 * Uppslag och stämpling från klockan.
 *
 * mode = "lookup": returnerar förnamn + maskerat personnummer för bekräftelse.
 * mode = "punch":  skriver time_entry (append-only journal).
 *
 * Identifieraren kan vara 10-/12-siffrigt personnummer ELLER
 * alt_clock_identifier (t.ex. RFID keyboard wedge). Personnumret hashas direkt
 * och lagras/loggas aldrig i klartext.
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
  requireStation,
  service,
  type PunchType,
} from "../_shared/clock.ts";

interface EmployeeHit {
  id: string;
  first_name: string;
  last_name: string;
  pnr_masked: string | null;
  is_active: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "Ogiltig förfrågan" }, 400);
  }

  const db = service();
  const ctx = await requireStation(db, req, body);
  if (!ctx) return json(req, { error: "Stationen är inte aktiverad. Ange aktiveringskod." }, 401);
  const { station, expiresAt } = ctx;

  const mode = String(body.mode ?? "lookup");
  const rawIdentifier = String(body.identifier ?? "").trim();
  const action = String(body.action ?? "") as PunchType;
  const occurredAtInput = body.occurred_at ? String(body.occurred_at) : null;

  if (!rawIdentifier) return json(req, { error: "Ange personnummer eller kortnummer." }, 400);

  if (!(await checkRateLimit(db, station.id))) {
    return json(req, { error: "För många försök. Vänta en minut och försök igen." }, 429);
  }

  // ---- Uppslag ----
  const pnr = normalizePnr(rawIdentifier);
  let hit: EmployeeHit | null = null;
  let hash: string | null = null;

  if (pnr) {
    hash = await pnrHash(pnr);
    const { data } = await db
      .from("employees")
      .select("id, first_name, last_name, pnr_masked, is_active")
      .eq("pnr_hash", hash)
      .maybeSingle();
    hit = (data as EmployeeHit | null) ?? null;
  }
  if (!hit) {
    const { data } = await db
      .from("employees")
      .select("id, first_name, last_name, pnr_masked, is_active")
      .eq("alt_clock_identifier", rawIdentifier)
      .maybeSingle();
    hit = (data as EmployeeHit | null) ?? null;
  }

  if (!hit || !hit.is_active) {
    // Okänd person → väntande registrering, ingen stämpling tillåten
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
      const { data: existing } = await db
        .from("clock_pending_registrations")
        .select("id, attempts")
        .eq("pnr_hash", hash)
        .eq("status", "pending")
        .maybeSingle();
      if (existing) {
        await db
          .from("clock_pending_registrations")
          .update({ attempts: ((existing.attempts as number) ?? 1) + 1 })
          .eq("id", existing.id);
      } else {
        await db.from("clock_pending_registrations").insert(pendingRow);
      }
    } else {
      await db.from("clock_pending_registrations").insert(pendingRow);
    }
    return json(
      req,
      {
        status: "pending_registration",
        message: "Registrering väntar på godkännande.",
        expires_at: expiresAt,
      },
      200,
    );
  }

  // Senaste stämpling idag för att föreslå nästa åtgärd
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const { data: recent } = await db
    .from("time_entries")
    .select("id, type, occurred_at")
    .eq("employee_id", hit.id)
    .gte("occurred_at", dayStart.toISOString())
    .order("occurred_at", { ascending: false })
    .limit(1);
  const last = recent?.[0]?.type as PunchType | undefined;
  const suggested: PunchType =
    last === "in" || last === "rast_slut" ? "ut" : last === "rast_start" ? "rast_slut" : "in";

  if (mode === "lookup") {
    return json(req, {
      status: "found",
      employee: {
        id: hit.id,
        first_name: hit.first_name,
        pnr_masked: hit.pnr_masked ?? (pnr ? maskPnr(pnr) : null),
      },
      last_type: last ?? null,
      suggested_action: suggested,
      expires_at: expiresAt,
    });
  }

  // ---- Stämpling ----
  if (!PUNCH_TYPES.includes(action)) {
    return json(req, { error: "Ogiltig åtgärd." }, 400);
  }

  const occurredRaw = occurredAtInput ?? new Date().toISOString();
  const occurredAt =
    action === "in" || action === "ut" ? applyRounding(occurredRaw, station.profile) : occurredRaw;

  const { data: inserted, error } = await db
    .from("time_entries")
    .insert({
      employee_id: hit.id,
      station_id: station.id,
      store_id: station.store_id,
      legal_entity_id: station.legal_entity_id,
      type: action,
      occurred_at: occurredAt,
      registered_at: new Date().toISOString(),
      source: "clock",
      note: body.note ? String(body.note).slice(0, 500) : null,
    })
    .select("id, type, occurred_at, registered_at")
    .single();

  if (error) {
    console.error("clock-punch insert failed", error.message);
    return json(req, { error: "Kunde inte spara stämplingen." }, 500);
  }

  return json(req, {
    status: "punched",
    entry: inserted,
    employee: { first_name: hit.first_name, pnr_masked: hit.pnr_masked },
    expires_at: expiresAt,
  });
});
