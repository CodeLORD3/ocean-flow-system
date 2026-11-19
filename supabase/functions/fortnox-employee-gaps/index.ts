// Fyller luckor i anställningsuppgifter från Fortnox Lön (skattetabell, kolumn, födelsedatum, timlön/månadslön).
// Läser bara från Fortnox. Skriver aldrig över befintliga värden – avvikelser rapporteras för granskning.
// Personnummer lagras aldrig; endast födelsedatum härleds.
import { adminClient, requireUser, fortnoxRequest, json, corsHeaders, LEGAL_ENTITIES } from "../_shared/fortnox.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (v: unknown) => String(v ?? "").trim().replace(/^0+(?=\d)/, "");
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export function birthDateFromPnr(pnr: string | null | undefined, today = new Date()): string | null {
  if (!pnr) return null;
  const plus = pnr.includes("+");
  const d = pnr.replace(/\D/g, "");
  let y: number, m: number, day: number;
  if (d.length === 12) {
    y = +d.slice(0, 4); m = +d.slice(4, 6); day = +d.slice(6, 8);
  } else if (d.length === 10) {
    const yy = +d.slice(0, 2); m = +d.slice(2, 4); day = +d.slice(4, 6);
    const cy = today.getFullYear();
    y = Math.floor(cy / 100) * 100 + yy;
    if (y > cy) y -= 100;
    if (plus) y -= 100;
  } else return null;
  if (day > 60) day -= 60; // samordningsnummer
  if (m < 1 || m > 12 || day < 1 || day > 31) return null;
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const dt = new Date(iso + "T00:00:00Z");
  return dt.getUTCDate() === day ? iso : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Metoden stöds inte" }, 405);
  const user = await requireUser(req);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => null);
  const entity = typeof body?.legal_entity_code === "string" ? body.legal_entity_code.trim() : "";
  const mode = body?.mode === "fill" ? "fill" : body?.mode === "plan" ? "plan" : "";
  if (!LEGAL_ENTITIES[entity]) return json({ error: "Okänt bolag" }, 400);
  if (!mode) return json({ error: "Ogiltigt läge" }, 400);

  const sb = adminClient();
  const [{ data: isAdmin }, { data: isPa }, { data: access }] = await Promise.all([
    sb.rpc("has_role", { _user_id: user.id, _role: "admin" }),
    sb.rpc("is_platform_admin", { _user_id: user.id }),
    sb.rpc("has_company_access", { _user_id: user.id, _legal_entity_id: entity }),
  ]);
  if (!(isAdmin || isPa) || !access) return json({ error: "Endast admin med åtkomst till bolaget" }, 403);

  try {
    // 1. Alla anställda i Fortnox (lista), sedan detalj per anställd vi har kopplad.
    const fnList: any[] = [];
    for (let page = 1; page <= 50; page++) {
      const res = await fortnoxRequest<any>(sb, entity, "GET", `/employees?limit=100&page=${page}`);
      const list: any[] = res?.Employees ?? [];
      fnList.push(...list);
      const tp = res?.MetaInformation?.["@TotalPages"];
      if (!list.length || !tp || page >= tp) break;
    }
    const fnIdByNorm = new Map<string, string>();
    for (const e of fnList) {
      const id = String(e.EmployeeId ?? e.EmployeeID ?? "");
      if (id) fnIdByNorm.set(norm(id), id);
    }

    const { data: emps, error } = await sb.from("employments")
      .select("id, employee_id, pay_type, fortnox_employee_id, tax_type, tax_table, tax_column, monthly_salary, hourly_rate, employees!inner(id, first_name, last_name, birth_date)")
      .eq("legal_entity_id", entity).eq("is_active", true);
    if (error) throw new Error(error.message);

    const report: any[] = [];
    let filled = 0;
    for (const em of (emps ?? []) as any[]) {
      const name = `${em.employees.first_name ?? ""} ${em.employees.last_name ?? ""}`.trim();
      const row: any = { employment_id: em.id, name, fortnox_employee_id: em.fortnox_employee_id, fills: {}, employee_fills: {}, mismatches: [], corrections: [], status: "ok" };
      if (!em.fortnox_employee_id) { row.status = "saknar_fortnox_nummer"; report.push(row); continue; }
      const fid = fnIdByNorm.get(norm(em.fortnox_employee_id));
      if (!fid) { row.status = "finns_inte_i_fortnox"; report.push(row); continue; }

      await sleep(260); // Fortnox: max 25 anrop / 5 s
      const det = await fortnoxRequest<any>(sb, entity, "GET", `/employees/${encodeURIComponent(fid)}`, undefined, { quiet429: true });
      const f = det?.Employee ?? {};
      const fTable = f.TaxTable ? String(f.TaxTable).trim() : null;
      const fCol = num(f.TaxColumn);
      const fBirth = birthDateFromPnr(f.PersonalIdentityNumber);
      const fMonthly = num(f.MonthlySalary);
      const fHourly = num(f.HourlyPay);
      row.fortnox = { tax_table: fTable, tax_column: fCol, birth_date: fBirth ? "finns" : null, salary_form: f.SalaryForm ?? null, tax_allowance: f.TaxAllowance ?? null, non_recurring_tax: f.NonRecurringTax ?? null, auto_non_recurring_tax: f.AutoNonRecurringTax ?? null, monthly_salary: fMonthly, hourly_pay: fHourly, inactive: f.Inactive === true };

      const cmp = (field: string, ours: unknown, theirs: unknown, target: "fills" | "employee_fills", ok: boolean) => {
        if (theirs === null || theirs === undefined || theirs === "" || !ok) return;
        if (ours === null || ours === undefined || ours === "") row[target][field] = theirs;
        else if (String(ours) !== String(theirs)) row.mismatches.push({ field, makrilltrade: ours, fortnox: field === "birth_date" ? "annat datum" : theirs });
      };
      const fType = ["HUV", "EXT", "STU", "TMP", "EJ"].includes(f.TaxAllowance) ? f.TaxAllowance : null;
      // Skatt: Fortnox Lön drar skatten, så skattetyp, tabell och kolumn följer Fortnox (även rättning).
      if (fType && em.tax_type !== fType) {
        row.fills.tax_type = fType;
        if (em.tax_type) row.corrections.push({ field: "tax_type", from: em.tax_type, to: fType });
      }
      if (fType === "HUV") {
        const fTableNum = fTable ? Number(fTable) : null;
        if (fTableNum && em.tax_table !== fTableNum) {
          row.fills.tax_table = fTableNum;
          if (em.tax_table !== null) row.corrections.push({ field: "tax_table", from: em.tax_table, to: fTableNum });
        }
        if (fCol && fCol > 0 && em.tax_column !== fCol) {
          row.fills.tax_column = fCol;
          if (em.tax_column !== null) row.corrections.push({ field: "tax_column", from: em.tax_column, to: fCol });
        }
      }
      cmp("birth_date", em.employees.birth_date, fBirth, "employee_fills", true);
      // Lön: fylls bara när den saknas – avvikelser lämnas till en människa.
      if (em.pay_type === "monthly") cmp("monthly_salary", em.monthly_salary || null, fMonthly, "fills", (fMonthly ?? 0) > 0);
      else cmp("hourly_rate", em.hourly_rate, fHourly, "fills", (fHourly ?? 0) > 0);

      const hasFill = Object.keys(row.fills).length || Object.keys(row.employee_fills).length;
      if (hasFill) row.status = mode === "fill" ? "ifylld" : "kan_fyllas";
      else if (row.mismatches.length) row.status = "avvikelse";

      if (mode === "fill" && hasFill) {
        if (Object.keys(row.fills).length) {
          // Lönefält skrivs bara om de fortfarande är tomma; skattefält följer Fortnox.
          let q = sb.from("employments").update(row.fills).eq("id", em.id);
          for (const k of ["monthly_salary", "hourly_rate"]) if (k in row.fills) q = q.is(k, null);
          const { error: uErr } = await q;
          if (uErr) { row.status = "fel"; row.error = uErr.message; }
        }
        if (row.status !== "fel" && Object.keys(row.employee_fills).length) {
          const { error: eErr } = await sb.from("employees").update(row.employee_fills).eq("id", em.employee_id).is("birth_date", null);
          if (eErr) { row.status = "fel"; row.error = eErr.message; }
        }
        if (row.status === "ifylld") filled++;
      }
      if (row.employee_fills.birth_date) row.employee_fills.birth_date = "från personnummer";
      report.push(row);
    }

    const by = (s: string) => report.filter((r) => r.status === s).length;
    return json({
      ok: true, mode, entity,
      summary: {
        active: report.length, fortnox_employees: fnList.length, filled,
        kan_fyllas: by("kan_fyllas"), avvikelse: report.filter((r) => r.mismatches.length).length,
        rattade_skatt: report.filter((r) => r.corrections?.length).length,
        inaktiv_i_fortnox: report.filter((r) => r.fortnox?.inactive).length,
        saknar_fortnox_nummer: by("saknar_fortnox_nummer"), finns_inte_i_fortnox: by("finns_inte_i_fortnox"), fel: by("fel"),
      },
      report,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
