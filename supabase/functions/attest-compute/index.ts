/**
 * attest-compute — matchar stämplingar (time_entries) mot publicerade pass
 * (shifts) och skriver attestrader.
 *
 * Modell "delar": tid inom schemat är godkänd direkt. Varje del utanför schemat
 * (stämplade in tidigare/senare, ut tidigare/senare, ej schemalagd tid, ingen
 * stämpling) blir en egen avvikelse som chefen attesterar via
 * decide_attestation_part. Avvikelser inom stationens tolerans (default 7 min)
 * räknas som schematid. Godkänd tid och fönster (payroll_in/payroll_out) räknas
 * alltid i databasen av attestation_apply_parts — aldrig här.
 * Anropas både av cron och på begäran från attestvyn.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { passGranser, svenskDagSista, svenskDagStart, svenskDatum, svenskVeckodag } from "../_shared/setime.ts";

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
  rounded_at: string | null;
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
  // Nattkörningen (04:40) attesterar de senaste sju AVSLUTADE dagarna — aldrig dagen som
  // just börjat. Annars blir dagens pass "missat pass, 0 min" innan någon hunnit stämpla,
  // och Min tid/löneunderlaget visar 0 timmar.
  const dayBefore = (d: string, n: number) => {
    const t = new Date(`${d}T12:00:00Z`);
    t.setUTCDate(t.getUTCDate() - n);
    return t.toISOString().slice(0, 10);
  };
  const from: string = body.from ?? (cron ? dayBefore(today, 7) : today);
  const to: string = body.to ?? (cron && !body.from ? dayBefore(today, 1) : from);

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

  // Hämta alla bolags pass — en person med pass i en annan enhet samma dag får aldrig
  // en extra "oplanerad" rad här, annars betalas samma stämplade tid två gånger.
  const allShifts: Record<string, any>[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data: page, error: shiftErr } = await db
      .from("shifts")
      .select("*")
      .eq("status", "published")
      .gte("date", from)
      .lte("date", to)
      .order("id", { ascending: true })
      .range(offset, offset + 999);
    if (shiftErr) return json({ error: shiftErr.message }, 500);
    allShifts.push(...(page ?? []));
    if (!page || page.length < 1000) break;
  }
  const shiftDays = new Set(allShifts.filter((s) => s.employee_id).map((s) => `${s.employee_id}|${s.date}`));
  const shifts = storeId ? allShifts.filter((s) => s.store_id === storeId) : allShifts;

  const fromIso = svenskDagStart(from).toISOString();
  const toIso = svenskDagSista(to).toISOString();
  // Hämta ALLA stämplingar sida för sida — databasen ger högst 1 000 rader per anrop,
  // och en avklippt lista gör att riktiga pass blir "missat pass" med 0 minuter.
  const rawEntries: Record<string, unknown>[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    let entryQuery = db
      .from("time_entries")
      .select("id, employee_id, store_id, legal_entity_id, station_id, type, occurred_at, rounded_at, corrects_entry_id, correction_kind")
      .gte("occurred_at", fromIso)
      .lte("occurred_at", toIso)
      .order("occurred_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    // Inget butiksfilter: dagens tid räknas per person, oavsett vilken station som användes.
    const { data: page, error: entryErr } = await entryQuery;
    if (entryErr) return json({ error: entryErr.message }, 500);
    rawEntries.push(...(page ?? []));
    if (!page || page.length < PAGE) break;
  }

  // Append-only-journalen: korrigerade poster och makuleringar räknas bort. Testpersoner attesteras aldrig.
  const corrected = new Set(
    (rawEntries ?? []).map((e) => (e as Entry).corrects_entry_id).filter(Boolean) as string[],
  );
  const { data: testRows } = await db.from("employees").select("id").eq("is_test", true);
  const testIds = new Set(((testRows ?? []) as { id: string }[]).map((r) => r.id));
  const entries = (rawEntries ?? []).filter((e) => {
    const row = e as Entry & { correction_kind?: string | null };
    return !corrected.has(row.id) && row.correction_kind !== "void" && !testIds.has(row.employee_id);
  }) as Entry[];

  // Stationstoleranser
  const { data: stations } = await db.from("clock_stations").select("id, profile");
  const tolerance = new Map<string, number>();
  for (const s of stations ?? []) {
    const prof = (s.profile ?? {}) as { tolerance_minutes?: number };
    tolerance.set(s.id as string, prof.tolerance_minutes ?? DEFAULT_TOLERANCE);
  }

  // Fast starttid: samma regel som arbetstidsmotorn använder för dagens första instämpling.
  const { data: fixedRules } = await db
    .from("employee_fixed_start_rules")
    .select("employee_id, weekdays, start_time, valid_from, valid_to, active")
    .eq("active", true);
  const calcIn = (employeeId: string, date: string, entry: Entry): Date => {
    const rule = ((fixedRules ?? []) as { employee_id: string; weekdays: number[]; start_time: string; valid_from: string; valid_to: string | null }[])
      .filter((r) => r.employee_id === employeeId && r.valid_from <= date && (!r.valid_to || r.valid_to >= date) && (r.weekdays ?? []).includes(svenskVeckodag(date)))
      .sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0];
    if (rule) return passGranser(date, rule.start_time, rule.start_time).from;
    return new Date(entry.rounded_at ?? entry.occurred_at);
  };
  const calcAt = (entry: Entry) => new Date(entry.rounded_at ?? entry.occurred_at);
  const mins = (ms: number) => Math.round(ms / 60000);

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
      // Pass utan stämpling: hela passet är en avvikelse — stämplad tid (0) eller schematid.
      rows.push({
        store_id: shift.store_id,
        legal_entity_id: shift.legal_entity_id,
        date: shift.date,
        employee_id: shift.employee_id,
        shift_id: shift.id,
        computed: {
          model: "delar",
          scheduled_minutes: scheduled,
          clocked_minutes: 0,
          diff_minutes: -scheduled,
          tolerance_minutes: tol,
          sched_from: schedFrom.toISOString(),
          sched_to: schedTo.toISOString(),
          tol_short_minutes: 0,
          parts: [{ kind: "missat_pass", minutes: scheduled, sched: schedFrom.toISOString(), sched_end: schedTo.toISOString() }],
        },
        deviation_type: "missat_pass",
        status: "flagged",
        basis: null,
        approved_minutes: null,
        decided_at: null,
      });
      continue;
    }

    // Råminuterna (utan attestklippning) från samma SQL-motor som lönen använder.
    const { data: calculated, error: calculationError } = await db.rpc("berakna_arbetstid_rad", {
      _employee_id: shift.employee_id,
      _from: shift.date,
      _to: shift.date,
      _attesterat: false,
    });
    if (calculationError) return json({ error: calculationError.message }, 500);
    const engineDay = (calculated ?? []).find((day: { arbetsdag: string }) => day.arbetsdag === shift.date) as {
      total_minutes?: number;
      break_minutes?: number;
    } | undefined;
    const breakMinutes = Number(engineDay?.break_minutes ?? 0);
    const clocked = Number(engineDay?.total_minutes ?? 0);
    const base = {
      scheduled_minutes: scheduled,
      clocked_minutes: clocked,
      diff_minutes: clocked - scheduled,
      break_minutes: breakMinutes,
      scheduled_break_minutes: shift.break_minutes ?? 0,
      tolerance_minutes: tol,
      first_in: firstIn,
      last_out: lastOut,
    };

    if (!lastOut) {
      // Saknar utstämpling: kan inte delas upp — hela dagen granskas som förut.
      rows.push({
        store_id: shift.store_id,
        legal_entity_id: shift.legal_entity_id,
        date: shift.date,
        employee_id: shift.employee_id,
        shift_id: shift.id,
        computed: { ...base, missing_out: true },
        deviation_type: "tidig_ut",
        status: "flagged",
        basis: null,
        approved_minutes: null,
        decided_at: null,
      });
      continue;
    }

    const effIn = calcIn(shift.employee_id, shift.date, ins[0]);
    const effOut = calcAt(outs[outs.length - 1]);
    const parts: Record<string, unknown>[] = [];
    let tolShort = 0;
    const earlyIn = mins(schedFrom.getTime() - effIn.getTime());
    if (earlyIn > tol) {
      parts.push({ kind: "tidig_in", minutes: earlyIn, stamp: effIn.toISOString(), sched: schedFrom.toISOString() });
    } else if (earlyIn < 0) {
      const late = Math.min(-earlyIn, scheduled);
      if (late > tol) parts.push({ kind: "sen_in", minutes: late, stamp: effIn.toISOString(), sched: schedFrom.toISOString() });
      else tolShort += late;
    }
    const lateOut = mins(effOut.getTime() - schedTo.getTime());
    if (lateOut > tol) {
      parts.push({ kind: "sen_ut", minutes: lateOut, stamp: effOut.toISOString(), sched: schedTo.toISOString() });
    } else if (lateOut < 0) {
      const early = Math.min(-lateOut, scheduled);
      if (early > tol) parts.push({ kind: "tidig_ut", minutes: early, stamp: effOut.toISOString(), sched: schedTo.toISOString() });
      else tolShort += early;
    }

    let deviation: string = parts.length ? String(parts[0].kind) : "none";
    if (!parts.length && (shift.break_minutes ?? 0) > 0 && breakMinutes + tol < (shift.break_minutes ?? 0)) deviation = "missad_rast";

    rows.push({
      store_id: shift.store_id,
      legal_entity_id: shift.legal_entity_id,
      date: shift.date,
      employee_id: shift.employee_id,
      shift_id: shift.id,
      computed: {
        ...base,
        model: "delar",
        late_in_minutes: -earlyIn,
        early_out_minutes: -lateOut,
        sched_from: schedFrom.toISOString(),
        sched_to: schedTo.toISOString(),
        eff_in: effIn.toISOString(),
        eff_out: effOut.toISOString(),
        tol_short_minutes: tolShort,
        parts,
      },
      deviation_type: deviation,
      status: "flagged",
      basis: null,
      approved_minutes: null,
      decided_at: null,
    });
  }

  // Stämplingar utan pass = oplanerad tid
  for (const [key, dayEntries] of byKey) {
    if (handled.has(key) || shiftDays.has(key)) continue;
    const [employeeId, date] = key.split("|");
    const ins = dayEntries.filter((e) => e.type === "in");
    const outs = dayEntries.filter((e) => e.type === "ut");
    if (!ins.length) continue;
    const firstIn = ins[0].occurred_at;
    const lastOut = outs[outs.length - 1]?.occurred_at ?? null;
    const { data: calculated, error: calculationError } = await db.rpc("berakna_arbetstid_rad", {
      _employee_id: employeeId,
      _from: date,
      _to: date,
      _attesterat: false,
    });
    if (calculationError) return json({ error: calculationError.message }, 500);
    const engineDay = (calculated ?? []).find((day: { arbetsdag: string }) => day.arbetsdag === date) as { total_minutes?: number } | undefined;
    const clocked = Number(engineDay?.total_minutes ?? 0);
    const store = dayEntries.find((e) => e.store_id)?.store_id ?? null;
    if (!store) continue;
    if (storeId && store !== storeId) continue;
    const base = { scheduled_minutes: 0, clocked_minutes: clocked, diff_minutes: clocked, first_in: firstIn, last_out: lastOut };
    if (!lastOut) {
      rows.push({
        store_id: store,
        legal_entity_id: dayEntries.find((e) => e.legal_entity_id)?.legal_entity_id ?? null,
        date, employee_id: employeeId, shift_id: null,
        computed: { ...base, missing_out: true },
        deviation_type: "oplanerad_tid", status: "flagged", basis: null, approved_minutes: null, decided_at: null,
      });
      continue;
    }
    const effIn = calcIn(employeeId, date, ins[0]);
    const effOut = calcAt(outs[outs.length - 1]);
    // Ingen schemalagd tid: hela dagen ligger utanför schemat och betalas först när den är godkänd.
    rows.push({
      store_id: store,
      legal_entity_id: dayEntries.find((e) => e.legal_entity_id)?.legal_entity_id ?? null,
      date,
      employee_id: employeeId,
      shift_id: null,
      computed: {
        ...base,
        model: "delar",
        eff_in: effIn.toISOString(),
        eff_out: effOut.toISOString(),
        tol_short_minutes: 0,
        parts: [{ kind: "oplanerad", minutes: clocked, stamp: effIn.toISOString(), stamp_end: effOut.toISOString() }],
      },
      deviation_type: "oplanerad_tid",
      status: "flagged",
      basis: null,
      approved_minutes: null,
      decided_at: null,
    });
  }

  // Dagens pass är inte klara — räknas inte. Redan godkända/avslagna beslut skrivs aldrig över,
  // UTOM när beslutet var 0 minuter och det nu finns riktig stämplad tid (stämplingar kom in sent).
  const { data: existing } = await db
    .from("attestations")
    .select("store_id, date, employee_id, shift_id, status, approved_minutes")
    .gte("date", from)
    .lte("date", to)
    .in("status", ["approved", "rejected"]);
  const decided = new Map<string, { status: string; approved_minutes: number | null }>();
  for (const r of (existing ?? []) as {
    store_id: string; date: string; employee_id: string; shift_id: string | null; status: string; approved_minutes: number | null;
  }[]) {
    decided.set(`${r.store_id}|${r.date}|${r.employee_id}|${r.shift_id ?? ""}`, r);
  }

  let written = 0;
  let preserved = 0;
  let reopened = 0;
  const skipped: string[] = [];
  for (const row of rows) {
    // Dagens (och framtida) pass är inte klara — skrivs aldrig, inte heller av nattkörningen.
    if ((row.date as string) >= today) continue;
    const prev = decided.get(`${row.store_id}|${row.date}|${row.employee_id}|${row.shift_id ?? ""}`);
    if (prev) {
      const nowClocked = Number((row.computed as { clocked_minutes?: number }).clocked_minutes ?? 0);
      const zeroDecision = prev.status === "approved" && Number(prev.approved_minutes ?? 0) === 0;
      if (!(zeroDecision && nowClocked > 0)) {
        preserved += 1;
        continue;
      }
      reopened += 1;
    }
    // Unika villkoret matchar inte NULL i shift_id — rensa gammal oplanerad rad först.
    if (row.shift_id === null) {
      await db
        .from("attestations")
        .delete()
        .eq("store_id", row.store_id as string)
        .eq("date", row.date as string)
        .eq("employee_id", row.employee_id as string)
        .is("shift_id", null)
        .in("status", ["flagged", "auto_approved"]);
    }
    const { data: saved, error } = await db
      .from("attestations")
      .upsert(row, { onConflict: "store_id,date,employee_id,shift_id", ignoreDuplicates: false })
      .select("id")
      .single();
    if (error) {
      skipped.push(`${row.date} ${String(row.employee_id).slice(0, 8)}: ${error.message}`);
      continue;
    }
    written += 1;
    // Godkänd tid, status och fönster räknas i databasen utifrån delarna och tidigare beslut.
    if ((row.computed as { model?: string }).model === "delar") {
      const { error: applyError } = await db.rpc("attestation_apply_parts", { _id: saved.id });
      if (applyError) skipped.push(`${row.date} ${String(row.employee_id).slice(0, 8)}: ${applyError.message}`);
    }
  }

  return json({
    written,
    preserved,
    reopened,
    deviation_parts: rows.reduce((n, r) => n + (((r.computed as { parts?: unknown[] }).parts ?? []).length), 0),
    skipped,
  });
});
