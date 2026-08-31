/**
 * payroll-compute — bygger löneunderlag (payroll_lines) för ett bolag och en
 * löneperiod (YYYY-MM).
 *
 * Ansvarsgräns: Makrilltrade är master för ENHETER (timmar, OB-timmar, dagar,
 * omfattning). Kronor som beräknas här är enbart preliminära KPI-värden för
 * granskning — Fortnox Lön avgör bruttolön, skatt och utbetalning.
 *
 * Steg:
 *  a) attesterad tid (status approved/auto_approved) per person och dag
 *  b) OB-fördelning enligt payroll_policies + holiday_calendar (minutprecision)
 *  c) mertid/övertid mot schemalagd tid och veckotröskel per avtalsområde
 *  d) frånvaro: godkända absence_requests + sjukperioder
 *  e) förmåner enligt benefits
 *  f) avdrag enligt payroll_deductions
 *  g) preliminär kostnad per rad (lön + semesterreserv + arbetsgivaravgift)
 *
 * Idempotent: icke-exporterade rader för perioden ersätts vid omkörning,
 * exporterade rader lämnas orörda så att rättelsediffen kan göras vid export.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const url = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !serviceKey) throw new Error("Serverkonfiguration saknas");

interface ObLevel {
  code: string;
  name?: string;
  weekdays?: number[];
  from: string;
  to: string;
  pct: number;
  holiday?: boolean;
}

interface Policy {
  id: string;
  agreement_area: string;
  valid_from: string;
  valid_to: string | null;
  ob_levels: ObLevel[];
  overtime_rules: Record<string, unknown>;
  no_ob_and_overtime_overlap: boolean;
  vacation_reserve_pct: number;
}

interface Attestation {
  id: string;
  employee_id: string;
  store_id: string;
  date: string;
  status: string;
  basis: string | null;
  approved_minutes: number | null;
  computed: Record<string, number | string | null>;
}

interface Employment {
  id: string;
  employee_id: string;
  legal_entity_id: string | null;
  store_id: string | null;
  pay_type: string | null;
  monthly_salary: number | null;
  hourly_rate: number | null;
  employment_rate: number | null;
  agreement_area: string | null;
  cost_center: string | null;
  start_date: string | null;
  end_date: string | null;
  fortnox_employee_id: string | null;
  is_active: boolean | null;
}

interface Holiday {
  holiday_date: string;
  is_half_day: boolean;
  is_public_holiday: boolean;
}

type Line = {
  period_id: string;
  legal_entity_id: string;
  store_id: string | null;
  employee_id: string;
  employment_id: string | null;
  line_type: string;
  line_date: string;
  quantity: number;
  extent_pct?: number | null;
  unit_amount?: number | null;
  cost_center?: string | null;
  source_ref?: string | null;
  source_type?: string | null;
  note?: string | null;
  preliminary_cost?: number | null;
  export_status: string;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const monthBounds = (period: string) => {
  const [y, m] = period.split("-").map(Number);
  const from = `${period}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from, to: `${period}-${String(last).padStart(2, "0")}` };
};
const minutesOfDay = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};
/** ISO-vecka som nyckel, för veckotröskeln på övertid. */
const isoWeekKey = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-${String(week).padStart(2, "0")}`;
};

/**
 * Delar ett dagspass i OB-fönster med minutprecision. Passet uttrycks som
 * start-minut på dygnet plus längd, vilket räcker eftersom attestunderlaget är
 * per dag. Överlappande fönster löses med högsta procent.
 */
function splitOb(date: string, startMinute: number, minutes: number, levels: ObLevel[], holidays: Map<string, Holiday>) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const holiday = holidays.get(date);
  const isHoliday = Boolean(holiday?.is_public_holiday);
  const halfDayFrom = holiday?.is_half_day ? 12 * 60 : null;
  const perCode = new Map<string, number>();
  let plain = 0;

  for (let offset = 0; offset < minutes; offset += 1) {
    const minute = (startMinute + offset) % 1440;
    const treatAsHoliday = isHoliday || (halfDayFrom !== null && minute >= halfDayFrom);
    const matching = levels.filter((level) => {
      if (level.holiday || treatAsHoliday) {
        if (!level.holiday && !(level.weekdays ?? []).includes(weekday)) return false;
      } else if (level.weekdays && !level.weekdays.includes(weekday)) return false;
      const from = minutesOfDay(level.from);
      const to = level.to === "24:00" ? 1440 : minutesOfDay(level.to);
      return minute >= from && minute < to;
    });
    const best = matching.sort((a, b) => b.pct - a.pct)[0];
    if (!best) plain += 1;
    else perCode.set(best.code, (perCode.get(best.code) ?? 0) + 1);
  }
  return { plainMinutes: plain, obMinutes: perCode };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  const legalEntityId: string | undefined = body.legal_entity_id;
  const period: string | undefined = body.period;
  const force: boolean = Boolean(body.force);
  if (!legalEntityId || !period || !/^\d{4}-\d{2}$/.test(period)) {
    return json({ error: "legal_entity_id och period (YYYY-MM) krävs" }, 400);
  }

  const db = createClient(url, serviceKey);
  const { from, to } = monthBounds(period);
  const issues: { kind: string; detail: string; employee_id?: string }[] = [];

  // Periodrad
  const { data: periodRow, error: periodErr } = await db
    .from("payroll_periods")
    .upsert({ legal_entity_id: legalEntityId, period }, { onConflict: "legal_entity_id,period" })
    .select("*")
    .single();
  if (periodErr || !periodRow) return json({ error: periodErr?.message ?? "Kunde inte skapa löneperioden" }, 500);
  if (periodRow.status === "exported" && !force) {
    return json({ error: "Perioden är exporterad. Öppna den för rättelse innan omkörning." }, 409);
  }

  // Anställningar i bolaget
  const { data: employments = [] } = await db
    .from("employments")
    .select("id, employee_id, legal_entity_id, store_id, pay_type, monthly_salary, hourly_rate, employment_rate, agreement_area, cost_center, start_date, end_date, fortnox_employee_id, is_active")
    .eq("legal_entity_id", legalEntityId);
  const employmentByEmployee = new Map<string, Employment>();
  (employments as Employment[]).forEach((e) => {
    if (e.is_active === false) return;
    if (!employmentByEmployee.has(e.employee_id)) employmentByEmployee.set(e.employee_id, e);
  });
  if (employmentByEmployee.size === 0) {
    return json({ error: "Inga aktiva anställningar i bolaget för perioden" }, 400);
  }

  // Periodlås per enhet — alla berörda enheter måste vara låsta
  const storeIds = [...new Set([...employmentByEmployee.values()].map((e) => e.store_id).filter(Boolean))] as string[];
  const { data: locks = [] } = await db
    .from("period_locks")
    .select("store_id, period, locked_at, unlocked_at")
    .eq("period", period)
    .in("store_id", storeIds.length ? storeIds : ["00000000-0000-0000-0000-000000000000"]);
  const lockedStores = new Set((locks as { store_id: string; unlocked_at: string | null }[]).filter((l) => !l.unlocked_at).map((l) => l.store_id));
  const unlocked = storeIds.filter((id) => !lockedStores.has(id));

  // Policyer, helgdagar, mappning
  const { data: policies = [] } = await db
    .from("payroll_policies")
    .select("id, agreement_area, valid_from, valid_to, ob_levels, overtime_rules, no_ob_and_overtime_overlap, vacation_reserve_pct")
    .eq("legal_entity_id", legalEntityId)
    .lte("valid_from", to)
    .order("valid_from", { ascending: false });
  const policyFor = (area: string | null): Policy | undefined =>
    (policies as Policy[]).find((p) => p.agreement_area === (area ?? "butik") && (!p.valid_to || p.valid_to >= from)) ??
    (policies as Policy[])[0];

  const { data: holidayRows = [] } = await db
    .from("holiday_calendar")
    .select("holiday_date, is_half_day, is_public_holiday, legal_entity_id")
    .gte("holiday_date", from)
    .lte("holiday_date", to);
  const holidays = new Map<string, Holiday>();
  (holidayRows as (Holiday & { legal_entity_id: string | null })[]).forEach((h) => {
    if (h.legal_entity_id === null || h.legal_entity_id === legalEntityId) holidays.set(h.holiday_date, h);
  });

  const { data: wageMap = [] } = await db
    .from("fortnox_wage_code_map")
    .select("line_type, agreement_area, active")
    .eq("legal_entity_id", legalEntityId);
  const mapped = new Set((wageMap as { line_type: string; active: boolean }[]).filter((m) => m.active).map((m) => m.line_type));

  // Attesterad tid
  const employeeIds = [...employmentByEmployee.keys()];
  const { data: attestations = [] } = await db
    .from("attestations")
    .select("id, employee_id, store_id, date, status, basis, approved_minutes, computed")
    .gte("date", from)
    .lte("date", to)
    .in("employee_id", employeeIds)
    .in("status", ["approved", "auto_approved"]);

  // Schemalagd tid för mertidsjämförelse
  const { data: shifts = [] } = await db
    .from("shifts")
    .select("employee_id, date, start_time, end_time, break_minutes, status")
    .gte("date", from)
    .lte("date", to)
    .in("employee_id", employeeIds)
    .eq("status", "published");
  const shiftByKey = new Map<string, { start_time: string; end_time: string; break_minutes: number | null }>();
  (shifts as { employee_id: string; date: string; start_time: string; end_time: string; break_minutes: number | null }[]).forEach((s) => {
    shiftByKey.set(`${s.employee_id}|${s.date}`, s);
  });

  // Frånvaro och sjukperioder
  const { data: absences = [] } = await db
    .from("absence_requests")
    .select("id, employee_id, store_id, absence_type_id, start_date, end_date, extent_pct, status")
    .eq("status", "approved")
    .lte("start_date", to)
    .gte("end_date", from)
    .in("employee_id", employeeIds);
  const { data: absenceTypes = [] } = await db.from("absence_types").select("id, code, is_sick");
  const absenceCode = new Map((absenceTypes as { id: string; code: string }[]).map((t) => [t.id, t.code]));
  const { data: sickPeriods = [] } = await db
    .from("sick_periods")
    .select("id, employee_id, first_day, last_day, karens_applied")
    .lte("first_day", to)
    .in("employee_id", employeeIds);

  // Förmåner och avdrag
  const { data: benefits = [] } = await db
    .from("benefits")
    .select("id, employee_id, employment_id, store_id, benefit_type, basis, basis_unit, calculation_rule, meals_included, valid_from, valid_to, active")
    .eq("legal_entity_id", legalEntityId)
    .eq("active", true)
    .lte("valid_from", to);
  const { data: deductions = [] } = await db
    .from("payroll_deductions")
    .select("id, employee_id, employment_id, store_id, deduction_type, amount, amount_period, valid_from, valid_to, active")
    .eq("legal_entity_id", legalEntityId)
    .eq("active", true)
    .lte("valid_from", to);

  // Arbetsgivaravgifter (för preliminär KPI-kostnad)
  const { data: contributionRules = [] } = await db
    .from("employer_contribution_rules")
    .select("legal_entity_id, valid_from, valid_to, birth_year_from, birth_year_to, salary_cap, contribution_rate, active")
    .eq("active", true);
  const { data: employeeRows = [] } = await db
    .from("employees")
    .select("id, birth_date")
    .in("id", employeeIds);
  const birthYear = new Map(
    (employeeRows as { id: string; birth_date: string | null }[]).map((e) => [e.id, e.birth_date ? Number(e.birth_date.slice(0, 4)) : null]),
  );

  const contributionRate = (employeeId: string, monthlyBase: number) => {
    const year = birthYear.get(employeeId) ?? null;
    const candidates = (contributionRules as {
      legal_entity_id: string | null; valid_from: string; valid_to: string | null;
      birth_year_from: number | null; birth_year_to: number | null; salary_cap: number | null; contribution_rate: number;
    }[]).filter((rule) => {
      if (rule.legal_entity_id && rule.legal_entity_id !== legalEntityId) return false;
      if (rule.valid_from > to) return false;
      if (rule.valid_to && rule.valid_to < from) return false;
      if (rule.birth_year_from !== null && (year === null || year < rule.birth_year_from)) return false;
      if (rule.birth_year_to !== null && (year === null || year > rule.birth_year_to)) return false;
      if (rule.salary_cap !== null && monthlyBase > Number(rule.salary_cap)) return false;
      return true;
    });
    if (candidates.length === 0) return 31.42;
    return Number(candidates.sort((a, b) => a.contribution_rate - b.contribution_rate)[0].contribution_rate);
  };

  const lines: Line[] = [];
  const weeklyMinutes = new Map<string, number>();

  const hourlyBase = (emp: Employment) =>
    emp.pay_type === "monthly"
      ? Number(emp.monthly_salary ?? 0) / 165
      : Number(emp.hourly_rate ?? 0);

  const push = (line: Omit<Line, "period_id" | "legal_entity_id" | "export_status">) => {
    lines.push({ ...line, period_id: periodRow.id, legal_entity_id: legalEntityId, export_status: "pending" });
  };

  const costOf = (emp: Employment, hours: number, pct: number, policy?: Policy) => {
    const base = hourlyBase(emp);
    if (!base || !hours) return 0;
    const gross = base * hours * (1 + pct / 100);
    const vacation = gross * (Number(policy?.vacation_reserve_pct ?? 0) / 100);
    const rate = contributionRate(emp.employee_id, Number(emp.monthly_salary ?? base * 165));
    return round2((gross + vacation) * (1 + rate / 100));
  };

  for (const att of attestations as Attestation[]) {
    const emp = employmentByEmployee.get(att.employee_id);
    if (!emp) continue;
    if (emp.start_date && att.date < emp.start_date) {
      issues.push({ kind: "date_outside_employment", detail: `${att.date} före anställningsstart`, employee_id: att.employee_id });
      continue;
    }
    if (emp.end_date && att.date > emp.end_date) {
      issues.push({ kind: "date_outside_employment", detail: `${att.date} efter anställningsslut`, employee_id: att.employee_id });
      continue;
    }
    const policy = policyFor(emp.agreement_area);
    const minutes = att.approved_minutes ?? Number(att.computed?.clocked_minutes ?? att.computed?.scheduled_minutes ?? 0);
    if (minutes <= 0) continue;

    const firstIn = typeof att.computed?.first_in === "string" ? att.computed.first_in : null;
    const startMinute = firstIn
      ? minutesOfDay(new Date(firstIn).toLocaleTimeString("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit" }))
      : minutesOfDay((shiftByKey.get(`${att.employee_id}|${att.date}`)?.start_time ?? "08:00").slice(0, 5));

    const { plainMinutes, obMinutes } = splitOb(att.date, startMinute, minutes, policy?.ob_levels ?? [], holidays);
    const costCenter = emp.cost_center ?? null;

    // Timavlönade får ARB-timmar, månadsavlönade endast avvikelser (TID som referens)
    const baseType = emp.pay_type === "monthly" ? "TID" : "ARB";
    if (mapped.size && !mapped.has(baseType)) issues.push({ kind: "missing_wage_code", detail: baseType, employee_id: att.employee_id });
    if (emp.pay_type !== "monthly") {
      push({
        store_id: att.store_id, employee_id: att.employee_id, employment_id: emp.id,
        line_type: "ARB", line_date: att.date, quantity: round2(minutes / 60),
        cost_center: costCenter, source_ref: att.id, source_type: "attestation",
        preliminary_cost: costOf(emp, minutes / 60, 0, policy),
      });
    }

    for (const [code, obMin] of obMinutes) {
      if (obMin <= 0) continue;
      if (mapped.size && !mapped.has(code)) issues.push({ kind: "missing_wage_code", detail: code, employee_id: att.employee_id });
      const level = (policy?.ob_levels ?? []).find((l) => l.code === code);
      push({
        store_id: att.store_id, employee_id: att.employee_id, employment_id: emp.id,
        line_type: code, line_date: att.date, quantity: round2(obMin / 60),
        cost_center: costCenter, source_ref: att.id, source_type: "attestation",
        note: level?.name ?? null,
        preliminary_cost: costOf(emp, obMin / 60, Number(level?.pct ?? 0), policy),
      });
    }
    void plainMinutes;

    // Mertid för deltid: tid över schemalagd tid samma dag
    const shift = shiftByKey.get(`${att.employee_id}|${att.date}`);
    const scheduled = shift
      ? Math.max(0, minutesOfDay(shift.end_time.slice(0, 5)) - minutesOfDay(shift.start_time.slice(0, 5)) - (shift.break_minutes ?? 0))
      : 0;
    const extra = scheduled > 0 ? minutes - scheduled : 0;
    const partTime = Number(emp.employment_rate ?? 100) < 100;
    const extraRules = (policy?.overtime_rules as { part_time_extra?: { valid_from?: string; first_hours_per_day?: number; first_pct?: number; rest_pct?: number } })?.part_time_extra;
    if (extra > 0 && partTime) {
      const ruleActive = !extraRules?.valid_from || att.date >= extraRules.valid_from;
      const firstBlock = ruleActive ? Math.min(extra, (extraRules?.first_hours_per_day ?? 2) * 60) : extra;
      const restBlock = extra - firstBlock;
      if (mapped.size && !mapped.has("MER")) issues.push({ kind: "missing_wage_code", detail: "MER", employee_id: att.employee_id });
      if (firstBlock > 0) {
        push({
          store_id: att.store_id, employee_id: att.employee_id, employment_id: emp.id,
          line_type: "MER", line_date: att.date, quantity: round2(firstBlock / 60),
          cost_center: costCenter, source_ref: att.id, source_type: "attestation",
          note: `Mertid ${ruleActive ? extraRules?.first_pct ?? 35 : 0} %`,
          preliminary_cost: costOf(emp, firstBlock / 60, ruleActive ? Number(extraRules?.first_pct ?? 35) : 0, policy),
        });
      }
      if (restBlock > 0) {
        push({
          store_id: att.store_id, employee_id: att.employee_id, employment_id: emp.id,
          line_type: "MER", line_date: att.date, quantity: round2(restBlock / 60),
          cost_center: costCenter, source_ref: att.id, source_type: "attestation",
          note: `Mertid ${extraRules?.rest_pct ?? 70} %`,
          preliminary_cost: costOf(emp, restBlock / 60, Number(extraRules?.rest_pct ?? 70), policy),
        });
      }
    }

    // Övertid: veckotröskel per avtalsområde
    const weekKey = `${att.employee_id}|${isoWeekKey(att.date)}`;
    const before = weeklyMinutes.get(weekKey) ?? 0;
    const after = before + minutes;
    weeklyMinutes.set(weekKey, after);
    const threshold = Number((policy?.overtime_rules as { weekly_threshold_hours?: number })?.weekly_threshold_hours ?? 40) * 60;
    const overtime = Math.max(0, after - Math.max(before, threshold));
    if (after > threshold && overtime > 0 && !partTime) {
      const pct = Number((policy?.overtime_rules as { ot_first_pct?: number })?.ot_first_pct ?? 50);
      if (mapped.size && !mapped.has("OT1")) issues.push({ kind: "missing_wage_code", detail: "OT1", employee_id: att.employee_id });
      push({
        store_id: att.store_id, employee_id: att.employee_id, employment_id: emp.id,
        line_type: "OT1", line_date: att.date, quantity: round2(overtime / 60),
        cost_center: costCenter, source_ref: att.id, source_type: "attestation",
        note: `Övertid ${pct} % över ${threshold / 60} h/vecka`,
        preliminary_cost: costOf(emp, overtime / 60, pct, policy),
      });
    }
  }

  // Frånvaro per dag
  for (const req of absences as { id: string; employee_id: string; store_id: string | null; absence_type_id: string; start_date: string; end_date: string; extent_pct: number | null }[]) {
    const emp = employmentByEmployee.get(req.employee_id);
    if (!emp) continue;
    const code = absenceCode.get(req.absence_type_id) ?? "TJL";
    if (mapped.size && !mapped.has(code)) issues.push({ kind: "missing_wage_code", detail: code, employee_id: req.employee_id });
    const start = req.start_date > from ? req.start_date : from;
    const end = req.end_date < to ? req.end_date : to;
    for (let d = new Date(`${start}T12:00:00Z`); d <= new Date(`${end}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
      const day = d.toISOString().slice(0, 10);
      push({
        store_id: req.store_id ?? emp.store_id, employee_id: req.employee_id, employment_id: emp.id,
        line_type: code, line_date: day, quantity: 1, extent_pct: Number(req.extent_pct ?? 100),
        cost_center: emp.cost_center ?? null, source_ref: req.id, source_type: "absence_request",
      });
    }
  }

  for (const sick of sickPeriods as { id: string; employee_id: string; first_day: string; last_day: string | null; karens_applied: boolean | null }[]) {
    const emp = employmentByEmployee.get(sick.employee_id);
    if (!emp) continue;
    const start = sick.first_day > from ? sick.first_day : from;
    const end = (sick.last_day ?? to) < to ? (sick.last_day ?? to) : to;
    if (end < start) continue;
    if (mapped.size && !mapped.has("SJK")) issues.push({ kind: "missing_wage_code", detail: "SJK", employee_id: sick.employee_id });
    for (let d = new Date(`${start}T12:00:00Z`); d <= new Date(`${end}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
      const day = d.toISOString().slice(0, 10);
      push({
        store_id: emp.store_id, employee_id: sick.employee_id, employment_id: emp.id,
        line_type: "SJK", line_date: day, quantity: 1, extent_pct: 100,
        cost_center: emp.cost_center ?? null, source_ref: sick.id, source_type: "sick_period",
        note: sick.karens_applied && day === sick.first_day ? "Karensavdrag hanteras i Fortnox" : null,
      });
    }
  }

  // Förmåner
  const attendanceDays = new Map<string, Set<string>>();
  (attestations as Attestation[]).forEach((att) => {
    const days = attendanceDays.get(att.employee_id);
    if (days) days.add(att.date);
    else attendanceDays.set(att.employee_id, new Set([att.date]));
  });

  for (const benefit of benefits as {
    id: string; employee_id: string; employment_id: string | null; store_id: string | null; benefit_type: string;
    basis: number | null; basis_unit: string | null; calculation_rule: Record<string, number | string>; meals_included: boolean;
    valid_from: string; valid_to: string | null;
  }[]) {
    const emp = employmentByEmployee.get(benefit.employee_id);
    if (!emp) continue;
    if (benefit.valid_to && benefit.valid_to < from) continue;
    const lineDate = to;
    if (benefit.benefit_type === "sjukvardsforsakring") {
      const taxableShare = Number(benefit.calculation_rule?.taxable_share ?? 0.6);
      const monthly = round2((Number(benefit.basis ?? 0) * taxableShare) / 12);
      push({
        store_id: benefit.store_id ?? emp.store_id, employee_id: benefit.employee_id, employment_id: benefit.employment_id ?? emp.id,
        line_type: "FORMAN_SJUKVARD", line_date: lineDate, quantity: 1, unit_amount: monthly,
        cost_center: emp.cost_center ?? null, source_ref: benefit.id, source_type: "benefit",
        note: `${Math.round(taxableShare * 100)} % av premien / 12`, preliminary_cost: monthly,
      });
    } else if (benefit.benefit_type === "kostformån" || benefit.benefit_type === "kostforman") {
      const perDay = Number(benefit.calculation_rule?.per_day ?? 124);
      const days = benefit.meals_included
        ? (attendanceDays.get(benefit.employee_id)?.size ?? 0)
        : Number(benefit.calculation_rule?.manual_days ?? 0);
      if (days > 0) {
        push({
          store_id: benefit.store_id ?? emp.store_id, employee_id: benefit.employee_id, employment_id: benefit.employment_id ?? emp.id,
          line_type: "FORMAN_KOST", line_date: lineDate, quantity: days, unit_amount: perDay,
          cost_center: emp.cost_center ?? null, source_ref: benefit.id, source_type: "benefit",
          note: benefit.meals_included ? "Dagar från attesterad närvaro" : "Manuellt antal dagar",
          preliminary_cost: round2(days * perDay),
        });
      }
    } else if (benefit.benefit_type === "friskvard") {
      const amount = Number(benefit.basis ?? 0);
      const limit = Number(benefit.calculation_rule?.tax_free_limit ?? 5000);
      if (amount > limit) {
        issues.push({ kind: "wellness_over_limit", detail: `Friskvård ${amount} kr överstiger ${limit} kr — hela beloppet blir skattepliktigt`, employee_id: benefit.employee_id });
      }
      push({
        store_id: benefit.store_id ?? emp.store_id, employee_id: benefit.employee_id, employment_id: benefit.employment_id ?? emp.id,
        line_type: amount > limit ? "FORMAN_FRISKVARD_SKATTEPLIKTIG" : "ERSATTNING_FRISKVARD",
        line_date: lineDate, quantity: 1, unit_amount: amount,
        cost_center: emp.cost_center ?? null, source_ref: benefit.id, source_type: "benefit",
        preliminary_cost: amount,
      });
    } else {
      push({
        store_id: benefit.store_id ?? emp.store_id, employee_id: benefit.employee_id, employment_id: benefit.employment_id ?? emp.id,
        line_type: `FORMAN_${benefit.benefit_type.toUpperCase()}`, line_date: lineDate, quantity: 1,
        unit_amount: Number(benefit.basis ?? 0), cost_center: emp.cost_center ?? null,
        source_ref: benefit.id, source_type: "benefit", preliminary_cost: Number(benefit.basis ?? 0),
      });
    }
  }

  // Avdrag
  for (const ded of deductions as {
    id: string; employee_id: string; employment_id: string | null; store_id: string | null;
    deduction_type: string; amount: number; amount_period: string; valid_to: string | null;
  }[]) {
    const emp = employmentByEmployee.get(ded.employee_id);
    if (!emp) continue;
    if (ded.valid_to && ded.valid_to < from) continue;
    push({
      store_id: ded.store_id ?? emp.store_id, employee_id: ded.employee_id, employment_id: ded.employment_id ?? emp.id,
      line_type: `AVDRAG_${ded.deduction_type.toUpperCase()}`, line_date: to, quantity: 1,
      unit_amount: -Math.abs(Number(ded.amount ?? 0)), cost_center: emp.cost_center ?? null,
      source_ref: ded.id, source_type: "deduction", preliminary_cost: -Math.abs(Number(ded.amount ?? 0)),
    });
  }

  // Personer utan Fortnox-koppling hamnar i felkön
  employmentByEmployee.forEach((emp, employeeId) => {
    if (!emp.fortnox_employee_id) {
      issues.push({ kind: "missing_fortnox_employee_id", detail: "Anställningsnummer/Fortnox-id saknas", employee_id: employeeId });
    }
  });

  // Idempotens: byt ut icke-exporterade rader
  const { error: delErr } = await db
    .from("payroll_lines")
    .delete()
    .eq("period_id", periodRow.id)
    .in("export_status", ["pending", "error"]);
  if (delErr) return json({ error: delErr.message }, 500);

  if (lines.length > 0) {
    for (let i = 0; i < lines.length; i += 500) {
      const { error } = await db.from("payroll_lines").insert(lines.slice(i, i + 500));
      if (error) return json({ error: error.message }, 500);
    }
  }

  const blocking = issues.filter((i) => i.kind !== "wellness_over_limit").length;
  await db
    .from("payroll_periods")
    .update({
      status: blocking === 0 && unlocked.length === 0 ? "computed" : "open",
      computed_at: new Date().toISOString(),
    })
    .eq("id", periodRow.id);

  return json({
    period_id: periodRow.id,
    period,
    lines: lines.length,
    unlocked_stores: unlocked,
    issues,
    status: blocking === 0 && unlocked.length === 0 ? "computed" : "open",
  });
});
