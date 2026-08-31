/**
 * attest-compute — matchar stämplingar (time_entries) mot publicerade pass
 * (shifts) och skriver attestrader.
 *
 * Inom stationens tolerans_minuter (klockprofilen, default 7) blir raden
 * auto_approved med schematid som underlag. Utanför tolerans blir den flagged
 * med avvikelsetyp. Stämpling utan pass = oplanerad_tid, pass utan stämpling =
 * missat_pass. Anropas både av cron och på begäran från attestvyn.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { passGranser, svenskDagSista, svenskDagStart, svenskDatum } from "../_shared/setime.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const url = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const DEFAULT_TOLERANCE = 7;

interface Entry {
  employee_id: string;
  store_id: string | null;
  legal_entity_id: string | null;
  station_id: string | null;
  type: string;
  occurred_at: string;
  corrects_entry_id: string | null;
  id: string;
}

/** Svenskt datum för en tidpunkt. */
function seDate(iso: string): string {
  return svenskDatum(iso);
}


function shiftBounds(date: string, start: string, end: string) {
  return passGranser(date, start, end);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  const storeId: string | null = body.store_id ?? null;
  const cron: boolean = Boolean(body.cron);
  const today = svenskDatum();
  const from: string = body.from ?? today;
  const to: string = body.to ?? from;

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Behörighet: on-demand-anrop måste komma från en chef med butiksbehörighet.
  if (!cron) {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Saknar autentisering" }, 401);
    const asUser = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: user } = await asUser.auth.getUser();
    if (!user?.user) return json({ error: "Ogiltig session" }, 401);
    if (storeId) {
      const { data: allowed } = await asUser.rpc("can_manage_schedule", {
        _store_id: storeId,
        _legal_entity_id: null,
      });
      if (!allowed) return json({ error: "Saknar behörighet för enheten" }, 403);
    }
  }

  let shiftQuery = db
    .from("shifts")
    .select("*")
    .eq("status", "published")
    .gte("date", from)
    .lte("date", to);
  if (storeId) shiftQuery = shiftQuery.eq("store_id", storeId);
  const { data: shifts, error: shiftErr } = await shiftQuery;
  if (shiftErr) return json({ error: shiftErr.message }, 500);

  const fromIso = svenskDagStart(from).toISOString();
  const toIso = svenskDagSista(to).toISOString();
  let entryQuery = db
    .from("time_entries")
    .select("id, employee_id, store_id, legal_entity_id, station_id, type, occurred_at, corrects_entry_id")
    .gte("occurred_at", fromIso)
    .lte("occurred_at", toIso)
    .order("occurred_at", { ascending: true });
  if (storeId) entryQuery = entryQuery.eq("store_id", storeId);
  const { data: rawEntries, error: entryErr } = await entryQuery;
  if (entryErr) return json({ error: entryErr.message }, 500);

  // Append-only-journalen: korrigerade poster räknas bort.
  const corrected = new Set(
    (rawEntries ?? []).map((e) => (e as Entry).corrects_entry_id).filter(Boolean) as string[],
  );
  const entries = (rawEntries ?? []).filter((e) => !corrected.has((e as Entry).id)) as Entry[];

  // Stationstoleranser
  const { data: stations } = await db.from("clock_stations").select("id, profile");
  const tolerance = new Map<string, number>();
  for (const s of stations ?? []) {
    const prof = (s.profile ?? {}) as { tolerance_minutes?: number };
    tolerance.set(s.id as string, prof.tolerance_minutes ?? DEFAULT_TOLERANCE);
  }

  // Gruppera stämplingar per person + svenskt datum
  const byKey = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = `${e.employee_id}|${seDate(e.occurred_at)}`;
    const grouped = byKey.get(key);
    if (grouped) grouped.push(e);
    else byKey.set(key, [e]);
  }

  const rows: Record<string, unknown>[] = [];
  const handled = new Set<string>();

  for (const shift of shifts ?? []) {
    if (!shift.employee_id) continue;
    const key = `${shift.employee_id}|${shift.date}`;
    handled.add(key);
    const dayEntries = byKey.get(key) ?? [];
    const tol = tolerance.get(dayEntries.find((e) => e.station_id)?.station_id ?? "") ?? DEFAULT_TOLERANCE;
    const { from: schedFrom, to: schedTo } = shiftBounds(shift.date, shift.start_time, shift.end_time);
    const scheduled = Math.max(
      0,
      Math.round((schedTo.getTime() - schedFrom.getTime()) / 60000) - (shift.break_minutes ?? 0),
    );

    const ins = dayEntries.filter((e) => e.type === "in");
    const outs = dayEntries.filter((e) => e.type === "ut");
    const firstIn = ins[0]?.occurred_at ?? null;
    const lastOut = outs[outs.length - 1]?.occurred_at ?? null;

    if (!firstIn) {
      rows.push({
        store_id: shift.store_id,
        legal_entity_id: shift.legal_entity_id,
        date: shift.date,
        employee_id: shift.employee_id,
        shift_id: shift.id,
        computed: { scheduled_minutes: scheduled, clocked_minutes: 0, diff_minutes: -scheduled, tolerance_minutes: tol },
        deviation_type: "missat_pass",
        status: "flagged",
      });
      continue;
    }

    // Samma SQL-motor används av attest, Min tid och löneunderlag. Attestvyn
    // får bara använda råstämplingarna för avvikelsens start/slut — minuter och
    // rast kommer från berakna_arbetstid.
    const { data: calculated, error: calculationError } = await db.rpc("berakna_arbetstid", {
      _employee_id: shift.employee_id,
      _from: shift.date,
      _to: shift.date,
    });
    if (calculationError) return json({ error: calculationError.message }, 500);
    const engineDay = (calculated ?? []).find((day) => day.arbetsdag === shift.date) as {
      total_minutes?: number;
      break_minutes?: number;
    } | undefined;
    const breakMinutes = Number(engineDay?.break_minutes ?? 0);
    const clocked = Number(engineDay?.total_minutes ?? 0);
    const lateIn = Math.round((new Date(firstIn).getTime() - schedFrom.getTime()) / 60000);
    const earlyOut = lastOut ? Math.round((schedTo.getTime() - new Date(lastOut).getTime()) / 60000) : 0;
    const diff = clocked - scheduled;

    let deviation: string = "none";
    if (lateIn > tol) deviation = "sen_in";
    else if (earlyOut > tol) deviation = "tidig_ut";
    else if ((shift.break_minutes ?? 0) > 0 && breakMinutes + tol < (shift.break_minutes ?? 0))
      deviation = "missad_rast";
    else if (Math.abs(diff) > tol) deviation = diff > 0 ? "oplanerad_tid" : "tidig_ut";

    rows.push({
      store_id: shift.store_id,
      legal_entity_id: shift.legal_entity_id,
      date: shift.date,
      employee_id: shift.employee_id,
      shift_id: shift.id,
      computed: {
        scheduled_minutes: scheduled,
        clocked_minutes: clocked,
        diff_minutes: diff,
        late_in_minutes: lateIn,
        early_out_minutes: earlyOut,
        break_minutes: breakMinutes,
        scheduled_break_minutes: shift.break_minutes ?? 0,
        tolerance_minutes: tol,
        first_in: firstIn,
        last_out: lastOut,
      },
      deviation_type: deviation,
      status: deviation === "none" ? "auto_approved" : "flagged",
      basis: deviation === "none" ? "schema" : null,
      approved_minutes: deviation === "none" ? scheduled : null,
      decided_at: deviation === "none" ? new Date().toISOString() : null,
    });
  }

  // Stämplingar utan pass = oplanerad tid
  for (const [key, dayEntries] of byKey) {
    if (handled.has(key)) continue;
    const [employeeId, date] = key.split("|");
    const ins = dayEntries.filter((e) => e.type === "in");
    const outs = dayEntries.filter((e) => e.type === "ut");
    if (!ins.length) continue;
    const firstIn = ins[0].occurred_at;
    const lastOut = outs[outs.length - 1]?.occurred_at ?? null;
    const { data: calculated, error: calculationError } = await db.rpc("berakna_arbetstid", {
      _employee_id: employeeId,
      _from: date,
      _to: date,
    });
    if (calculationError) return json({ error: calculationError.message }, 500);
    const engineDay = (calculated ?? []).find((day) => day.arbetsdag === date) as { total_minutes?: number } | undefined;
    const clocked = Number(engineDay?.total_minutes ?? 0);
    const store = dayEntries.find((e) => e.store_id)?.store_id ?? null;
    if (!store) continue;
    if (storeId && store !== storeId) continue;
    rows.push({
      store_id: store,
      legal_entity_id: dayEntries.find((e) => e.legal_entity_id)?.legal_entity_id ?? null,
      date,
      employee_id: employeeId,
      shift_id: null,
      computed: {
        scheduled_minutes: 0,
        clocked_minutes: clocked,
        diff_minutes: clocked,
        first_in: firstIn,
        last_out: lastOut,
      },
      deviation_type: "oplanerad_tid",
      status: "flagged",
    });
  }

  let written = 0;
  const skipped: string[] = [];
  for (const row of rows) {
    // Unika villkoret matchar inte NULL i shift_id — rensa gammal oplanerad rad först.
    if (row.shift_id === null) {
      await db
        .from("attestations")
        .delete()
        .eq("store_id", row.store_id as string)
        .eq("date", row.date as string)
        .eq("employee_id", row.employee_id as string)
        .is("shift_id", null);
    }
    const { error } = await db
      .from("attestations")
      .upsert(row, { onConflict: "store_id,date,employee_id,shift_id", ignoreDuplicates: false });
    if (error) skipped.push(`${row.date} ${String(row.employee_id).slice(0, 8)}: ${error.message}`);
    else written += 1;
  }

  return json({
    written,
    flagged: rows.filter((r) => r.status === "flagged").length,
    auto_approved: rows.filter((r) => r.status === "auto_approved").length,
    skipped,
  });
});
